create type public.fleet_vehicle_status as enum ('available','assigned','in_service','maintenance','inactive');
create type public.driver_resource_status as enum ('available','unavailable','suspended');
create type public.dispatch_task_status as enum ('draft','confirmed','sent','delivered','viewed','accepted','rejected','en_route','arrived','passengers_onboard','in_progress','completed','cancelled','failed');

create table public.vehicle_type_configs (
  type_key text primary key check(length(type_key) between 2 and 80),
  label text not null check(length(label) between 1 and 120),
  sellable_capacity integer not null check(sellable_capacity between 1 and 100),
  cost_units numeric(10,2) not null check(cost_units>0),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  registration_identifier text not null unique check(length(registration_identifier) between 2 and 40),
  vehicle_type_key text not null references public.vehicle_type_configs(type_key),
  external_dispatch_id text check(external_dispatch_id is null or length(external_dispatch_id) between 1 and 120),
  status public.fleet_vehicle_status not null default 'available',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.driver_resources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique references public.profiles(id),
  display_name text not null check(length(display_name) between 1 and 120),
  external_dispatch_id text unique check(external_dispatch_id is null or length(external_dispatch_id) between 1 and 120),
  languages text[] not null default '{}',
  status public.driver_resource_status not null default 'available',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.driver_vehicle_qualifications (
  driver_id uuid not null references public.driver_resources(id) on delete cascade,
  vehicle_type_key text not null references public.vehicle_type_configs(type_key),
  verified_at timestamptz,
  expires_at date,
  primary key(driver_id,vehicle_type_key)
);
create table public.driver_availability_windows (
  id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.driver_resources(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, source text not null default 'operations',
  check(ends_at>starts_at)
);
create table public.dispatch_tasks (
  id uuid primary key default gen_random_uuid(), vehicle_assignment_id uuid not null references public.vehicle_assignments(id),
  driver_id uuid not null references public.driver_resources(id), fleet_vehicle_id uuid references public.fleet_vehicles(id),
  idempotency_key text not null unique check(length(idempotency_key) between 8 and 200),
  external_task_id text unique, status public.dispatch_task_status not null default 'draft',
  payload jsonb not null default '{}'::jsonb, last_error text, confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz, sent_at timestamptz, updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table public.dispatch_task_audit (
  id bigint generated always as identity primary key, dispatch_task_id uuid not null references public.dispatch_tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id), action text not null check(length(action) between 1 and 80),
  from_status public.dispatch_task_status, to_status public.dispatch_task_status, detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.vehicle_type_configs enable row level security;
alter table public.fleet_vehicles enable row level security;
alter table public.driver_resources enable row level security;
alter table public.driver_vehicle_qualifications enable row level security;
alter table public.driver_availability_windows enable row level security;
alter table public.dispatch_tasks enable row level security;
alter table public.dispatch_task_audit enable row level security;
create policy vehicle_types_operations on public.vehicle_type_configs for all to authenticated using(public.is_operations()) with check(public.is_operations());
create policy fleet_vehicles_operations on public.fleet_vehicles for all to authenticated using(public.is_operations()) with check(public.is_operations());
create policy driver_resources_operations on public.driver_resources for all to authenticated using(public.is_operations()) with check(public.is_operations());
create policy driver_qualifications_operations on public.driver_vehicle_qualifications for all to authenticated using(public.is_operations()) with check(public.is_operations());
create policy driver_windows_operations on public.driver_availability_windows for all to authenticated using(public.is_operations()) with check(public.is_operations());
create policy dispatch_tasks_operations on public.dispatch_tasks for all to authenticated using(public.is_operations()) with check(public.is_operations());
create policy dispatch_audit_operations on public.dispatch_task_audit for select to authenticated using(public.is_operations());

insert into public.vehicle_type_configs(type_key,label,sellable_capacity,cost_units) values
('alphard-6','Alphard（6客席）',6,30),('hiace-13','Hiace（13客席）',13,40),('coaster-20','Coaster（20客席，待运营确认）',20,55),('bus-55','大型巴士（55客席）',55,100);

create or replace function public.operations_create_vehicle(p_registration text,p_vehicle_type text,p_external_dispatch_id text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare created_id uuid;begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if length(trim(p_registration)) not between 2 and 40 or not exists(select 1 from vehicle_type_configs where type_key=p_vehicle_type and active) then raise exception 'invalid vehicle'; end if;
  insert into fleet_vehicles(registration_identifier,vehicle_type_key,external_dispatch_id) values(trim(p_registration),p_vehicle_type,nullif(trim(p_external_dispatch_id),'')) returning id into created_id;return created_id;
end$$;
create or replace function public.operations_create_driver(p_display_name text,p_external_dispatch_id text,p_vehicle_types text[],p_languages text[],p_available_from timestamptz,p_available_until timestamptz)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare created_id uuid;begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if length(trim(p_display_name)) not between 1 and 120 or coalesce(array_length(p_vehicle_types,1),0)=0 or p_available_until<=p_available_from or exists(select 1 from unnest(p_vehicle_types) t where not exists(select 1 from vehicle_type_configs v where v.type_key=t and v.active)) then raise exception 'invalid driver'; end if;
  insert into driver_resources(display_name,external_dispatch_id,languages) values(trim(p_display_name),nullif(trim(p_external_dispatch_id),''),coalesce(p_languages,'{}')) returning id into created_id;
  insert into driver_vehicle_qualifications(driver_id,vehicle_type_key) select created_id,t from unnest(p_vehicle_types) t;
  insert into driver_availability_windows(driver_id,starts_at,ends_at) values(created_id,p_available_from,p_available_until);
  return created_id;
end$$;
revoke all on function public.operations_create_vehicle(text,text,text),public.operations_create_driver(text,text,text[],text[],timestamptz,timestamptz) from public,anon;
grant execute on function public.operations_create_vehicle(text,text,text),public.operations_create_driver(text,text,text[],text[],timestamptz,timestamptz) to authenticated;
revoke all on public.vehicle_type_configs,public.fleet_vehicles,public.driver_resources,public.driver_vehicle_qualifications,public.driver_availability_windows,public.dispatch_tasks,public.dispatch_task_audit from public,anon;
grant select,insert,update,delete on public.vehicle_type_configs,public.fleet_vehicles,public.driver_resources,public.driver_vehicle_qualifications,public.driver_availability_windows,public.dispatch_tasks to authenticated;
grant select on public.dispatch_task_audit to authenticated;
