-- Disposable Test-only fixture. The caller must own a transaction and roll it
-- back. No production order, payment, fulfilment or reward is created here.
do $$
declare
  inviter uuid:=gen_random_uuid(); invitee uuid:=gen_random_uuid(); code text; relation uuid;
  trip_id uuid; departure_id uuid; fixture_order uuid; assignment_a uuid; assignment_b uuid;
  group_a uuid; group_b uuid; passenger_id uuid; idx integer; result text;
  global_policy uuid; service_policy uuid; cancellation_policy uuid;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (inviter,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','referral-growth-inviter-'||inviter||'@example.invalid',crypt('fixture-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    (invitee,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','referral-growth-invitee-'||invitee||'@example.invalid',crypt('fixture-only',gen_salt('bf')),now(),'{}','{}',now(),now());
  select public.ensure_referral_code(inviter) into code;
  if not public.apply_referral_registration(invitee,code) then raise exception 'FAIL referral registration'; end if;
  select id into relation from public.referral_relationships where invitee_account_id=invitee;
  if (select expires_at-activated_at from public.discount_coupons where referral_relationship_id=relation and recipient_kind='invitee')<>interval '90 days' then raise exception 'FAIL newcomer exact 90 days'; end if;

  select id into global_policy from public.policy_templates where template_key='jtw-day-trip-standard';
  select id into service_policy from public.policy_templates where template_key='standard-10h-v1';
  select id into cancellation_policy from public.policy_templates where template_key='standard-24h-v1';
  insert into public.trips(slug,title,status,content,publication_scope,policy_template_id,service_time_policy_template_id,cancellation_policy_template_id)
  values('route-referral-growth-'||txid_current(),'Rollback-only referral fixture','published',jsonb_build_object(
    'description','Rollback-only fixture','itinerary',jsonb_build_array('Fixture stop'),'included',jsonb_build_array('Fixture transport'),
    'excluded',jsonb_build_array('Fixture expense'),'childPolicy','Fixture child policy only','luggagePolicy','Fixture luggage policy only','accessibilityInfo','Fixture access policy only',
    'mealInfo','Fixture meal information only','weatherPolicy','Fixture weather policy only','cancellationPolicyVersion','fixture-v1'),'public',global_policy,service_policy,cancellation_policy) returning id into trip_id;
  insert into public.departures(trip_id,capacity,status,departs_at,ends_at,sales_open_at,sales_close_at,minimum_guests,seat_price_jpy,currency,tax_included,meeting_name,meeting_address,map_lat,map_lng,sales_scope)
  values(trip_id,20,'open',now()+interval '2 days',now()+interval '2 days 8 hours',now()-interval '1 day',now()+interval '1 day',1,10000,'JPY',true,'Fixture meeting','Fixture address',35,135,'public') returning id into departure_id;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount,gross_amount,discount_amount)
  values(invitee,departure_id,'route-referral-growth-'||txid_current(),5,'confirmed',50000,50000,0) returning id into fixture_order;
  insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,capacity,planned_passengers) values(departure_id,1,'fixture-a',10,2) returning id into assignment_a;
  insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,capacity,planned_passengers) values(departure_id,2,'fixture-b',10,3) returning id into assignment_b;
  insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(departure_id,assignment_a) returning id into group_a;
  insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(departure_id,assignment_b) returning id into group_b;
  insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(group_a,fixture_order);
  insert into public.vehicle_group_journey_state(vehicle_group_id,status,updated_by) values(group_a,'in_progress',inviter),(group_b,'in_progress',inviter);
  for idx in 1..5 loop
    insert into public.passengers(order_id,display_name,passenger_type,paid_seat_eligible,commerce_status)
    values(fixture_order,'Fixture seat '||idx,case when idx=5 then 'child' else 'adult' end,idx<5,case when idx=5 then 'free' else 'paid' end) returning id into passenger_id;
    insert into public.passenger_checkins(passenger_id,order_id,vehicle_group_id,status,updated_by)
    values(passenger_id,fixture_order,case when idx<=2 then group_a else group_b end,'boarded',inviter);
  end loop;
  update public.vehicle_group_journey_state set status='completed',completed_at=now(),updated_at=now() where vehicle_group_id=group_a;
  if (select count(*) from public.referral_qualified_seats where referral_relationship_id=relation and status='qualified')<>2 then raise exception 'FAIL first split group should count 2'; end if;
  update public.vehicle_group_journey_state set status='completed',completed_at=now(),updated_at=now() where vehicle_group_id=group_b;
  perform public.refresh_referral_lifecycle_for_order(fixture_order);
  perform public.refresh_referral_lifecycle_for_order(fixture_order);
  if (select count(*) from public.referral_qualified_seats where referral_relationship_id=relation and status='qualified')<>4 then raise exception 'FAIL paid seats should be 4'; end if;
  if (select count(*) from public.discount_coupons where referral_relationship_id=relation and recipient_kind='inviter')<>1 then raise exception 'FAIL one order must issue exactly one inviter coupon'; end if;
  if (select expires_at-activated_at from public.discount_coupons where referral_relationship_id=relation and recipient_kind='inviter')<>interval '90 days' then raise exception 'FAIL inviter exact 90 days'; end if;

  -- Isolated threshold fixture: add six auditable passenger-ledger rows without
  -- pretending they came through the remote payment/fulfilment interfaces.
  for idx in 6..11 loop
    insert into public.passengers(order_id,display_name,passenger_type,paid_seat_eligible,commerce_status)
    values(fixture_order,'Threshold fixture '||idx,'adult',true,'paid') returning id into passenger_id;
    insert into public.referral_qualified_seats(passenger_id,referral_relationship_id,inviter_account_id,invitee_account_id,order_id,vehicle_group_id,status,qualified_at,source_event_id)
    values(passenger_id,relation,inviter,invitee,fixture_order,group_b,'qualified',now(),'threshold-fixture:'||passenger_id);
  end loop;
  if public.refresh_ambassador_qualification(inviter)<>10 then raise exception 'FAIL threshold count'; end if;
  if exists(select 1 from public.ambassador_qualifications where account_id=inviter and status in ('active','approved')) then raise exception 'FAIL ten seats auto-activated ambassador'; end if;
  if not exists(select 1 from public.referral_learning_eligibilities where account_id=inviter and eligibility_status='content_pending') then raise exception 'FAIL content pending placeholder'; end if;

  update public.orders set status='refunded',refunded_amount_jpy=50000 where id=fixture_order;
  select public.refresh_referral_lifecycle_for_order(fixture_order) into result;
  if result<>'invalid' or exists(select 1 from public.referral_qualified_seats s where s.order_id=fixture_order and s.status='qualified') then raise exception 'FAIL full refund reversal'; end if;
  update public.ambassador_qualifications set status='active',source='staff_approval',activated_at=now()-interval '61 days',qualification_achieved_at=now()-interval '61 days' where account_id=inviter;
  if public.refresh_ambassador_activity(inviter)<>'care_due' then raise exception 'FAIL 60 day care boundary'; end if;
  update public.ambassador_qualifications set activated_at=now()-interval '91 days',qualification_achieved_at=now()-interval '91 days' where account_id=inviter;
  if public.refresh_ambassador_activity(inviter)<>'inactive' then raise exception 'FAIL 90 day inactive boundary'; end if;
  update public.referral_qualified_seats target set status='qualified',reversed_at=null,reversal_reason=null,qualified_at=now() where target.passenger_id=(select source.passenger_id from public.referral_qualified_seats source where source.referral_relationship_id=relation order by source.created_at limit 1);
  if public.refresh_ambassador_activity(inviter)<>'active' then raise exception 'FAIL activity recovery'; end if;
  if not exists(select 1 from public.ambassador_qualifications where account_id=inviter and status='active' and source='staff_approval') then raise exception 'FAIL activity changed ambassador rights'; end if;
  raise notice 'PASS route referral growth rollback fixture';
end$$;
