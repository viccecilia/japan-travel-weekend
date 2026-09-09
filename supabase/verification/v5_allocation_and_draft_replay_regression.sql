-- Disposable remote test only. All fictional writes are rolled back.
begin;
do $$
declare
  v_account uuid;
  v_trip uuid;
  v_departure uuid;
  v_order_one uuid;
  v_order_two uuid;
  v_draft uuid;
  v_first record;
  v_retry record;
  v_allocation record;
  v_prefix text := 'v5-a-'||txid_current()::text||'-';
begin
  select p.id into v_account from public.profiles p order by p.created_at limit 1;
  if v_account is null then raise exception 'SETUP FAIL: fictional profile required'; end if;
  insert into public.trips(slug,title,status,content) values(v_prefix||'trip','V5 A regression','published',jsonb_build_object(
    'itinerary',jsonb_build_array('test'),'included',jsonb_build_array('test'),'excluded',jsonb_build_array('test'),
    'description','Fictional V5 regression route.','childPolicy','Fictional child policy.','luggagePolicy','Fictional luggage policy.',
    'accessibilityInfo','Fictional accessibility info.','mealInfo','Fictional meal information.','weatherPolicy','Fictional weather policy.',
    'cancellationPolicyVersion','test-v1')) returning id into v_trip;
  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,meeting_name,meeting_address,map_lat,map_lng,minimum_guests,seat_price_jpy,sales_open_at,sales_close_at)
    values(v_trip,now()+interval '10 days',now()+interval '10 days 9 hours',20,'open','V5 test point','V5 fictional address',34.68,135.50,1,7000,now()-interval '1 day',now()+interval '9 days') returning id into v_departure;

  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount)
    values(v_account,v_departure,v_prefix||'family-1',6,'paid',42000) returning id into v_order_one;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount)
    values(v_account,v_departure,v_prefix||'family-2',3,'paid',21000) returning id into v_order_two;
  select * into v_allocation from public.allocate_departure_sequential(v_departure,array['hiace-10'],array['V5 TEST'],array[10],now()+interval '9 days');
  if v_allocation.booked_seats<>9 then raise exception 'FAIL allocated seats expected 9, got %',v_allocation.booked_seats; end if;
  if (select count(*) from public.vehicle_group_orders vgo where vgo.order_id in (v_order_one,v_order_two))<>2 then raise exception 'FAIL family orders were not assigned whole'; end if;

  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,meeting_name,meeting_address,map_lat,map_lng,minimum_guests,seat_price_jpy,sales_open_at,sales_close_at)
    values(v_trip,now()+interval '11 days',now()+interval '11 days 9 hours',10,'open','V5 draft point','V5 fictional address',34.68,135.50,1,7000,now()-interval '1 day',now()+interval '10 days') returning id into v_departure;
  insert into public.booking_drafts(account_id,departure_id,idempotency_key,adults,children,infants,seat_impact,passenger_private,assistance_private,assistance_summary,operational_review_status,accepted_cancellation,accepted_terms,expires_at)
    values(v_account,v_departure,v_prefix||'draft',2,0,0,2,'{}','{}','{}','not_requested',true,true,now()+interval '1 day') returning id into v_draft;
  select * into v_first from public.reserve_inventory_from_draft(v_draft,v_account,v_departure,2,v_prefix||'checkout',now()+interval '15 minutes');
  select * into v_retry from public.reserve_inventory_from_draft(v_draft,v_account,v_departure,2,v_prefix||'checkout',now()+interval '14 minutes');
  if v_first.order_id<>v_retry.order_id or v_first.hold_id<>v_retry.hold_id then raise exception 'FAIL draft replay returned different reservation'; end if;
  raise notice 'PASS V5 allocation and draft replay regression';
end$$;
rollback;
