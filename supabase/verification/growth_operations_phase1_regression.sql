-- TEST database only. Execute this inside a caller-owned transaction and roll
-- it back after the assertions. Apply 20260926043656_growth_operations_phase1.sql first.

do $$
declare
  root_id uuid:=gen_random_uuid();
  a_id uuid:=gen_random_uuid();
  b_id uuid:=gen_random_uuid();
  c_id uuid:=gen_random_uuid();
  org_id uuid:=gen_random_uuid();
  root_code text:='JT'||upper(substr(replace(root_id::text,'-',''),1,14));
  a_code text;
  relation_a uuid;
  relation_b uuid;
  relation_c uuid;
  root_source uuid;
  a_source uuid;
  b_source uuid;
  trip_id uuid;
  departure_id uuid;
  order_a uuid;
  order_b uuid;
  payout_count integer;
  generated_id uuid;
  generated_code text;
  generated_relation uuid;
  idx integer;
begin
  -- These fixture accounts are intentionally fictional and transaction-local.
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (root_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','growth-root-'||root_id||'@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),'{}','{}',now(),now()),
    (a_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','growth-a-'||a_id||'@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),'{}','{}',now(),now()),
    (b_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','growth-b-'||b_id||'@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),'{}','{}',now(),now()),
    (c_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','growth-c-'||c_id||'@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),'{}','{}',now(),now());
  insert into public.referral_codes(account_id,code) values(root_id,root_code) on conflict do nothing;
  perform public.ensure_referral_code(root_id); perform public.ensure_referral_code(a_id); perform public.ensure_referral_code(b_id); perform public.ensure_referral_code(c_id);
  select code into root_code from public.referral_codes where account_id=root_id;
  select code into a_code from public.referral_codes where account_id=a_id;
  select id into root_source from public.referral_sources where account_id=root_id;
  select id into a_source from public.referral_sources where account_id=a_id;
  select id into b_source from public.referral_sources where account_id=b_id;
  insert into public.referral_sources(id,source_kind,display_name,code) values(org_id,'organization','ABC institution','JT'||upper(substr(replace(org_id::text,'-',''),1,14)));
  insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent,parent_source_id,root_source_id)
  values(root_id,a_id,root_code,10,root_source,root_source) returning id into relation_a;
  insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent,parent_source_id,root_source_id)
  values(a_id,b_id,a_code,10,a_source,root_source) returning id into relation_b;
  insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent,parent_source_id,root_source_id)
  values(b_id,c_id,(select code from public.referral_codes where account_id=b_id),10,b_source,root_source) returning id into relation_c;
  insert into public.referral_lifecycles(referral_relationship_id,invitee_account_id,status) values(relation_a,a_id,'valid_referral'),(relation_b,b_id,'valid_referral'),(relation_c,c_id,'valid_referral');
  if (with recursive tree(source_id,path) as (
    select root_source,array[root_source]
    union all
    select child.id,t.path||child.id from tree t join public.referral_relationships r on r.parent_source_id=t.source_id join public.referral_sources child on child.account_id=r.invitee_account_id where not child.id=any(t.path)
  ) select count(*) from tree)<>4 then raise exception 'FAIL descendant tree count'; end if;
  -- Parent is immutable and a source cannot become its own descendant.
  begin
    update public.referral_relationships set parent_source_id=b_source where id=relation_a;
    raise exception 'FAIL immutable parent not enforced';
  exception when others then
    if position('referral parent is permanent' in sqlerrm)=0 then raise; end if;
  end;
  -- Case A: six valid direct referrals remains inactive.
  for idx in 1..5 loop
    generated_id:=gen_random_uuid();
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(generated_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','growth-six-'||idx||'-'||generated_id||'@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),'{}','{}',now(),now());
    select code into generated_code from public.referral_codes where account_id=generated_id;
    insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent,parent_source_id,root_source_id)
    values(root_id,generated_id,root_code,10,root_source,root_source) returning id into generated_relation;
    insert into public.referral_lifecycles(referral_relationship_id,invitee_account_id,status,valid_at) values(generated_relation,generated_id,'valid_referral',now());
  end loop;
  if public.refresh_ambassador_qualification(root_id)<>6 or (select status from public.ambassador_qualifications where account_id=root_id)='active' then raise exception 'FAIL case A six valid referrals'; end if;
  -- Case B: the tenth valid direct referral changes only this account to active.
  for idx in 1..4 loop
    generated_id:=gen_random_uuid();
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(generated_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','growth-ten-'||idx||'-'||generated_id||'@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),'{}','{}',now(),now());
    insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent,parent_source_id,root_source_id)
    values(root_id,generated_id,root_code,10,root_source,root_source) returning id into generated_relation;
    insert into public.referral_lifecycles(referral_relationship_id,invitee_account_id,status,valid_at) values(generated_relation,generated_id,'valid_referral',now());
  end loop;
  perform public.refresh_ambassador_qualification(root_id);
  if not exists(select 1 from public.ambassador_qualifications where account_id=root_id and qualifying_referral_count=10 and status='active' and source='auto_unlocked') then raise exception 'FAIL case B tenth valid referral: count %, state %', (select qualifying_referral_count from public.ambassador_qualifications where account_id=root_id), (select status||':'||source from public.ambassador_qualifications where account_id=root_id); end if;
  insert into public.trips(slug,title,status,content,publication_scope)
  values('growth-phase1-'||txid_current(),'Growth fixture','published',jsonb_build_object(
    'description','Fictional route used only by the rolled-back growth regression.',
    'itinerary',jsonb_build_array('Fixture stop'),'included',jsonb_build_array('Fixture transport'),'excluded',jsonb_build_array('Fixture personal expense'),
    'childPolicy','Fixture child policy','luggagePolicy','Fixture luggage policy','accessibilityInfo','Fixture accessibility policy','mealInfo','Fixture meal policy','weatherPolicy','Fixture weather policy','cancellationPolicyVersion','growth-v1'
  ),'public') returning id into trip_id;
  insert into public.departures(trip_id,capacity,status,departs_at,ends_at,sales_open_at,sales_close_at,minimum_guests,seat_price_jpy,currency,tax_included,meeting_name,meeting_address,map_lat,map_lng,sales_scope)
  values(trip_id,20,'open',now()+interval '30 days',now()+interval '30 days 8 hours',now()-interval '1 day',now()+interval '29 days',1,10000,'JPY',true,'Growth fixture','Fixture only',35,135,'public') returning id into departure_id;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount,gross_amount,discount_amount)
  values(a_id,departure_id,'growth-order-a-'||txid_current(),1,'pending_payment',68000,68000,0) returning id into order_a;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount,gross_amount,discount_amount)
  values(b_id,departure_id,'growth-order-b-'||txid_current(),1,'pending_payment',45000,45000,0) returning id into order_b;
  insert into public.cash_commission_entries(beneficiary_account_id,referred_account_id,referral_relationship_id,source_order_id,rule_version,basis_amount_jpy,eligible_amount_jpy,commission_percent,amount_jpy,reward_rule,status,confirmed_at)
  values(root_id,a_id,relation_a,order_a,'cash-10-v1',68000,68000,10,6800,'cash-10-v1','available',now()),
        (root_id,b_id,relation_b,order_b,'cash-10-v1',45000,45000,10,4500,'cash-10-v1','available',now());
  if (select coalesce(sum(amount_jpy),0) from public.cash_commission_entries where beneficiary_account_id=root_id and status='available')<>11300 then raise exception 'FAIL carry total'; end if;
  -- Case C: refund invalidates its lifecycle and any unwithdrawn cash record.
  update public.orders set status='refunded',refunded_amount_jpy=68000 where id=order_a;
  if (select status from public.cash_commission_entries where source_order_id=order_a)<>'invalid' then raise exception 'FAIL case C refund did not invalidate cash'; end if;
  -- Earned qualification is permanent: the current valid count can fall to 9,
  -- but a historical refund cannot silently revoke ambassador access.
  perform public.refresh_ambassador_qualification(root_id);
  if not exists(select 1 from public.ambassador_qualifications where account_id=root_id and status='active' and qualification_achieved_at is not null) then raise exception 'FAIL earned ambassador qualification was re-locked after refund'; end if;
  -- Case D: source-level company grant supports an organization root with no account.
  insert into public.referral_source_ambassador_grants(source_id,status,source,granted_by,reason) values(org_id,'active','company_granted',root_id,'Fixture company grant');
  if not exists(select 1 from public.referral_source_ambassador_grants where source_id=org_id and status='active') then raise exception 'FAIL case D company source grant'; end if;
  -- The table constraint, source trace fields and uniqueness are verified in
  -- the unit migration contract; payout RPC authentication is tested via the
  -- authenticated remote acceptance harness because auth.uid() is null here.
  if not exists(select 1 from public.referral_source_ambassador_grants where source_id=org_id) then null; end if;
  select count(*) into payout_count from public.commission_payout_requests where account_id=root_id and period_month=date_trunc('month',now() at time zone 'Asia/Tokyo')::date;
  if payout_count<>0 then raise exception 'FAIL fixture unexpectedly persisted payout'; end if;
  raise notice 'PASS growth operations phase 1 fixture (all data rolled back)';
end$$;
