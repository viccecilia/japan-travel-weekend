begin;
do $$ begin
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='purge_expired_ephemeral_data' and p.prosecdef) then raise exception 'FAIL retention function missing or not security definer'; end if;
  if has_function_privilege('anon','public.purge_expired_ephemeral_data(timestamptz)','execute') or has_function_privilege('authenticated','public.purge_expired_ephemeral_data(timestamptz)','execute') then raise exception 'FAIL browser role can run retention purge'; end if;
  if not has_function_privilege('service_role','public.purge_expired_ephemeral_data(timestamptz)','execute') then raise exception 'FAIL service role cannot run retention purge'; end if;
end $$;
rollback;
select 'PASS' as ephemeral_data_retention_acceptance;
