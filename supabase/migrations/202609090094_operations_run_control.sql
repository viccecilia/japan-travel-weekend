begin;

create table public.operational_incidents(
  id uuid primary key default gen_random_uuid(),
  departure_id uuid references public.departures(id) on delete set null,
  vehicle_group_id uuid references public.vehicle_groups(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  kind text not null check(kind in ('passenger_late','passenger_missing','staff_unresponsive','location_stale','vehicle_fault','notification_failed','payment_review','other')),
  severity text not null default 'medium' check(severity in ('low','medium','high','critical')),
  status text not null default 'confirmed' check(status in ('confirmed','in_progress','waiting_passenger','resolved')),
  summary text not null check(length(trim(summary)) between 3 and 300),
  owner_id uuid references public.profiles(id),
  due_at timestamptz,
  resolution text,
  deduplication_key text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index operational_incidents_open_dedup on public.operational_incidents(deduplication_key) where resolved_at is null and deduplication_key is not null;
alter table public.operational_incidents enable row level security;
revoke all on public.operational_incidents from public,anon,authenticated;
grant all on public.operational_incidents to service_role;
create policy operations_incident_read on public.operational_incidents for select to authenticated using(public.is_operations());

create or replace function public.operations_upsert_incident(p_kind text,p_severity text,p_summary text,p_departure uuid default null,p_vehicle_group uuid default null,p_order uuid default null,p_owner uuid default null,p_due_at timestamptz default null,p_deduplication_key text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_kind not in ('passenger_late','passenger_missing','staff_unresponsive','location_stale','vehicle_fault','notification_failed','payment_review','other') or p_severity not in ('low','medium','high','critical') or length(trim(p_summary)) not between 3 and 300 then raise exception 'invalid incident'; end if;
  insert into public.operational_incidents(departure_id,vehicle_group_id,order_id,kind,severity,summary,owner_id,due_at,deduplication_key,created_by)
  values(p_departure,p_vehicle_group,p_order,p_kind,p_severity,trim(p_summary),p_owner,p_due_at,nullif(trim(coalesce(p_deduplication_key,'')),''),auth.uid())
  on conflict(deduplication_key) where resolved_at is null and deduplication_key is not null do update set severity=excluded.severity,summary=excluded.summary,owner_id=coalesce(excluded.owner_id,public.operational_incidents.owner_id),due_at=coalesce(excluded.due_at,public.operational_incidents.due_at),updated_at=now()
  returning id into v_id;
  return v_id;
end$$;

create or replace function public.operations_resolve_incident(p_incident uuid,p_status text,p_resolution text,p_owner uuid default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_status not in ('confirmed','in_progress','waiting_passenger','resolved') then raise exception 'invalid status'; end if;
  if p_status='resolved' and length(trim(coalesce(p_resolution,'')))<3 then raise exception 'resolution required'; end if;
  update public.operational_incidents set status=p_status,resolution=nullif(trim(coalesce(p_resolution,'')),''),owner_id=coalesce(p_owner,owner_id),updated_at=now(),resolved_at=case when p_status='resolved' then now() else null end where id=p_incident;
  return found;
end$$;

create or replace function public.get_operations_daily_run_board(p_service_date date)
returns table(departure_id uuid,trip_title text,departs_at timestamptz,departure_status text,vehicle_group_id uuid,vehicle_label text,driver_name text,capacity integer,booked_seats bigint,arrived bigint,boarded bigint,journey_status text,current_stop text,open_incidents bigint,last_event_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,t.title,d.departs_at,d.status,vg.id,coalesce(fv.registration_identifier,va.vehicle_type||' #'||va.sequence),dr.display_name,va.capacity,
    coalesce(bookings.seats,0),coalesce(attendance.arrived,0),coalesce(attendance.boarded,0),
    coalesce(js.status,'preparing'),js.current_stop_name,coalesce(incidents.open_count,0),events.last_event_at
  from public.departures d join public.trips t on t.id=d.trip_id
  left join public.vehicle_groups vg on vg.departure_id=d.id
  left join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  left join public.dispatch_tasks dt on dt.vehicle_assignment_id=va.id and dt.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress')
  left join public.fleet_vehicles fv on fv.id=dt.fleet_vehicle_id
  left join public.driver_resources dr on dr.id=dt.driver_id
  left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
  left join lateral(select sum(o.seat_count)::bigint seats from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=vg.id and o.status in ('paid','confirmed')) bookings on true
  left join lateral(select count(*) filter(where pc.status in ('arrived','boarded'))::bigint arrived,count(*) filter(where pc.status='boarded')::bigint boarded from public.passenger_checkins pc where pc.vehicle_group_id=vg.id) attendance on true
  left join lateral(select count(*)::bigint open_count from public.operational_incidents oi where oi.vehicle_group_id=vg.id and oi.resolved_at is null) incidents on true
  left join lateral(select max(se.created_at) last_event_at from public.staff_execution_events se where se.vehicle_group_id=vg.id) events on true
  where public.is_operations() and (d.departs_at at time zone 'Asia/Tokyo')::date=p_service_date
  order by d.departs_at,va.sequence;
$$;

revoke all on function public.operations_upsert_incident(text,text,text,uuid,uuid,uuid,uuid,timestamptz,text),public.operations_resolve_incident(uuid,text,text,uuid),public.get_operations_daily_run_board(date) from public,anon;
grant execute on function public.operations_upsert_incident(text,text,text,uuid,uuid,uuid,uuid,timestamptz,text),public.operations_resolve_incident(uuid,text,text,uuid),public.get_operations_daily_run_board(date) to authenticated,service_role;

commit;
