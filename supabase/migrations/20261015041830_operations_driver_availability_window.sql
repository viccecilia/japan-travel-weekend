begin;

create or replace function public.operations_add_driver_availability_window(
  p_driver uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_operations() then
    raise exception 'operations role required';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid availability window';
  end if;
  if p_ends_at - p_starts_at > interval '31 days' then
    raise exception 'availability window cannot exceed 31 days';
  end if;
  if not exists(select 1 from public.driver_resources where id=p_driver) then
    raise exception 'driver not found';
  end if;

  insert into public.driver_availability_windows(driver_id,starts_at,ends_at)
  values(p_driver,p_starts_at,p_ends_at);

  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(
    auth.uid(),
    'driver_resource_updated',
    'driver_resource',
    p_driver,
    jsonb_build_object(
      'field','availability_window',
      'startsAt',p_starts_at,
      'endsAt',p_ends_at
    )
  );
  return true;
end
$$;

revoke all on function public.operations_add_driver_availability_window(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.operations_add_driver_availability_window(uuid,timestamptz,timestamptz) to authenticated,service_role;

commit;
