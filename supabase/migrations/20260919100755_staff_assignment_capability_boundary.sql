begin;

-- A combined duty is explicit and scoped to one assignment, never inferred from
-- a permanent personnel profile or the absence of a guide.
create table public.staff_assignment_guiding_grants (
  assignment_id uuid primary key references public.staff_assignments(id),
  enabled boolean not null,
  revision integer not null default 1,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  reason text not null check(length(trim(reason)) between 1 and 500)
);
create table public.staff_assignment_guiding_audit (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.staff_assignments(id),
  enabled boolean not null,
  revision integer not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  reason text not null,
  unique(assignment_id,revision)
);
alter table public.staff_assignment_guiding_grants enable row level security;
alter table public.staff_assignment_guiding_audit enable row level security;
revoke all on public.staff_assignment_guiding_grants,public.staff_assignment_guiding_audit from public,anon,authenticated;
grant select on public.staff_assignment_guiding_grants,public.staff_assignment_guiding_audit to authenticated;
create policy operations_read on public.staff_assignment_guiding_grants for select to authenticated using(public.is_operations());
create policy operations_read on public.staff_assignment_guiding_audit for select to authenticated using(public.is_operations());

create function public.operations_set_assignment_guiding(p_assignment uuid,p_enabled boolean,p_expected_revision integer,p_reason text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare sa public.staff_assignments; current_revision integer; next_revision integer;
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  if p_enabled is null or p_expected_revision is null or p_reason is null or length(trim(p_reason)) not between 1 and 500 then raise exception 'invalid guiding authorization'; end if;
  select * into sa from public.staff_assignments where id=p_assignment for update;
  if not found or sa.role<>'driver' or sa.revoked_at is not null then raise exception 'active driver assignment required'; end if;
  select revision into current_revision from public.staff_assignment_guiding_grants where assignment_id=p_assignment;
  if coalesce(current_revision,0)<>p_expected_revision then raise exception 'assignment authorization version conflict' using errcode='40001'; end if;
  next_revision:=coalesce(current_revision,0)+1;
  insert into public.staff_assignment_guiding_grants(assignment_id,enabled,revision,changed_by,reason)
  values(p_assignment,p_enabled,next_revision,auth.uid(),trim(p_reason))
  on conflict(assignment_id) do update set enabled=excluded.enabled,revision=excluded.revision,changed_by=excluded.changed_by,changed_at=now(),reason=excluded.reason;
  insert into public.staff_assignment_guiding_audit(assignment_id,enabled,revision,changed_by,reason)
  values(p_assignment,p_enabled,next_revision,auth.uid(),trim(p_reason));
  return next_revision;
end $$;
revoke all on function public.operations_set_assignment_guiding(uuid,boolean,integer,text) from public,anon;
grant execute on function public.operations_set_assignment_guiding(uuid,boolean,integer,text) to authenticated;

create function public.invalidate_assignment_guiding_grant()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.staff_assignment_guiding_grants;
begin
  if new.staff_id is distinct from old.staff_id or new.vehicle_group_id is distinct from old.vehicle_group_id
    or new.role is distinct from old.role or (new.revoked_at is not null and old.revoked_at is null) then
    update public.staff_assignment_guiding_grants set enabled=false,revision=revision+1,changed_at=now(),
      changed_by=coalesce(auth.uid(),changed_by),reason='Assignment changed or revoked; explicit reauthorization required'
      where assignment_id=new.id and enabled returning * into g;
    if found then
      insert into public.staff_assignment_guiding_audit(assignment_id,enabled,revision,changed_by,reason)
      values(g.assignment_id,g.enabled,g.revision,g.changed_by,g.reason);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.invalidate_assignment_guiding_grant() from public,anon,authenticated;
create trigger invalidate_guiding_grant after update on public.staff_assignments
for each row execute function public.invalidate_assignment_guiding_grant();

-- Internal helper also used by the service-role boarding scanner with its
-- authenticated scanner identity. Not a publicly callable permission override.
create function public.staff_assignment_allows(p_group uuid,p_capability text,p_account uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_account is not null and p_capability in ('driving','guiding','shared') and (
    exists(select 1 from public.profiles where id=p_account and role='operations')
    or (public.is_active_group_staff(p_account,p_group) and public.is_vehicle_group_executable(p_group) and exists(
      select 1 from public.staff_assignments sa
      left join public.staff_assignment_guiding_grants g on g.assignment_id=sa.id
      where sa.vehicle_group_id=p_group and sa.staff_id=p_account and sa.revoked_at is null
      and (p_capability='shared' or (p_capability='driving' and sa.role='driver')
        or (p_capability='guiding' and (sa.role='guide' or (sa.role='driver' and g.enabled is true))))
    ))
  )
$$;
revoke all on function public.staff_assignment_allows(uuid,text,uuid) from public,anon,authenticated;

-- Preserve the final installed business bodies and grants, adding a fail-closed
-- entry guard. Exact one-overload/PLpgSQL checks prevent silently patching a
-- different signature. No UI guard substitutes for these RPC checks.
do $$
declare spec record; fn record; definition text; guard text; seen integer;
begin
  for spec in select * from (values
    ('record_staff_execution_event','case when p_event_type=''meeting_started'' then ''guiding'' else ''shared'' end','auth.uid()'),
    ('advance_vehicle_group_journey','''driving''','auth.uid()'),
    ('advance_vehicle_group_to_itinerary_stop','''driving''','auth.uid()'),
    ('update_vehicle_group_meeting','''shared''','auth.uid()'),
    ('start_driver_location_session_v2','''driving''','auth.uid()'),
    ('append_driver_location_point','''driving''','auth.uid()'),
    ('publish_driver_location','''driving''','auth.uid()'),
    ('set_staff_passenger_checkin','''guiding''','auth.uid()'),
    ('mark_vehicle_group_order_boarded','''guiding''','auth.uid()'),
    ('verify_boarding_credential','''guiding''','p_scanner_account')
  ) as s(name,capability,account) loop
    seen:=0;
    for fn in select p.oid,p.prosrc,l.lanname from pg_proc p join pg_language l on l.oid=p.prolang
      where p.pronamespace='public'::regnamespace and p.proname=spec.name loop
      seen:=seen+1;
      if fn.lanname<>'plpgsql' or fn.prosrc !~* '\mbegin\M' then raise exception 'unexpected RPC body: %',spec.name; end if;
      guard:=format(E'BEGIN\n  if not coalesce(public.staff_assignment_allows(p_vehicle_group,%s,%s),false) then raise exception ''assignment capability denied'' using errcode=''42501''; end if;\n',spec.capability,spec.account);
      definition:=pg_get_functiondef(fn.oid);
      definition:=replace(definition,fn.prosrc,regexp_replace(fn.prosrc,'\mbegin\M',guard,'i'));
      execute definition;
    end loop;
    if seen<>1 then raise exception 'unexpected RPC overload count: % = %',spec.name,seen; end if;
  end loop;
end $$;

commit;
