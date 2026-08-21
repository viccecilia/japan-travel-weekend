-- 远程测试专用：需要至少一个虚构 profile；全部写入在事务末尾回滚。
begin;
do $$
declare
  v_account uuid;
  v_trip uuid;
  v_departure uuid;
  v_prefix text:='payment-regression-'||txid_current()::text||'-';
  v_expires timestamptz:=date_trunc('second',now()+interval '30 minutes');
  v_valid record;
  v_expired record;
  v_released record;
  v_release_check record;
  v_cancel_check record;
  v_applied boolean;
  v_released_count integer;
begin
  select prof.id into v_account from public.profiles as prof order by prof.created_at limit 1;
  if v_account is null then raise exception 'SETUP FAIL: create one fictional profile before running payment regression'; end if;
  insert into public.trips as tr(slug,title,status) values(v_prefix||'trip','Payment regression','draft') returning tr.id into v_trip;
  insert into public.departures as dep(trip_id,capacity,status) values(v_trip,10,'open') returning dep.id into v_departure;

  select r.order_id,r.hold_id into v_valid from public.reserve_inventory(v_departure,v_account,1,v_prefix||'valid',v_expires) as r;
  select public.apply_payment_event(v_prefix||'success',v_valid.order_id,'succeeded',now(),v_prefix||'digest') into v_applied;
  if not v_applied then raise exception 'FAIL valid success event was not applied'; end if;
  if not exists(select 1 from public.orders as ord join public.inventory_locks as il on il.order_id=ord.id where ord.id=v_valid.order_id and ord.status='paid' and il.status='committed') then raise exception 'FAIL valid success did not commit hold and mark order paid'; end if;
  select public.apply_payment_event(v_prefix||'success',v_valid.order_id,'succeeded',now(),v_prefix||'digest') into v_applied;
  if v_applied then raise exception 'FAIL duplicate event id was applied twice'; end if;
  perform public.apply_payment_event(v_prefix||'old-failure',v_valid.order_id,'failed',now()-interval '1 minute',v_prefix||'old');
  if (select ord.status from public.orders as ord where ord.id=v_valid.order_id)<>'paid' then raise exception 'FAIL older event regressed paid order'; end if;
  perform public.apply_payment_event(v_prefix||'refund',v_valid.order_id,'refunded',now()+interval '1 minute',v_prefix||'refund-digest');
  if (select ord.status from public.orders as ord where ord.id=v_valid.order_id)<>'refunded' then raise exception 'FAIL refund did not mark order refunded'; end if;

  select r.order_id,r.hold_id into v_expired from public.reserve_inventory(v_departure,v_account,1,v_prefix||'expired-payment',v_expires) as r;
  update public.inventory_locks as il set status='expired',expires_at=now()-interval '1 second' where il.id=v_expired.hold_id;
  perform public.apply_payment_event(v_prefix||'expired-success',v_expired.order_id,'succeeded',now(),v_prefix||'expired-digest');
  if not exists(select 1 from public.orders as ord where ord.id=v_expired.order_id and ord.status='payment_review' and ord.payment_review_reason='payment_succeeded_without_valid_inventory') then raise exception 'FAIL expired hold success did not enter payment_review'; end if;

  select r.order_id,r.hold_id into v_released from public.reserve_inventory(v_departure,v_account,1,v_prefix||'released-payment',v_expires) as r;
  if not public.cancel_pending_order(v_released.order_id,v_account) then raise exception 'FAIL setup cancel for released payment'; end if;
  perform public.apply_payment_event(v_prefix||'released-success',v_released.order_id,'succeeded',now(),v_prefix||'released-digest');
  if (select ord.status from public.orders as ord where ord.id=v_released.order_id)<>'payment_review' then raise exception 'FAIL released hold success did not enter payment_review'; end if;

  select r.order_id,r.hold_id into v_release_check from public.reserve_inventory(v_departure,v_account,1,v_prefix||'release-expired',v_expires) as r;
  update public.inventory_locks as il set expires_at=now()-interval '1 second' where il.id=v_release_check.hold_id;
  select public.release_expired_inventory() into v_released_count;
  if v_released_count<1 or not exists(select 1 from public.orders as ord join public.inventory_locks as il on il.order_id=ord.id where ord.id=v_release_check.order_id and ord.status='expired' and il.status='expired') then raise exception 'FAIL release_expired_inventory boundary'; end if;

  select r.order_id,r.hold_id into v_cancel_check from public.reserve_inventory(v_departure,v_account,1,v_prefix||'cancel',v_expires) as r;
  if not public.cancel_pending_order(v_cancel_check.order_id,v_account) then raise exception 'FAIL first cancellation'; end if;
  if public.cancel_pending_order(v_cancel_check.order_id,v_account) then raise exception 'FAIL repeated cancellation returned true'; end if;
  if not exists(select 1 from public.orders as ord join public.inventory_locks as il on il.order_id=ord.id where ord.id=v_cancel_check.order_id and ord.status='cancelled' and il.status='released') then raise exception 'FAIL cancellation did not release hold'; end if;

  raise notice 'PASS payment and compensation regression';
end $$;
rollback;
