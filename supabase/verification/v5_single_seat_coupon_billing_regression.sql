-- Disposable remote test only. All fictional writes are rolled back.
begin;
do $$
declare
  v_account uuid;v_trip uuid;v_departure uuid;v_coupon uuid;v_order uuid;v_hold uuid;v_price record;v_snapshot public.order_snapshots%rowtype;
  v_percent integer;v_expected_discount integer;v_expected_due integer;v_index integer:=0;v_prefix text:='v5-b-'||txid_current()::text||'-';
begin
  select p.id into v_account from public.profiles p order by p.created_at limit 1;
  if v_account is null then raise exception 'SETUP FAIL: fictional profile required'; end if;
  insert into public.trips(slug,title,status,content) values(v_prefix||'trip','V5 billing regression','published',jsonb_build_object(
    'itinerary',jsonb_build_array('test'),'included',jsonb_build_array('test'),'excluded',jsonb_build_array('test'),'description','Fictional billing route.',
    'childPolicy','Fictional child policy.','luggagePolicy','Fictional luggage policy.','accessibilityInfo','Fictional accessibility info.',
    'mealInfo','Fictional meal information.','weatherPolicy','Fictional weather policy.','cancellationPolicyVersion','test-v1')) returning id into v_trip;
  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,meeting_name,meeting_address,map_lat,map_lng,minimum_guests,seat_price_jpy,sales_open_at,sales_close_at)
    values(v_trip,now()+interval '10 days',now()+interval '10 days 9 hours',100,'open','V5 billing point','V5 fictional address',34.68,135.50,1,7000,now()-interval '1 day',now()+interval '9 days') returning id into v_departure;

  foreach v_percent in array array[10,30,50,100] loop
    v_index:=v_index+1;
    v_expected_discount:=floor((7000::numeric*v_percent/100)+0.5)::integer;
    v_expected_due:=42000-v_expected_discount;
    insert into public.discount_coupons(account_id,discount_percent,status,expires_at,source_type,source_id,rules_version)
      values(v_account,v_percent,'active',now()+interval '3 months','link_campaign',v_prefix||'rank-'||v_index,'single-seat-v1') returning id into v_coupon;
    select r.order_id,r.hold_id into v_order,v_hold from public.reserve_inventory(v_departure,v_account,6,v_prefix||'checkout-'||v_index,now()+interval '15 minutes') r;
    select * into v_price from public.price_order_with_coupon(v_account,v_order,v_coupon,42000);
    if v_price.discount_amount<>v_expected_discount or v_price.amount<>v_expected_due or v_price.discounted_seats<>1 or v_price.discounted_unit_price<>7000 then
      raise exception 'FAIL % coupon expected discount %, due %, got %, %',v_percent,v_expected_discount,v_expected_due,v_price.discount_amount,v_price.amount;
    end if;
  end loop;

  insert into public.discount_coupons(account_id,discount_percent,status,expires_at,source_type,source_id,rules_version)
    values(v_account,100,'active',now()+interval '3 months','link_campaign',v_prefix||'free','single-seat-v1') returning id into v_coupon;
  select r.order_id,r.hold_id into v_order,v_hold from public.reserve_inventory(v_departure,v_account,1,v_prefix||'free-checkout',now()+interval '15 minutes') r;
  select * into v_price from public.price_order_with_coupon(v_account,v_order,v_coupon,7000);
  if v_price.amount<>0 or not public.confirm_coupon_covered_order(v_account,v_order) then raise exception 'FAIL zero amount confirmation'; end if;
  select * into v_snapshot from public.order_snapshots s where s.order_id=v_order;
  if v_snapshot.paid_amount_jpy<>0 or v_snapshot.discount_amount_jpy<>7000 or v_snapshot.payment_kind<>'coupon_covered' or v_snapshot.payment_status_text<>'not_required' then raise exception 'FAIL zero amount billing snapshot'; end if;
  if not public.confirm_coupon_covered_order(v_account,v_order) then raise exception 'FAIL zero amount idempotent replay'; end if;
  if (select count(*) from public.order_snapshots s where s.order_id=v_order)<>1 then raise exception 'FAIL duplicate zero amount snapshot'; end if;
  raise notice 'PASS V5 single-seat coupon amounts and zero-payment snapshot';
end$$;
rollback;
