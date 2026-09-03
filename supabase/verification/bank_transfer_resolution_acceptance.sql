-- Disposable remote test project only. Uses fictional operations/passenger accounts and rolls back.
begin;

select set_config('jtw.operations_id',coalesce((select id::text from public.profiles where role='operations' order by created_at limit 1),''),true);
select set_config('jtw.passenger_id',coalesce((select id::text from public.profiles where role='passenger' order by created_at limit 1),''),true);

do $$ begin
  if current_setting('jtw.operations_id',true)='' or current_setting('jtw.passenger_id',true)='' then
    raise exception 'SETUP FAIL: expected fictional operations and passenger profiles';
  end if;
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='operations_resolve_bank_transfer' and p.prosecdef) then
    raise exception 'FAIL resolution function missing or not security definer';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='manual_payment_decisions' and policyname='manual_payment_decisions_operations_select') then
    raise exception 'FAIL audit policy missing';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('jtw.passenger_id'),true);
do $$ declare denied boolean:=false; begin
  begin
    perform public.operations_resolve_bank_transfer(gen_random_uuid(),'confirmed','TEST-REF','','acceptance-passenger-denied');
  exception when others then denied:=position('operations only' in sqlerrm)>0; end;
  if not denied then raise exception 'FAIL passenger could resolve bank transfer'; end if;
end $$;

select set_config('request.jwt.claim.sub',current_setting('jtw.operations_id'),true);
do $$ declare protected boolean:=false; begin
  begin
    perform public.operations_resolve_bank_transfer(gen_random_uuid(),'confirmed','TEST-REF','','acceptance-operations-order-check');
  exception when others then protected:=position('order not found' in sqlerrm)>0; end;
  if not protected then raise exception 'FAIL operations resolver skipped order validation'; end if;
end $$;

reset role;
rollback;
select 'PASS' as bank_transfer_resolution_acceptance;
