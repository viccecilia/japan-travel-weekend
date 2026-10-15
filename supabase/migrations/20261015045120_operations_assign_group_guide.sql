begin;

create or replace function public.operations_assign_group_guide(
  p_vehicle_group uuid,
  p_guide uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_assignment uuid;
begin
  if not public.is_operations() then
    raise exception 'operations role required';
  end if;
  if not exists(
    select 1
    from public.vehicle_groups
    where id=p_vehicle_group
  ) then
    raise exception 'vehicle group not found';
  end if;
  if not exists(
    select 1
    from public.profiles
    where id=p_guide and role='guide'
  ) then
    raise exception 'approved guide account required';
  end if;
  insert into public.driver_resources(
    account_id,
    display_name,
    languages,
    status,
    service_role
  )
  select p.id,coalesce(nullif(trim(p.display_name),''),'Test Guide'),'{}'::text[],'available','guide'
  from public.profiles p
  where p.id=p_guide and p.role='guide'
  on conflict(account_id) do nothing;

  if not exists(
    select 1
    from public.driver_resources
    where account_id=p_guide
      and status='available'
      and service_role in ('guide','driver_guide')
  ) then
    raise exception 'guide account is not active';
  end if;

  insert into public.staff_assignments(
    vehicle_group_id,
    staff_id,
    role,
    revoked_at,
    revoked_by,
    revocation_reason
  ) values(
    p_vehicle_group,
    p_guide,
    'guide',
    null,
    null,
    null
  )
  on conflict(vehicle_group_id,staff_id) do update
  set role='guide',revoked_at=null,revoked_by=null,revocation_reason=null
  returning id into v_assignment;

  return v_assignment;
end
$$;

revoke all on function public.operations_assign_group_guide(uuid,uuid) from public,anon;
grant execute on function public.operations_assign_group_guide(uuid,uuid) to authenticated,service_role;

commit;
