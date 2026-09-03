begin;

create or replace function public.is_vehicle_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.vehicle_group_orders vgo
    join public.orders o on o.id=vgo.order_id
    where vgo.vehicle_group_id=target_group and o.account_id=auth.uid()
      and o.status in ('paid','confirmed')
  );
$$;

create or replace function public.deallocate_ineligible_order_fulfilment(p_order uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_group uuid;v_assignment uuid;v_status public.order_status;v_account uuid;
begin
  select vgo.vehicle_group_id,vg.vehicle_assignment_id,o.status,o.account_id into v_group,v_assignment,v_status,v_account
  from public.vehicle_group_orders vgo join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id join public.orders o on o.id=vgo.order_id
  where vgo.order_id=p_order for update of vgo;
  if v_group is null then return false; end if;
  if v_status in ('paid','confirmed') then return false; end if;
  update public.boarding_credentials bc set revoked_at=coalesce(bc.revoked_at,now())
    where bc.boarding_id in (select b.id from public.boardings b where b.order_id=p_order) and bc.revoked_at is null;
  update public.boardings set status='revoked',updated_at=now()
    where order_id=p_order and status in ('not_issued','issued');
  delete from public.vehicle_group_orders where order_id=p_order;
  if not exists(
    select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id
    where vgo.vehicle_group_id=v_group and o.account_id=v_account and o.status in ('paid','confirmed')
  ) then
    update public.location_shares set stopped_at=now()
      where vehicle_group_id=v_group and subject_id=v_account and stopped_at is null;
  end if;
  update public.vehicle_assignments va set booked_seats=coalesce((
    select sum(o.seat_count) from public.vehicle_group_orders vgo
    join public.orders o on o.id=vgo.order_id
    where vgo.vehicle_group_id=v_group and o.status in ('paid','confirmed')
  ),0) where va.id=v_assignment;
  return true;
end$$;

create or replace function public.deallocate_order_after_status_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('refunded','cancelled','expired') and old.status is distinct from new.status then
    perform public.deallocate_ineligible_order_fulfilment(new.id);
  end if;
  return new;
end$$;
drop trigger if exists deallocate_order_after_status_change_trigger on public.orders;
create trigger deallocate_order_after_status_change_trigger after update of status on public.orders
for each row execute function public.deallocate_order_after_status_change();

create or replace function public.get_accessible_trip_room()
returns table(room_id uuid,vehicle_group_id uuid,room_status text,opens_at timestamptz,departure_id uuid,departs_at timestamptz,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_sequence integer,vehicle_type text,vehicle_label text,vehicle_capacity integer,booked_seats integer,boarded_orders integer,total_orders integer)
language sql stable security definer set search_path=public,pg_temp as $$
  select r.id,vg.id,r.status,r.opens_at,d.id,d.departs_at,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,
    va.sequence,va.vehicle_type,va.vehicle_label,va.capacity,va.booked_seats,
    count(*) filter(where b.status='boarded')::integer,count(vgo.order_id)::integer
  from public.trip_rooms r join public.vehicle_groups vg on vg.id=r.vehicle_group_id
  join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id join public.departures d on d.id=vg.departure_id
  left join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id
  left join public.orders o on o.id=vgo.order_id left join public.boardings b on b.order_id=o.id
  where public.is_operations() or public.is_group_staff(vg.id) or public.is_vehicle_group_member(vg.id)
  group by r.id,vg.id,d.id,va.id order by d.departs_at nulls last,va.sequence limit 1;
$$;

create or replace function public.start_own_location_share(p_vehicle_group uuid,p_minutes integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare share_id uuid;
begin
  if auth.uid() is null or p_minutes not in (15,30) then raise exception 'invalid location share'; end if;
  if not public.is_vehicle_group_member(p_vehicle_group) then raise exception 'not an eligible vehicle group passenger'; end if;
  update public.location_shares set stopped_at=now() where vehicle_group_id=p_vehicle_group and subject_id=auth.uid() and stopped_at is null and expires_at>now();
  insert into public.location_shares(vehicle_group_id,subject_id,scope,started_at,expires_at,encrypted_location)
    values(p_vehicle_group,auth.uid(),'assigned_staff_only',now(),now()+make_interval(mins=>p_minutes),null) returning id into share_id;
  return share_id;
end$$;

create or replace function public.get_message_translation_context(p_account uuid,p_message uuid,p_target_language text)
returns table(message_id uuid,source_content text,source_language text,cached_translation text)
language sql stable security definer set search_path=public,pg_temp as $$
  select m.id,coalesce(m.original_content,m.content),m.source_language,t.translated_content
  from public.trip_room_messages m join public.trip_rooms r on r.id=m.trip_room_id
  left join public.trip_room_message_translations t on t.message_id=m.id and t.target_language=p_target_language
  where m.id=p_message and p_target_language in ('zh-CN','ja','en','vi','ne') and (
    exists(select 1 from public.profiles p where p.id=p_account and p.role='operations')
    or exists(select 1 from public.staff_assignments sa where sa.vehicle_group_id=r.vehicle_group_id and sa.staff_id=p_account)
    or exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=r.vehicle_group_id and o.account_id=p_account and o.status in ('paid','confirmed'))
  );
$$;

revoke all on function public.deallocate_ineligible_order_fulfilment(uuid),public.deallocate_order_after_status_change() from public,anon,authenticated;
grant execute on function public.deallocate_ineligible_order_fulfilment(uuid) to service_role;
revoke all on function public.deallocate_order_after_status_change() from service_role;
revoke all on function public.is_vehicle_group_member(uuid),public.get_accessible_trip_room(),public.start_own_location_share(uuid,integer) from public,anon;
grant execute on function public.is_vehicle_group_member(uuid),public.get_accessible_trip_room(),public.start_own_location_share(uuid,integer) to authenticated,service_role;
revoke all on function public.get_message_translation_context(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.get_message_translation_context(uuid,uuid,text) to service_role;

commit;
