-- Disposable remote test only. All fictional fixture writes are rolled back.
begin;
do $$
declare
  v_account uuid;v_trip uuid;v_departure uuid;v_coupon uuid;v_order uuid;v_hold uuid;
  v_quote jsonb;v_quote_id uuid;v_price record;v_rows integer;v_prefix text:='v5-quote-'||txid_current()::text||'-';
begin
  select p.id into v_account from public.profiles p order by p.created_at limit 1;
  if v_account is null then raise exception 'SETUP FAIL: fictional profile required'; end if;
  insert into public.trips(slug,title,status,content) values(v_prefix||'trip','V5 quote regression','published',jsonb_build_object(
    'itinerary',jsonb_build_array('test'),'included',jsonb_build_array('test'),'excluded',jsonb_build_array('test'),'description','Fictional quote route.',
    'childPolicy','Fictional child policy.','luggagePolicy','Fictional luggage policy.','accessibilityInfo','Fictional accessibility information.',
    'mealInfo','Fictional meal information.','weatherPolicy','Fictional weather policy.','cancellationPolicyVersion','test-v1')) returning id into v_trip;
  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,meeting_name,meeting_address,map_lat,map_lng,minimum_guests,seat_price_jpy,sales_open_at,sales_close_at)
    values(v_trip,now()+interval '10 days',now()+interval '10 days 9 hours',100,'open','V5 quote point','Fictional address',34.68,135.50,1,7000,now()-interval '1 day',now()+interval '9 days') returning id into v_departure;
  insert into public.discount_coupons(account_id,discount_percent,status,expires_at,source_type,source_id,rules_version)
    values(v_account,30,'active',now()+interval '3 months','link_campaign',v_prefix||'coupon','single-seat-v1') returning id into v_coupon;

  v_quote:=public.create_order_quote(v_account,v_departure,6,v_coupon);
  if (v_quote->>'baseFare')::integer<>42000 or (v_quote->>'discountAmount')::integer<>2100 or (v_quote->>'amountDue')::integer<>39900 or (v_quote->>'discountedSeats')::integer<>1 then
    raise exception 'FAIL authoritative quote breakdown %',v_quote;
  end if;
  v_quote_id:=(v_quote->>'quoteId')::uuid;
  select r.order_id,r.hold_id into v_order,v_hold from public.reserve_inventory(v_departure,v_account,6,v_prefix||'changed',now()+interval '15 minutes') r;
  update public.departures d set seat_price_jpy=7100,schedule_version=d.schedule_version+1 where d.id=v_departure;
  select count(*) into v_rows from public.apply_order_quote(v_account,v_order,v_quote_id);
  if v_rows<>0 then raise exception 'FAIL stale quote accepted after price/version change'; end if;

  update public.discount_coupons c set status='active',reserved_order_id=null where c.id=v_coupon;
  v_quote:=public.create_order_quote(v_account,v_departure,6,v_coupon);v_quote_id:=(v_quote->>'quoteId')::uuid;
  select r.order_id,r.hold_id into v_order,v_hold from public.reserve_inventory(v_departure,v_account,6,v_prefix||'confirmed',now()+interval '15 minutes') r;
  select * into v_price from public.apply_order_quote(v_account,v_order,v_quote_id);
  if v_price.gross_amount<>42600 or v_price.discount_amount<>2130 or v_price.amount<>40470 or v_price.discounted_seats<>1 then
    raise exception 'FAIL refreshed quote application %, %, %',v_price.gross_amount,v_price.discount_amount,v_price.amount;
  end if;
  if (select o.quote_id from public.orders o where o.id=v_order)<>v_quote_id then raise exception 'FAIL order not bound to quote'; end if;
  raise notice 'PASS V5 server quote rejects stale price and binds refreshed quote';
end$$;
rollback;
