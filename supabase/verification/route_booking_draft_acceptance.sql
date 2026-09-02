-- Read-only structure checks plus transaction-scoped draft behavior setup.
-- Run only in the isolated test project. The transaction always rolls back.
begin;

do $$
begin
  if to_regclass('public.booking_drafts') is null then raise exception 'FAIL: booking_drafts missing'; end if;
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_own_booking_draft') then raise exception 'FAIL: save_own_booking_draft missing'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='booking_drafts' and policyname='booking_drafts_owner_select') then raise exception 'FAIL: owner RLS policy missing'; end if;
  if has_function_privilege('anon','public.save_own_booking_draft(uuid,integer,integer,integer,jsonb,jsonb,text,boolean,boolean,text)','execute') then raise exception 'FAIL: anon can save drafts'; end if;
  if not has_function_privilege('authenticated','public.save_own_booking_draft(uuid,integer,integer,integer,jsonb,jsonb,text,boolean,boolean,text)','execute') then raise exception 'FAIL: authenticated cannot save drafts'; end if;
  if has_table_privilege('authenticated','public.booking_drafts','insert') then raise exception 'FAIL: authenticated can directly insert drafts'; end if;
end $$;

select 'PASS: booking draft structure, grants and owner policy present' as result;
rollback;
