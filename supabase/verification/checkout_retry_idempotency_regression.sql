-- Remote test only. All fixture writes are rolled back.
begin;
do $$
declare
  v_account uuid; v_trip uuid; v_departure uuid; v_first record; v_retry record;
  v_key text:='checkout-retry-'||txid_current()::text;
begin
  select id into v_account from public.profiles order by created_at limit 1;
  if v_account is null then raise exception 'SETUP FAIL: fictional profile required'; end if;
  insert into public.trips(slug,title,status) values(v_key,'Checkout retry regression','draft') returning id into v_trip;
  insert into public.departures(trip_id,capacity,status,seat_price_jpy) values(v_trip,2,'open',100) returning id into v_departure;
  select * into v_first from public.reserve_inventory(v_departure,v_account,1,v_key||'-card',now()+interval '15 minutes');
  select * into v_retry from public.reserve_inventory(v_departure,v_account,1,v_key||'-card',now()+interval '14 minutes');
  if v_first.order_id<>v_retry.order_id or v_first.hold_id<>v_retry.hold_id then raise exception 'FAIL changed expiry created duplicate checkout'; end if;
  if not public.record_stripe_payment_intent(v_first.order_id,'pi_test_retry',100) then raise exception 'FAIL first payment intent record'; end if;
  if not public.record_stripe_payment_intent(v_first.order_id,'pi_test_retry',100) then raise exception 'FAIL payment intent retry'; end if;
  select * into v_first from public.reserve_inventory(v_departure,v_account,1,v_key||'-bank',now()+interval '15 minutes');
  if not public.mark_bank_transfer_pending(v_first.order_id,200) then raise exception 'FAIL first bank transfer transition'; end if;
  if not public.mark_bank_transfer_pending(v_first.order_id,200) then raise exception 'FAIL bank transfer retry'; end if;
  select * into v_retry from public.reserve_inventory(v_departure,v_account,1,v_key||'-bank',now()+interval '13 minutes');
  if v_first.order_id<>v_retry.order_id then raise exception 'FAIL bank transfer checkout retry'; end if;
  begin
    perform public.reserve_inventory(v_departure,v_account,2,v_key||'-card',now()+interval '15 minutes');
    raise exception 'FAIL mismatched idempotency accepted';
  exception when others then if sqlerrm='FAIL mismatched idempotency accepted' then raise; end if; end;
  raise notice 'PASS checkout retry idempotency regression';
end$$;
rollback;
