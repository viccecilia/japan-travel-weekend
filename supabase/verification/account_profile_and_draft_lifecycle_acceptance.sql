-- Safe structural acceptance for migration 029. No account data is returned.
do $$
begin
  if to_regclass('public.account_private_profiles') is null then raise exception 'FAIL: private profile table missing'; end if;
  if to_regclass('public.account_audit_events') is null then raise exception 'FAIL: audit table missing'; end if;
  if not (select c.relrowsecurity from pg_class c where c.oid='public.account_private_profiles'::regclass) then raise exception 'FAIL: private profile RLS disabled'; end if;
  if has_table_privilege('authenticated','public.account_private_profiles','insert') or has_table_privilege('authenticated','public.account_private_profiles','update') then raise exception 'FAIL: authenticated can directly write private profile'; end if;
  if has_table_privilege('authenticated','public.account_audit_events','insert') then raise exception 'FAIL: authenticated can forge audit events'; end if;
  if has_function_privilege('anon','public.update_own_account_profile(text,text,text,text,boolean,boolean)','execute') then raise exception 'FAIL: anon can update profile'; end if;
  if not has_function_privilege('authenticated','public.abandon_own_booking_draft(uuid)','execute') then raise exception 'FAIL: owner cannot abandon draft'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='booking_drafts' and column_name='expires_at' and is_nullable='NO') then raise exception 'FAIL: draft expiry missing'; end if;
end $$;
select 'PASS: private profile, audit and draft lifecycle boundaries present' as result;
