begin;

create or replace function public.get_operations_driver_statistics(p_from date,p_to date)
returns table(driver_id uuid,driver_name text,assigned_runs bigint,completed_runs bigint,open_incidents bigint,last_location_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select dr.id,dr.display_name,
      count(distinct dt.id) filter(where d.id is not null),
      count(distinct dt.id) filter(where d.id is not null and js.status='completed'),
      count(distinct oi.id) filter(where d.id is not null and oi.resolved_at is null),
      max(lp.recorded_at)
    from public.driver_resources dr
    left join public.dispatch_tasks dt on dt.driver_id=dr.id
    left join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id
    left join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id
    left join public.departures d on d.id=vg.departure_id and (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to
    left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
    left join public.operational_incidents oi on oi.vehicle_group_id=vg.id
    left join lateral(
      select recorded_at
      from public.driver_location_points
      where vehicle_group_id=vg.id
      order by recorded_at desc
      limit 1
    ) lp on true
    where public.is_operations() and dr.status<>'suspended'
    group by dr.id,dr.display_name
    order by 4 desc,3 desc,dr.display_name;
end;
$$;

create or replace function public.get_operations_release_status()
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query select
    jsonb_build_object(
      'requiredDatabaseMigration','202609090099',
      'latestManifest',(select to_jsonb(m) - 'recorded_by' from public.release_manifests m order by m.deployed_at desc limit 1),
      'functionChecksums',jsonb_build_object(
        'list_public_product_catalog',md5(pg_get_functiondef('public.list_public_product_catalog()'::regprocedure)),
        'list_sellable_departures',md5(pg_get_functiondef('public.list_sellable_departures()'::regprocedure)),
        'is_departure_sellable',md5(pg_get_functiondef('public.is_departure_sellable(uuid,timestamp with time zone)'::regprocedure))
      )
    )
    from (select 1) as t;
end;
$$;

commit;
