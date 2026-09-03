-- Disposable remote test project only. Uses fictional accounts and rolls back.
begin;
select set_config('jtw.operations_id',coalesce((select id::text from public.profiles where role='operations' order by created_at limit 1),''),true);
select set_config('jtw.passenger_id',coalesce((select id::text from public.profiles where role='passenger' order by created_at limit 1),''),true);
do $$ begin if current_setting('jtw.operations_id',true)='' or current_setting('jtw.passenger_id',true)='' then raise exception 'SETUP FAIL: expected fictional operations and passenger profiles'; end if; end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('jtw.passenger_id'),true);
select set_config('jtw.deletion_request_id',(public.request_own_account_deletion('删除我的账户','TEST acceptance request')).id::text,true);
do $$ begin
  if (select count(*) from public.account_deletion_requests where id=current_setting('jtw.deletion_request_id')::uuid and account_id=current_setting('jtw.passenger_id')::uuid)<>1 then raise exception 'FAIL passenger cannot read own deletion request'; end if;
  begin perform public.operations_review_account_deletion(current_setting('jtw.deletion_request_id')::uuid,'reviewing','TEST unauthorized review');raise exception 'FAIL passenger reviewed deletion request';exception when others then if position('operations only' in sqlerrm)=0 then raise;end if;end;
end $$;

select set_config('request.jwt.claim.sub',current_setting('jtw.operations_id'),true);
do $$ begin
  if not public.operations_review_account_deletion(current_setting('jtw.deletion_request_id')::uuid,'reviewing','TEST retention and active booking review') then raise exception 'FAIL operations could not review request'; end if;
  if not exists(select 1 from public.account_deletion_requests where id=current_setting('jtw.deletion_request_id')::uuid and status='reviewing') then raise exception 'FAIL review state not persisted'; end if;
end $$;
reset role;
rollback;
select 'PASS' as account_deletion_request_acceptance;
