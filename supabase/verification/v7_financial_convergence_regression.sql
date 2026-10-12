-- Disposable local/CI database only. Fictional rows are rolled back.
begin;
do $$
declare inviter uuid:=gen_random_uuid();invitee uuid;trip_id uuid;departure_id uuid;v_order_id uuid;relation_id uuid;entry_id uuid;assignment_id uuid;group_id uuid;passenger_id uuid;state text;idx integer;referral_code text;global_policy_id uuid;service_policy_id uuid;cancellation_policy_id uuid;
begin
 insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(inviter,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','v7-inviter-'||inviter||'@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),'{}','{}',now(),now());
 insert into public.ambassador_qualifications(account_id,status,source,approved_at) values(inviter,'approved','operations',now());
 select code into referral_code from public.referral_codes where account_id=inviter;
 if referral_code is null then raise exception 'FAIL referral code was not provisioned';end if;
 select id into global_policy_id from public.policy_templates where template_key='jtw-day-trip-standard' and status='active';
 select id into service_policy_id from public.policy_templates where template_key='standard-10h-v1' and status='active';
 select id into cancellation_policy_id from public.policy_templates where template_key='standard-24h-v1' and status='active';
 if global_policy_id is null or service_policy_id is null or cancellation_policy_id is null then raise exception 'FAIL standard policy templates are unavailable';end if;
 insert into public.trips(slug,title,status,content,policy_template_id,service_time_policy_template_id,cancellation_policy_template_id)
 values(
  'v7-financial-'||txid_current(),'V7 fictional financial route','published',
  jsonb_build_object(
   'description','Fictional route used only by the rolled-back V7 database regression.',
   'itinerary',jsonb_build_array('Test stop'),'included',jsonb_build_array('Transport'),
   'excluded',jsonb_build_array('Personal expenses'),'childPolicy','Fictional child policy for regression.',
   'luggagePolicy','Fictional luggage policy for regression.','accessibilityInfo','Fictional accessibility information.',
   'mealInfo','Fictional meal information.','weatherPolicy','Fictional weather policy.',
   'cancellationPolicyVersion','v7-test'
  ),global_policy_id,service_policy_id,cancellation_policy_id
 ) returning id into trip_id;
 insert into public.departures(
  trip_id,capacity,status,departs_at,ends_at,sales_open_at,sales_close_at,
  minimum_guests,seat_price_jpy,currency,tax_included,meeting_name,meeting_address,map_lat,map_lng
 ) values(
  trip_id,30,'open',now()+interval '30 days',now()+interval '30 days 10 hours',
  now()-interval '1 day',now()+interval '29 days',1,10000,'JPY',true,
  'V7 test meeting point','1-1 Fictional Test Address',35.0,135.0
 ) returning id into departure_id;

 for idx in 1..3 loop
  invitee:=gen_random_uuid();
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(invitee,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','v7-invitee-'||idx||'-'||invitee||'@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),'{}','{}',now(),now());
  if not public.apply_referral_registration(invitee,referral_code) then raise exception 'FAIL referral registration was not applied';end if;
  select id into relation_id from public.referral_relationships where invitee_account_id=invitee;
  if relation_id is null then raise exception 'FAIL referral relationship was not created';end if;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount,gross_amount,discount_amount) values(invitee,departure_id,'v7-order-'||idx||'-'||txid_current(),1,'pending_payment',9000,10000,1000) returning id into v_order_id;
  update public.orders set status='paid' where id=v_order_id;
  insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,capacity,planned_passengers) values(departure_id,idx,'regression-vehicle',10,1) returning id into assignment_id;
  insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(departure_id,assignment_id) returning id into group_id;
  insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(group_id,v_order_id);
  insert into public.passengers(order_id,display_name,passenger_type) values(v_order_id,'Fictional passenger','adult') returning id into passenger_id;
  insert into public.passenger_checkins(passenger_id,order_id,vehicle_group_id,status,updated_by) values(passenger_id,v_order_id,group_id,'boarded',invitee);
  insert into public.vehicle_group_journey_state(vehicle_group_id,status,updated_by,completed_at) values(group_id,'completed',invitee,now());
  if public.refresh_referral_lifecycle_for_order(v_order_id)<>'valid_referral' then raise exception 'FAIL completed real-trip referral was not validated';end if;
  select id into entry_id from public.cash_commission_entries where source_order_id=v_order_id;
  if entry_id is null or (select status from public.cash_commission_entries where id=entry_id)<>'available' then raise exception 'FAIL available commission was not created after a completed real trip';end if;
  update public.cash_commission_entries set status=case idx when 1 then 'available' when 2 then 'withdrawal_pending' else 'paid' end where id=entry_id;
  update public.orders set refunded_amount_jpy=9000,status='refunded' where id=v_order_id;
  select status into state from public.cash_commission_entries where id=entry_id;
  if idx=1 and state<>'invalid' then raise exception 'FAIL available commission was not invalidated';end if;
  if idx in(2,3) and state<>'recovery_due' then raise exception 'FAIL withdrawal-pending/paid commission did not create recovery state';end if;
  if (select status from public.orders where id=v_order_id)<>'refunded' then raise exception 'FAIL refund was blocked by commission state';end if;
 end loop;
 if (select count(*) from public.notification_outbox where event_type='refund-completed' and order_id=v_order_id)>1 then raise exception 'FAIL duplicate refund notification';end if;
 raise notice 'PASS V7 refund and commission convergence';
end$$;
rollback;
