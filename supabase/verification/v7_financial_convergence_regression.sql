-- Disposable local/CI database only. Fictional rows are rolled back.
begin;
do $$
declare inviter uuid:=gen_random_uuid();invitee uuid;trip_id uuid;departure_id uuid;order_id uuid;relation_id uuid;entry_id uuid;state text;idx integer;referral_code text;
begin
 insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(inviter,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','v7-inviter-'||inviter||'@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),'{}','{}',now(),now());
 insert into public.ambassador_qualifications(account_id,status,source,approved_at) values(inviter,'approved','operations',now());
 referral_code:='V7'||upper(replace(left(inviter::text,10),'-',''));
 insert into public.referral_codes(account_id,code) values(inviter,referral_code);
 insert into public.trips(slug,title,status,content)
 values(
  'v7-financial-'||txid_current(),'V7 fictional financial route','published',
  jsonb_build_object(
   'description','Fictional route used only by the rolled-back V7 database regression.',
   'itinerary',jsonb_build_array('Test stop'),'included',jsonb_build_array('Transport'),
   'excluded',jsonb_build_array('Personal expenses'),'childPolicy','Fictional child policy for regression.',
   'luggagePolicy','Fictional luggage policy for regression.','accessibilityInfo','Fictional accessibility information.',
   'mealInfo','Fictional meal information.','weatherPolicy','Fictional weather policy.',
   'cancellationPolicyVersion','v7-test'
  )
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
  insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent) values(inviter,invitee,referral_code,10) returning id into relation_id;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount,gross_amount,discount_amount) values(invitee,departure_id,'v7-order-'||idx||'-'||txid_current(),1,'pending_payment',9000,10000,1000) returning id into order_id;
  update public.orders set status='paid' where id=order_id;
  select id into entry_id from public.cash_commission_entries where source_order_id=order_id;
  if entry_id is null or (select status from public.cash_commission_entries where id=entry_id)<>'pending' then raise exception 'FAIL pending commission was not created';end if;
  update public.cash_commission_entries set status=case idx when 1 then 'available' when 2 then 'locked' else 'paid' end where id=entry_id;
  update public.orders set refunded_amount_jpy=9000,status='refunded' where id=order_id;
  select status into state from public.cash_commission_entries where id=entry_id;
  if idx=1 and state<>'reversed' then raise exception 'FAIL available commission not reversed';end if;
  if idx in(2,3) and state<>'recovery_due' then raise exception 'FAIL locked/paid commission did not create recovery state';end if;
  if (select status from public.orders where id=order_id)<>'refunded' then raise exception 'FAIL refund was blocked by commission state';end if;
 end loop;
 if (select count(*) from public.notification_outbox where event_type='refund-completed' and order_id in(select id from public.orders where id=order_id))>1 then raise exception 'FAIL duplicate refund notification';end if;
 raise notice 'PASS V7 refund and commission convergence';
end$$;
rollback;
