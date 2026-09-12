begin;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select '202609120130',now() where public.is_operations()
$$;

revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;

commit;
