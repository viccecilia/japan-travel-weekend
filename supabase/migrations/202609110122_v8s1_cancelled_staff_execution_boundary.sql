begin;

create or replace function public.is_vehicle_group_executable(p_vehicle_group uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1
    from public.vehicle_groups vg
    join public.departures d on d.id=vg.departure_id
    where vg.id=p_vehicle_group
      and d.status<>'cancelled'
      and not exists(
        select 1 from public.dispatch_tasks dt
        where dt.vehicle_assignment_id=vg.vehicle_assignment_id
          and dt.status='cancelled'
          and not exists(
            select 1 from public.dispatch_tasks active
            where active.vehicle_assignment_id=vg.vehicle_assignment_id
              and active.status in('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed')
          )
      )
  )
$$;

create or replace function public.guard_cancelled_vehicle_group_write()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_group uuid;
begin
  v_group:=coalesce(nullif(to_jsonb(new)->>'vehicle_group_id','')::uuid,nullif(to_jsonb(old)->>'vehicle_group_id','')::uuid);
  if v_group is not null and not public.is_vehicle_group_executable(v_group) then
    raise exception 'cancelled assignment is read only';
  end if;
  return new;
end$$;

drop trigger if exists guard_cancelled_staff_execution on public.staff_execution_events;
create trigger guard_cancelled_staff_execution before insert or update on public.staff_execution_events for each row execute function public.guard_cancelled_vehicle_group_write();
drop trigger if exists guard_cancelled_passenger_checkin on public.passenger_checkins;
create trigger guard_cancelled_passenger_checkin before insert or update on public.passenger_checkins for each row execute function public.guard_cancelled_vehicle_group_write();
drop trigger if exists guard_cancelled_journey_state on public.vehicle_group_journey_state;
create trigger guard_cancelled_journey_state before insert or update on public.vehicle_group_journey_state for each row execute function public.guard_cancelled_vehicle_group_write();
drop trigger if exists guard_cancelled_location_point on public.driver_location_points;
create trigger guard_cancelled_location_point before insert or update on public.driver_location_points for each row execute function public.guard_cancelled_vehicle_group_write();

drop function if exists public.get_staff_portal_tasks();
create function public.get_staff_portal_tasks()
returns table(staff_assignment_id uuid,assignment_role text,vehicle_group_id uuid,room_id uuid,room_status text,departure_id uuid,trip_title text,departs_at timestamptz,chat_opens_at timestamptz,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_sequence integer,vehicle_type text,vehicle_label text,vehicle_capacity integer,booked_seats integer,passenger_count integer,boarded_count integer,journey_status text)
language sql stable security definer set search_path=public,pg_temp as $$
 select sa.id,sa.role::text,vg.id,tr.id,
 case when not public.is_vehicle_group_executable(vg.id) then 'closed' else tr.status end,
 d.id,t.title,d.departs_at,d.chat_opens_at,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,va.sequence,va.vehicle_type,va.vehicle_label,va.capacity,
 coalesce((select sum(o2.seat_count) from public.vehicle_group_orders vgo2 join public.orders o2 on o2.id=vgo2.order_id where vgo2.vehicle_group_id=vg.id and o2.status in('paid','confirmed')),0)::integer,
 count(distinct p.id)filter(where o.status in('paid','confirmed'))::integer,count(distinct p.id)filter(where o.status in('paid','confirmed')and pc.status='boarded')::integer,
 case when not public.is_vehicle_group_executable(vg.id) then 'cancelled' else coalesce(js.status,'pending') end
 from public.staff_assignments sa join public.vehicle_groups vg on vg.id=sa.vehicle_group_id join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id join public.departures d on d.id=vg.departure_id join public.trips t on t.id=d.trip_id
 left join public.trip_rooms tr on tr.vehicle_group_id=vg.id left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id left join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id left join public.orders o on o.id=vgo.order_id left join public.passengers p on p.order_id=o.id left join public.passenger_checkins pc on pc.passenger_id=p.id
 where sa.staff_id=auth.uid() and public.is_group_staff(vg.id) group by sa.id,vg.id,tr.id,d.id,t.id,va.id,js.status order by d.departs_at nulls last,va.sequence
$$;

create or replace function public.close_cancelled_departure_staff_runtime()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='cancelled' and old.status is distinct from new.status then
    update public.trip_rooms set status='closed' where vehicle_group_id in(select id from public.vehicle_groups where departure_id=new.id) and status<>'closed';
    update public.driver_location_sessions set stopped_at=coalesce(stopped_at,now()),updated_at=now() where vehicle_group_id in(select id from public.vehicle_groups where departure_id=new.id) and stopped_at is null;
    update public.vehicle_group_meeting_state set status='cancelled',updated_at=now() where vehicle_group_id in(select id from public.vehicle_groups where departure_id=new.id) and status in('scheduled','active');
  end if;
  return new;
end$$;
drop trigger if exists close_cancelled_departure_staff_runtime_trigger on public.departures;
create trigger close_cancelled_departure_staff_runtime_trigger after update of status on public.departures for each row execute function public.close_cancelled_departure_staff_runtime();

create or replace function public.close_revoked_dispatch_staff_runtime()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='cancelled' and old.status is distinct from new.status and not exists(
    select 1 from public.dispatch_tasks active where active.vehicle_assignment_id=new.vehicle_assignment_id and active.id<>new.id
      and active.status in('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed')
  ) then
    update public.trip_rooms set status='closed' where vehicle_group_id in(select id from public.vehicle_groups where vehicle_assignment_id=new.vehicle_assignment_id) and status<>'closed';
    update public.driver_location_sessions set stopped_at=coalesce(stopped_at,now()),updated_at=now() where vehicle_group_id in(select id from public.vehicle_groups where vehicle_assignment_id=new.vehicle_assignment_id) and stopped_at is null;
    update public.vehicle_group_meeting_state set status='cancelled',updated_at=now() where vehicle_group_id in(select id from public.vehicle_groups where vehicle_assignment_id=new.vehicle_assignment_id) and status in('scheduled','active');
  end if;
  return new;
end$$;
drop trigger if exists close_revoked_dispatch_staff_runtime_trigger on public.dispatch_tasks;
create trigger close_revoked_dispatch_staff_runtime_trigger after update of status on public.dispatch_tasks for each row execute function public.close_revoked_dispatch_staff_runtime();

revoke all on function public.is_vehicle_group_executable(uuid),public.guard_cancelled_vehicle_group_write(),public.close_cancelled_departure_staff_runtime(),public.close_revoked_dispatch_staff_runtime(),public.get_staff_portal_tasks() from public,anon;
grant execute on function public.is_vehicle_group_executable(uuid),public.get_staff_portal_tasks() to authenticated,service_role;

commit;
