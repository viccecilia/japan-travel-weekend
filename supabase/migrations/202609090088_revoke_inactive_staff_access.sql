begin;

alter table public.account_audit_events drop constraint if exists account_audit_events_action_check;
alter table public.account_audit_events add constraint account_audit_events_action_check check(action in ('profile_updated','draft_abandoned','draft_expired','staff_application_approved','staff_application_rejected','staff_application_needs_information','staff_application_suspended','staff_access_revoked','route_catalog_patched','product_draft_saved','product_published'));
alter table public.account_audit_events drop constraint if exists account_audit_events_target_type_check;
alter table public.account_audit_events add constraint account_audit_events_target_type_check check(target_type in ('account_profile','booking_draft','staff_application','account','trip'));

alter table public.staff_assignments
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id),
  add column if not exists revocation_reason text check(revocation_reason is null or length(revocation_reason)<=500);

create or replace function public.is_active_group_staff(p_account uuid,target uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1
    from public.staff_assignments sa
    join public.profiles p on p.id=sa.staff_id
    left join public.driver_resources dr on dr.account_id=sa.staff_id
    where sa.vehicle_group_id=target
      and sa.staff_id=p_account
      and sa.revoked_at is null
      and sa.role in ('driver','guide','operations')
      and p.role in ('driver','guide','operations')
      and (p.role='operations' or (p.role in ('driver','guide') and dr.status='available'))
  )
$$;

create or replace function public.is_group_staff(target uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$select public.is_active_group_staff(auth.uid(),target)$$;

create or replace function public.can_read_assistance_projection(target_order uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.is_order_owner(target_order)
    or public.is_operations()
    or exists(
      select 1 from public.vehicle_group_orders vgo
      where vgo.order_id=target_order and public.is_group_staff(vgo.vehicle_group_id)
    )
$$;

create or replace function public.operations_revoke_staff_access(p_account uuid,p_reason text default '')
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if length(trim(coalesce(p_reason,'')))>500 then raise exception 'invalid reason'; end if;
  update public.staff_assignments
     set revoked_at=now(),revoked_by=auth.uid(),revocation_reason=trim(coalesce(p_reason,''))
   where staff_id=p_account and revoked_at is null;
  get diagnostics changed=row_count;
  update public.driver_location_sessions set stopped_at=coalesce(stopped_at,now()),updated_at=now() where staff_id=p_account and stopped_at is null;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'staff_access_revoked','account',p_account,jsonb_build_object('reason',trim(coalesce(p_reason,'')),'assignmentsRevoked',changed));
  return changed;
end$$;

create or replace function public.operations_review_staff_application(p_application uuid,p_decision text,p_note text default '')
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.staff_account_applications%rowtype;revoked integer:=0;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_decision not in ('approved','rejected','needs_information','suspended') or length(trim(coalesce(p_note,'')))>500 then raise exception 'invalid review'; end if;
  select * into item from public.staff_account_applications where id=p_application for update;
  if not found then raise exception 'application not found'; end if;
  if p_decision='approved' then
    update public.profiles set role=item.requested_role::public.app_role,updated_at=now() where id=item.account_id and role='passenger';
    if not found then raise exception 'account already has another role'; end if;
    insert into public.driver_resources(account_id,display_name,languages,status,service_role)
    select item.account_id,coalesce(nullif(item.applicant_name,''),nullif(p.display_name,''),'工作人员'),'{}'::text[],'available',item.requested_role
    from public.profiles p where p.id=item.account_id
    on conflict(account_id) do update set display_name=excluded.display_name,status='available',service_role=excluded.service_role,updated_at=now();
  elsif p_decision in ('rejected','suspended') then
    update public.staff_assignments set revoked_at=now(),revoked_by=auth.uid(),revocation_reason=coalesce(nullif(trim(p_note),''),p_decision)
      where staff_id=item.account_id and revoked_at is null;
    get diagnostics revoked=row_count;
    update public.driver_location_sessions set stopped_at=coalesce(stopped_at,now()),updated_at=now() where staff_id=item.account_id and stopped_at is null;
    update public.profiles set role='passenger',updated_at=now() where id=item.account_id and role in ('driver','guide');
    update public.driver_resources set status=case when p_decision='suspended' then 'suspended'::public.driver_resource_status else 'unavailable'::public.driver_resource_status end,updated_at=now() where account_id=item.account_id;
  end if;
  update public.staff_account_applications set status=p_decision,review_note=trim(coalesce(p_note,'')),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_application;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'staff_application_'||p_decision,'staff_application',p_application,jsonb_build_object('accountId',item.account_id,'requestedRole',item.requested_role,'assignmentsRevoked',revoked));
  return true;
end$$;

