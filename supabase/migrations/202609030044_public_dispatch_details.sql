begin;

alter table public.fleet_vehicles add column if not exists public_color text check(public_color is null or length(trim(public_color)) between 1 and 40);
alter table public.fleet_vehicles add column if not exists public_photo_url text check(public_photo_url is null or public_photo_url ~ '^https://[^[:space:]]+$');
alter table public.driver_resources add column if not exists service_role text not null default 'driver' check(service_role in ('driver','guide','driver_guide'));
alter table public.driver_resources add column if not exists public_phone text check(public_phone is null or length(trim(public_phone)) between 5 and 40);

create or replace function public.operations_create_vehicle_v2(p_registration text,p_vehicle_type text,p_external_dispatch_id text,p_public_color text,p_public_photo_url text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare created_id uuid;begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if length(trim(p_registration)) not between 2 and 40 or length(trim(p_public_color)) not between 1 and 40 or not exists(select 1 from public.vehicle_type_configs where type_key=p_vehicle_type and active) then raise exception 'invalid vehicle'; end if;
  if nullif(trim(coalesce(p_public_photo_url,'')),'') is not null and trim(p_public_photo_url) !~ '^https://[^[:space:]]+$' then raise exception 'invalid public vehicle photo'; end if;
  insert into public.fleet_vehicles(registration_identifier,vehicle_type_key,external_dispatch_id,public_color,public_photo_url)
  values(trim(p_registration),p_vehicle_type,nullif(trim(p_external_dispatch_id),''),trim(p_public_color),nullif(trim(coalesce(p_public_photo_url,'')),'')) returning id into created_id;return created_id;
end$$;

create or replace function public.operations_create_driver_v2(p_display_name text,p_external_dispatch_id text,p_vehicle_types text[],p_languages text[],p_available_from timestamptz,p_available_until timestamptz,p_service_role text,p_public_phone text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare created_id uuid;begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if length(trim(p_display_name)) not between 1 and 120 or p_service_role not in ('driver','guide','driver_guide') or length(trim(p_public_phone)) not between 5 and 40 or coalesce(array_length(p_vehicle_types,1),0)=0 or p_available_until<=p_available_from or exists(select 1 from unnest(p_vehicle_types) t where not exists(select 1 from public.vehicle_type_configs v where v.type_key=t and v.active)) then raise exception 'invalid driver'; end if;
  insert into public.driver_resources(display_name,external_dispatch_id,languages,service_role,public_phone) values(trim(p_display_name),nullif(trim(p_external_dispatch_id),''),coalesce(p_languages,'{}'),p_service_role,trim(p_public_phone)) returning id into created_id;
  insert into public.driver_vehicle_qualifications(driver_id,vehicle_type_key) select created_id,t from unnest(p_vehicle_types) t;
  insert into public.driver_availability_windows(driver_id,starts_at,ends_at) values(created_id,p_available_from,p_available_until);return created_id;
end$$;

create or replace function public.get_passenger_trip_context_v2(p_vehicle_group uuid)
returns table(trip_title text,itinerary jsonb,return_at timestamptz,staff_name text,staff_role text,staff_phone text,vehicle_type text,vehicle_label text,vehicle_color text,vehicle_photo_url text)
language sql stable security definer set search_path=public,pg_temp as $$
  select t.title,case when jsonb_typeof(t.content->'itinerary')='array' then t.content->'itinerary' else '[]'::jsonb end,d.ends_at,
    staff.staff_name,staff.staff_role,staff.staff_phone,va.vehicle_type,va.vehicle_label,fv.public_color,fv.public_photo_url
  from public.vehicle_groups vg join public.departures d on d.id=vg.departure_id join public.trips t on t.id=d.trip_id join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  left join lateral (select dt.fleet_vehicle_id from public.dispatch_tasks dt where dt.vehicle_assignment_id=va.id and dt.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed') order by dt.updated_at desc limit 1) active_task on true
  left join public.fleet_vehicles fv on fv.id=active_task.fleet_vehicle_id
  left join lateral (
    select coalesce(nullif(dr.display_name,''),nullif(p.display_name,''),'当班工作人员') staff_name,coalesce(dr.service_role,sa.role::text) staff_role,dr.public_phone staff_phone
    from public.staff_assignments sa join public.profiles p on p.id=sa.staff_id left join public.driver_resources dr on dr.account_id=sa.staff_id
    where sa.vehicle_group_id=vg.id order by case coalesce(dr.service_role,sa.role::text) when 'guide' then 0 when 'driver_guide' then 1 when 'driver' then 2 else 3 end,sa.id limit 1
  ) staff on true
  where vg.id=p_vehicle_group and exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=vg.id and o.account_id=auth.uid() and o.status in ('paid','confirmed'));
$$;

revoke all on function public.operations_create_vehicle_v2(text,text,text,text,text),public.operations_create_driver_v2(text,text,text[],text[],timestamptz,timestamptz,text,text),public.get_passenger_trip_context_v2(uuid) from public,anon;
grant execute on function public.operations_create_vehicle_v2(text,text,text,text,text),public.operations_create_driver_v2(text,text,text[],text[],timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.get_passenger_trip_context_v2(uuid) to authenticated,service_role;

commit;
