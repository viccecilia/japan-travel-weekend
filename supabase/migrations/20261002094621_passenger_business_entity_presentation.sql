begin;

-- The Passenger client needs a stable route identity in addition to the
-- historical, source-locale operational title.  Locale selection remains a
-- presentation concern so an order snapshot is never rewritten.
drop function if exists public.get_passenger_trip_context_v2(uuid);
create function public.get_passenger_trip_context_v2(p_vehicle_group uuid)
returns table(trip_slug text,trip_title text,itinerary jsonb,return_at timestamptz,staff_name text,staff_role text,staff_phone text,vehicle_type text,vehicle_label text,vehicle_color text,vehicle_photo_url text)
language sql stable security definer set search_path=public,pg_temp as $$
  select t.slug,t.title,
    case when jsonb_typeof(t.content->'itinerary')='array' then t.content->'itinerary' else '[]'::jsonb end,
    d.ends_at,staff.staff_name,staff.staff_role,staff.staff_phone,va.vehicle_type,va.vehicle_label,fv.public_color,fv.public_photo_url
  from public.vehicle_groups vg
  join public.departures d on d.id=vg.departure_id
  join public.trips t on t.id=d.trip_id
  join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  left join lateral (
    select dt.fleet_vehicle_id from public.dispatch_tasks dt
    where dt.vehicle_assignment_id=va.id and dt.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed')
    order by dt.updated_at desc limit 1
  ) active_task on true
  left join public.fleet_vehicles fv on fv.id=active_task.fleet_vehicle_id
  left join lateral (
    select coalesce(nullif(dr.display_name,''),nullif(p.display_name,''),'当班工作人员') as staff_name,
      coalesce(dr.service_role,sa.role::text) as staff_role,dr.public_phone as staff_phone
    from public.staff_assignments sa
    join public.profiles p on p.id=sa.staff_id
    left join public.driver_resources dr on dr.account_id=sa.staff_id
    where sa.vehicle_group_id=vg.id
    order by case coalesce(dr.service_role,sa.role::text) when 'guide' then 0 when 'driver_guide' then 1 when 'driver' then 2 else 3 end,sa.id limit 1
  ) staff on true
  where vg.id=p_vehicle_group and exists(
    select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id
    where vgo.vehicle_group_id=vg.id and o.account_id=auth.uid() and o.status in ('paid','confirmed')
  );
$$;

revoke all on function public.get_passenger_trip_context_v2(uuid) from public,anon;
grant execute on function public.get_passenger_trip_context_v2(uuid) to authenticated,service_role;

commit;
