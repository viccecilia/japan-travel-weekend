begin;

alter table public.staff_assignment_acknowledgements
  add column if not exists departure_schedule_version integer not null default 1;

create or replace function public.acknowledge_own_staff_assignment(p_staff_assignment uuid)
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare v_at timestamptz; v_version integer;
begin
  select d.schedule_version into v_version
  from public.staff_assignments sa
  join public.vehicle_groups vg on vg.id=sa.vehicle_group_id
  join public.departures d on d.id=vg.departure_id
  where sa.id=p_staff_assignment and sa.staff_id=auth.uid() and sa.revoked_at is null
    and public.is_vehicle_group_executable(sa.vehicle_group_id);
  if v_version is null then raise exception 'assignment is not available for acknowledgement'; end if;
  insert into public.staff_assignment_acknowledgements(staff_assignment_id,staff_id,acknowledged_at,departure_schedule_version)
  values(p_staff_assignment,auth.uid(),now(),v_version)
  on conflict(staff_assignment_id) do update set staff_id=excluded.staff_id,
    acknowledged_at=case when staff_assignment_acknowledgements.departure_schedule_version is distinct from excluded.departure_schedule_version then excluded.acknowledged_at else staff_assignment_acknowledgements.acknowledged_at end,
    departure_schedule_version=excluded.departure_schedule_version;
  select acknowledged_at into v_at from public.staff_assignment_acknowledgements where staff_assignment_id=p_staff_assignment and staff_id=auth.uid();
  return v_at;
end$$;

drop function if exists public.get_staff_portal_tasks();
create function public.get_staff_portal_tasks()
returns table(staff_assignment_id uuid,assignment_role text,vehicle_group_id uuid,room_id uuid,room_status text,departure_id uuid,trip_title text,departs_at timestamptz,chat_opens_at timestamptz,meeting_at timestamptz,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_sequence integer,vehicle_type text,vehicle_label text,vehicle_capacity integer,booked_seats integer,passenger_count integer,boarded_count integer,journey_status text,driver_name text,guide_name text,assignment_acknowledged boolean,assignment_acknowledged_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select sa.id,sa.role::text,vg.id,tr.id,case when not public.is_vehicle_group_executable(vg.id) then 'closed' else tr.status end,
 d.id,t.title,d.departs_at,d.chat_opens_at,coalesce(ms.meeting_at,d.departs_at),coalesce(ms.meeting_name,d.meeting_name),coalesce(ms.meeting_address,d.meeting_address),coalesce(ms.latitude,d.map_lat),coalesce(ms.longitude,d.map_lng),va.sequence,va.vehicle_type,va.vehicle_label,va.capacity,
 coalesce((select sum(o2.seat_count) from public.vehicle_group_orders vgo2 join public.orders o2 on o2.id=vgo2.order_id where vgo2.vehicle_group_id=vg.id and o2.status in('paid','confirmed')),0)::integer,
 count(distinct p.id)filter(where o.status in('paid','confirmed'))::integer,count(distinct p.id)filter(where o.status in('paid','confirmed')and pc.status='boarded')::integer,
 case when not public.is_vehicle_group_executable(vg.id) then 'cancelled' else coalesce(js.status,'pending') end,
 (select string_agg(coalesce(nullif(trim(dr.display_name),''),nullif(trim(sp.display_name),''),'司机'),'、' order by sa2.id) from public.staff_assignments sa2 join public.profiles sp on sp.id=sa2.staff_id left join public.driver_resources dr on dr.account_id=sa2.staff_id where sa2.vehicle_group_id=vg.id and sa2.revoked_at is null and sa2.role='driver'),
 (select string_agg(coalesce(nullif(trim(dr.display_name),''),nullif(trim(sp.display_name),''),'导游'),'、' order by sa2.id) from public.staff_assignments sa2 join public.profiles sp on sp.id=sa2.staff_id left join public.driver_resources dr on dr.account_id=sa2.staff_id where sa2.vehicle_group_id=vg.id and sa2.revoked_at is null and sa2.role='guide'),
 ack.staff_assignment_id is not null and ack.departure_schedule_version=d.schedule_version,case when ack.departure_schedule_version=d.schedule_version then ack.acknowledged_at else null end
 from public.staff_assignments sa join public.vehicle_groups vg on vg.id=sa.vehicle_group_id join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id join public.departures d on d.id=vg.departure_id join public.trips t on t.id=d.trip_id
 left join public.trip_rooms tr on tr.vehicle_group_id=vg.id left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id left join public.vehicle_group_meeting_state ms on ms.vehicle_group_id=vg.id left join public.staff_assignment_acknowledgements ack on ack.staff_assignment_id=sa.id
 left join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id left join public.orders o on o.id=vgo.order_id left join public.passengers p on p.order_id=o.id left join public.passenger_checkins pc on pc.passenger_id=p.id
 where sa.staff_id=auth.uid() and public.is_group_staff(vg.id) group by sa.id,vg.id,tr.id,d.id,t.id,va.id,js.status,ms.vehicle_group_id,ack.staff_assignment_id,ack.acknowledged_at,ack.departure_schedule_version order by d.departs_at nulls last,va.sequence
$$;

revoke all on function public.acknowledge_own_staff_assignment(uuid) from public,anon;
revoke all on function public.get_staff_portal_tasks() from public,anon;
grant execute on function public.acknowledge_own_staff_assignment(uuid) to authenticated,service_role;
grant execute on function public.get_staff_portal_tasks() to authenticated,service_role;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select '202609110126',now() where public.is_operations()
$$;
revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;
commit;
