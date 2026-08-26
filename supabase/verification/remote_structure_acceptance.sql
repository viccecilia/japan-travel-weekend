-- 只读、可重复运行；不包含项目标识或凭证。
with checks as (
  select
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') as public_tables,
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables,
    (select count(*) from pg_policies where schemaname='public') as public_policies,
    (select count(*) from pg_policies where schemaname='realtime') as realtime_policies,
    (select count(*) from pg_policies where schemaname='storage') as storage_policies,
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('is_vehicle_group_member','can_receive_vehicle_group','can_send_vehicle_group_chat','can_read_assistance_projection')) as security_functions,
    (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='users' and t.tgname='on_auth_user_created' and not t.tgisinternal) as auth_triggers,
    (select count(*) from storage.buckets where id='private-order-files' and public=false) as private_buckets
)
select * from checks;

do $$
declare c record;
begin
  select
    (select count(*) from pg_class x join pg_namespace n on n.oid=x.relnamespace where n.nspname='public' and x.relkind='r') as public_tables,
    (select count(*) from pg_class x join pg_namespace n on n.oid=x.relnamespace where n.nspname='public' and x.relkind='r' and x.relrowsecurity) as rls_tables,
    (select count(*) from pg_policies where schemaname='public') as public_policies,
    (select count(*) from pg_policies where schemaname='realtime') as realtime_policies,
    (select count(*) from pg_policies where schemaname='storage') as storage_policies,
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('is_vehicle_group_member','can_receive_vehicle_group','can_send_vehicle_group_chat','can_read_assistance_projection')) as security_functions,
    (select count(*) from pg_trigger t join pg_class x on x.oid=t.tgrelid join pg_namespace n on n.oid=x.relnamespace where n.nspname='auth' and x.relname='users' and t.tgname='on_auth_user_created' and not t.tgisinternal) as auth_triggers,
    (select count(*) from storage.buckets where id='private-order-files' and public=false) as private_buckets
  into c;
  if c.public_tables < 17 then raise exception 'FAIL public_tables: expected >=17, actual %',c.public_tables; end if;
  if c.rls_tables < 17 then raise exception 'FAIL rls_tables: expected >=17, actual %',c.rls_tables; end if;
  if c.public_policies < 15 then raise exception 'FAIL public_policies: expected >=15, actual %',c.public_policies; end if;
  -- 019 removes direct client Broadcast send; only the private receive policy remains.
  if c.realtime_policies < 1 then raise exception 'FAIL realtime_policies: expected >=1, actual %',c.realtime_policies; end if;
  if c.storage_policies < 3 then raise exception 'FAIL storage_policies: expected >=3, actual %',c.storage_policies; end if;
  if c.security_functions <> 4 then raise exception 'FAIL security_functions: expected 4, actual %',c.security_functions; end if;
  if c.auth_triggers <> 1 then raise exception 'FAIL auth_triggers: expected 1, actual %',c.auth_triggers; end if;
  if c.private_buckets <> 1 then raise exception 'FAIL private_buckets: expected 1, actual %',c.private_buckets; end if;
end $$;