create or replace function public.get_staff_portal_tasks()
returns table(
  staff_assignment_id uuid,assignment_role text,vehicle_group_id uuid,room_id uuid,room_status text,
  departure_id uuid,trip_title text,departs_at timestamptz,chat_opens_at timestamptz,
  meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_sequence integer,
  vehicle_type text,vehicle_label text,vehicle_capacity integer,booked_seats integer,passenger_count integer,
  boarded_count integer
)
language sql stable security definer set search_path=public,pg_temp as $$
  select sa.id,sa.role::text,vg.id,tr.id,tr.status,d.id,t.title,d.departs_at,d.chat_opens_at,
    d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,va.sequence,va.vehicle_type,va.vehicle_label,va.capacity,
    coalesce((select sum(o2.seat_count) from public.vehicle_group_orders vgo2 join public.orders o2 on o2.id=vgo2.order_id where vgo2.vehicle_group_id=vg.id and o2.status in ('paid','confirmed')),0)::integer,
    count(distinct p.id) filter(where o.status in ('paid','confirmed'))::integer,
    count(distinct p.id) filter(where o.status in ('paid','confirmed') and pc.status='boarded')::integer
  from public.staff_assignments sa join public.vehicle_groups vg on vg.id=sa.vehicle_group_id
  join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id join public.departures d on d.id=vg.departure_id
  join public.trips t on t.id=d.trip_id left join public.trip_rooms tr on tr.vehicle_group_id=vg.id
  left join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id left join public.orders o on o.id=vgo.order_id
  left join public.passengers p on p.order_id=o.id left join public.passenger_checkins pc on pc.passenger_id=p.id
  where sa.staff_id=auth.uid() and public.is_group_staff(vg.id)
  group by sa.id,vg.id,tr.id,d.id,t.id,va.id order by d.departs_at nulls last,va.sequence;
$$;

create or replace function public.publish_driver_location(p_vehicle_group uuid,p_latitude numeric,p_longitude numeric,p_accuracy_meters numeric,p_minutes integer default 15)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare session_id uuid;begin
  if auth.uid() is null or not public.is_group_staff(p_vehicle_group) or p_minutes not between 5 and 30 or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or (p_accuracy_meters is not null and p_accuracy_meters not between 0 and 1000) then raise exception 'invalid or unauthorized driver location';end if;
  if not exists(select 1 from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open') then raise exception 'open room required';end if;
  insert into public.driver_location_sessions as d(vehicle_group_id,staff_id,latitude,longitude,accuracy_meters,started_at,updated_at,expires_at,stopped_at) values(p_vehicle_group,auth.uid(),p_latitude,p_longitude,p_accuracy_meters,now(),now(),now()+make_interval(mins=>p_minutes),null)
  on conflict(vehicle_group_id,staff_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy_meters=excluded.accuracy_meters,started_at=case when d.stopped_at is not null or d.expires_at<=now() then now() else d.started_at end,updated_at=now(),expires_at=excluded.expires_at,stopped_at=null returning id into session_id;return session_id;end$$;

create or replace function public.get_message_translation_context(p_account uuid,p_message uuid,p_target_language text)
returns table(message_id uuid,source_content text,source_language text,cached_translation text) language sql stable security definer set search_path=public,pg_temp as $$
  select m.id,coalesce(m.original_content,m.content),m.source_language,t.translated_content from public.trip_room_messages m join public.trip_rooms r on r.id=m.trip_room_id left join public.trip_room_message_translations t on t.message_id=m.id and t.target_language=p_target_language
  where m.id=p_message and p_target_language in ('zh-CN','zh-TW','ja','en','vi','ne') and (exists(select 1 from public.profiles p where p.id=p_account and p.role='operations') or public.is_active_group_staff(p_account,r.vehicle_group_id) or exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=r.vehicle_group_id and o.account_id=p_account and o.status in ('paid','confirmed')));
$$;

revoke all on function public.is_active_group_staff(uuid,uuid),public.is_group_staff(uuid),public.can_read_assistance_projection(uuid),public.operations_revoke_staff_access(uuid,text),public.operations_review_staff_application(uuid,text,text),public.get_staff_portal_tasks(),public.publish_driver_location(uuid,numeric,numeric,numeric,integer),public.get_message_translation_context(uuid,uuid,text) from public,anon;
grant execute on function public.is_active_group_staff(uuid,uuid),public.is_group_staff(uuid),public.can_read_assistance_projection(uuid),public.get_staff_portal_tasks(),public.publish_driver_location(uuid,numeric,numeric,numeric,integer) to authenticated,service_role;
grant execute on function public.get_message_translation_context(uuid,uuid,text) to service_role;
grant execute on function public.operations_revoke_staff_access(uuid,text),public.operations_review_staff_application(uuid,text,text) to authenticated;

commit;
