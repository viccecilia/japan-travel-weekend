begin;

create or replace function public.operations_create_vehicle_v2(
  p_registration text,
  p_vehicle_type text,
  p_external_dispatch_id text,
  p_public_color text,
  p_public_photo_url text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  created_id uuid;
  default_capacity integer;
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  select sellable_capacity
  into default_capacity
  from public.vehicle_type_configs
  where type_key=p_vehicle_type and active;

  if length(trim(p_registration)) not between 2 and 40
    or length(trim(p_public_color)) not between 1 and 40
    or default_capacity is null then
    raise exception 'invalid vehicle';
  end if;
  if nullif(trim(coalesce(p_public_photo_url,'')),'') is not null
    and trim(p_public_photo_url) !~ '^https://[^[:space:]]+$' then
    raise exception 'invalid public vehicle photo';
  end if;

  insert into public.fleet_vehicles(
    registration_identifier,
    vehicle_type_key,
    external_dispatch_id,
    public_color,
    public_photo_url,
    sellable_capacity
  ) values (
    trim(p_registration),
    p_vehicle_type,
    nullif(trim(p_external_dispatch_id),''),
    trim(p_public_color),
    nullif(trim(coalesce(p_public_photo_url,'')),''),
    default_capacity
  ) returning id into created_id;

  return created_id;
end$$;

revoke all on function public.operations_create_vehicle_v2(text,text,text,text,text) from public,anon;
grant execute on function public.operations_create_vehicle_v2(text,text,text,text,text) to authenticated,service_role;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  return query select '202609140139'::text,now() where public.is_operations();
end$$;

revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;

commit;
