begin;

-- Route referral growth convergence.
-- This migration extends the existing referral/coupon/cash ledgers. It does
-- not create parallel accounts, orders, referrals or reward systems.

alter table public.passengers
  add column if not exists paid_seat_eligible boolean not null default true;
alter table public.passengers
  add column if not exists commerce_status text not null default 'paid';
alter table public.passengers drop constraint if exists passengers_commerce_status_check;
alter table public.passengers add constraint passengers_commerce_status_check
  check(commerce_status in ('paid','free','cancelled','refunded'));

-- One family order may be allocated across multiple vehicle groups. Passenger
-- check-ins remain the authority for which paid seat completed which group.
alter table public.vehicle_group_orders drop constraint if exists vehicle_group_orders_order_id_key;
create index if not exists vehicle_group_orders_order_idx on public.vehicle_group_orders(order_id,vehicle_group_id);

create table if not exists public.referral_qualified_seats(
  passenger_id uuid primary key references public.passengers(id) on delete restrict,
  referral_relationship_id uuid not null references public.referral_relationships(id) on delete restrict,
  inviter_account_id uuid not null references public.profiles(id) on delete restrict,
  invitee_account_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  vehicle_group_id uuid not null references public.vehicle_groups(id) on delete restrict,
  status text not null default 'qualified' check(status in ('qualified','reversed')),
  qualified_at timestamptz not null,
  reversed_at timestamptz,
  reversal_reason text,
  source_event_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((status='qualified' and reversed_at is null) or status='reversed')
);
create index if not exists referral_qualified_seats_inviter_idx
  on public.referral_qualified_seats(inviter_account_id,status,qualified_at);
create index if not exists referral_qualified_seats_order_idx
  on public.referral_qualified_seats(order_id,status);

create table if not exists public.referral_learning_eligibilities(
  account_id uuid primary key references public.profiles(id) on delete restrict,
  qualifying_paid_seats integer not null default 0 check(qualifying_paid_seats>=0),
  eligibility_status text not null default 'not_eligible'
    check(eligibility_status in ('not_eligible','content_pending','learning_available','in_progress','passed')),
  eligible_at timestamptz,
  course_version text,
  answer_version text,
  accepted_rules_at timestamptz,
  passed_at timestamptz,
  updated_at timestamptz not null default now(),
  check((eligibility_status='passed' and passed_at is not null) or eligibility_status<>'passed')
);

create table if not exists public.referral_certification_config(
  singleton boolean primary key default true check(singleton),
  content_published boolean not null default false,
  course_version text,
  scored_question_count integer not null default 8 check(scored_question_count between 1 and 50),
  survey_question_count integer not null default 2 check(survey_question_count between 0 and 20),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  check((content_published and course_version is not null and published_at is not null) or not content_published)
);
insert into public.referral_certification_config(singleton) values(true)
on conflict(singleton) do nothing;

create table if not exists public.ambassador_activity_states(
  account_id uuid primary key references public.profiles(id) on delete restrict,
  status text not null default 'review_required'
    check(status in ('active','referral_in_progress','care_due','inactive','review_required')),
  observed_from timestamptz,
  last_qualified_at timestamptz,
  pending_first_paid_count integer not null default 0 check(pending_first_paid_count>=0),
  care_recorded_at timestamptz,
  evaluated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ambassador_qualifications
  add column if not exists qualifying_paid_seat_count integer not null default 0;
alter table public.ambassador_qualifications
  add column if not exists learning_eligible_at timestamptz;
alter table public.ambassador_qualifications drop constraint if exists ambassador_qualifications_source_check;
alter table public.ambassador_qualifications add constraint ambassador_qualifications_source_check
  check(source in ('staff_approval','passenger_application','operations','auto_unlocked','company_granted','learning_candidate','certification'));

alter table public.referral_qualified_seats enable row level security;
alter table public.referral_learning_eligibilities enable row level security;
alter table public.referral_certification_config enable row level security;
alter table public.ambassador_activity_states enable row level security;
revoke all on public.referral_qualified_seats,public.referral_learning_eligibilities,
  public.referral_certification_config,public.ambassador_activity_states from public,anon,authenticated;
grant select on public.referral_qualified_seats,public.referral_learning_eligibilities,
  public.referral_certification_config,public.ambassador_activity_states to authenticated;
grant all on public.referral_qualified_seats,public.referral_learning_eligibilities,
  public.referral_certification_config,public.ambassador_activity_states to service_role;

create policy referral_qualified_seats_owner_ops on public.referral_qualified_seats
for select to authenticated using(invitee_account_id=(select auth.uid()) or public.is_operations());
create policy referral_learning_own_ops on public.referral_learning_eligibilities
for select to authenticated using(account_id=(select auth.uid()) or public.is_operations());
create policy referral_certification_authenticated_read on public.referral_certification_config
for select to authenticated using(true);
create policy ambassador_activity_own_ops on public.ambassador_activity_states
for select to authenticated using(account_id=(select auth.uid()) or public.is_operations());

-- The two approved referral coupon families use a fixed 90-day lifetime.
-- Existing coupon expiry timestamps are deliberately untouched.
update public.referral_program_settings set validity_days=90,updated_at=now() where id=true;

create or replace function public.operations_update_referral_settings(
  p_discount_percent integer,p_validity_days integer,p_active boolean
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if p_discount_percent not between 1 and 50 or p_validity_days<>90 then
    raise exception 'referral coupon validity is fixed at 90 days';
  end if;
  update public.referral_program_settings
  set discount_percent=p_discount_percent,validity_days=90,active=p_active,
      updated_by=auth.uid(),updated_at=now()
  where id=true;
  return found;
end$$;

create or replace function public.apply_referral_registration(p_invitee uuid,p_raw_code text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.referral_program_settings%rowtype; v_source public.referral_sources%rowtype; v_relation uuid; v_code text:=upper(trim(coalesce(p_raw_code,'')));
begin
  if v_code='' then return false; end if;
  select * into cfg from public.referral_program_settings where id=true;
  if not found or not cfg.active then return false; end if;
  if exists(select 1 from public.referral_relationships where invitee_account_id=p_invitee)
     or exists(select 1 from public.orders where account_id=p_invitee) then return false; end if;
  select * into v_source from public.referral_sources where code=v_code and active and disabled_at is null;
  if not found then
    select rs.* into v_source from public.referral_codes rc join public.referral_sources rs on rs.account_id=rc.account_id
    where rc.code=v_code and rs.active and rs.disabled_at is null;
  end if;
  if not found or v_source.account_id=p_invitee then return false; end if;
  perform public.assert_referral_parent_is_safe(p_invitee,v_source.id);
  insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent,parent_source_id,root_source_id)
  values(v_source.account_id,p_invitee,v_code,cfg.discount_percent,v_source.id,public.referral_source_root(v_source.id))
  on conflict(invitee_account_id) do nothing returning id into v_relation;
  if v_relation is null then return false; end if;
  insert into public.referral_lifecycles(referral_relationship_id,invitee_account_id,status,registered_at)
  values(v_relation,p_invitee,'registered',now()) on conflict(referral_relationship_id) do nothing;
  insert into public.discount_coupons(account_id,referral_relationship_id,recipient_kind,discount_percent,status,expires_at,activated_at,source_type,rules_version,source_event_id,max_discounted_seats)
  values(p_invitee,v_relation,'invitee',cfg.discount_percent,'active',now()+interval '90 days',now(),'referral','referral-newcomer-90d-v1','newcomer:'||v_relation::text,1)
  on conflict(account_id,referral_relationship_id) do nothing;
  return true;
end$$;

-- Payment no longer starts an inviter coupon clock. Historical scheduling
-- columns remain as immutable audit data.
drop trigger if exists schedule_referral_reward_after_payment_trigger on public.orders;
create or replace function public.schedule_referral_reward_after_payment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$begin return new; end$$;
create or replace function public.activate_referral_rewards_at_refund_cutoff(p_account uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$begin return 0; end$$;

-- Keep the historical journey trigger wired, but make its implementation use
-- the authoritative per-passenger lifecycle calculation below. This prevents
-- the old "any boarded passenger" shortcut from activating a reward.
create or replace function public.activate_completed_referral_rewards(p_vehicle_group uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order uuid; v_before integer; v_after integer; v_changed integer:=0;
begin
  if not (current_user in ('service_role','postgres') or public.is_operations() or public.is_group_staff(p_vehicle_group)) then
    raise exception 'assigned staff or operations only';
  end if;
  if not exists(select 1 from public.vehicle_group_journey_state where vehicle_group_id=p_vehicle_group and status='completed') then
    raise exception 'journey not completed';
  end if;
  for v_order in select order_id from public.vehicle_group_orders where vehicle_group_id=p_vehicle_group loop
    select count(*)::integer into v_before from public.discount_coupons
      where qualifying_order_id=v_order and recipient_kind='inviter' and status in ('active','reserved','redeemed');
    perform public.refresh_referral_lifecycle_for_order(v_order);
    select count(*)::integer into v_after from public.discount_coupons
      where qualifying_order_id=v_order and recipient_kind='inviter' and status in ('active','reserved','redeemed');
    v_changed:=v_changed+greatest(v_after-v_before,0);
  end loop;
  return v_changed;
end$$;

create or replace function public.refresh_ambassador_qualification(p_account uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_paid_seats integer; v_published boolean;
begin
  select count(*)::integer into v_paid_seats from public.referral_qualified_seats
  where inviter_account_id=p_account and status='qualified';
  select content_published into v_published from public.referral_certification_config where singleton=true;
  insert into public.ambassador_qualifications(account_id,status,source,qualifying_referral_count,qualifying_paid_seat_count,learning_eligible_at,updated_at)
  values(p_account,'pending',case when v_paid_seats>=10 then 'learning_candidate' else 'passenger_application' end,
    0,v_paid_seats,case when v_paid_seats>=10 then now() else null end,now())
  on conflict(account_id) do update set
    qualifying_paid_seat_count=excluded.qualifying_paid_seat_count,
    learning_eligible_at=case when excluded.qualifying_paid_seat_count>=10 then coalesce(public.ambassador_qualifications.learning_eligible_at,now()) else public.ambassador_qualifications.learning_eligible_at end,
    status=case
      when public.ambassador_qualifications.status in ('active','approved','suspended')
        or public.ambassador_qualifications.source in ('staff_approval','company_granted','auto_unlocked','certification')
        or public.ambassador_qualifications.qualification_achieved_at is not null
      then public.ambassador_qualifications.status else 'pending' end,
    source=case
      when public.ambassador_qualifications.status in ('active','approved','suspended')
        or public.ambassador_qualifications.source in ('staff_approval','company_granted','auto_unlocked','certification')
        or public.ambassador_qualifications.qualification_achieved_at is not null
      then public.ambassador_qualifications.source
      when excluded.qualifying_paid_seat_count>=10 then 'learning_candidate'
      else 'passenger_application' end,
    updated_at=now();
  insert into public.referral_learning_eligibilities(account_id,qualifying_paid_seats,eligibility_status,eligible_at,updated_at)
  values(p_account,v_paid_seats,
    case when v_paid_seats<10 then 'not_eligible' when v_published then 'learning_available' else 'content_pending' end,
    case when v_paid_seats>=10 then now() else null end,now())
  on conflict(account_id) do update set
    qualifying_paid_seats=excluded.qualifying_paid_seats,
    eligibility_status=case when public.referral_learning_eligibilities.eligibility_status='passed' then 'passed' else excluded.eligibility_status end,
    eligible_at=case when excluded.qualifying_paid_seats>=10 then coalesce(public.referral_learning_eligibilities.eligible_at,now()) else public.referral_learning_eligibilities.eligible_at end,
    updated_at=now();
  return v_paid_seats;
end$$;

create or replace function public.issue_completed_referral_coupon(p_relation uuid,p_order uuid,p_trip uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.referral_relationships%rowtype; cfg public.referral_program_settings%rowtype; v_id uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  select * into r from public.referral_relationships where id=p_relation;
  if not found or r.inviter_account_id is null then return null; end if;
  if public.growth_is_cash_eligible(r.inviter_account_id) then return null; end if;
  if exists(select 1 from public.cash_commission_entries where referral_relationship_id=p_relation) then return null; end if;
  select * into cfg from public.referral_program_settings where id=true;
  update public.discount_coupons set status='active',activated_at=coalesce(activated_at,now()),
    expires_at=case when activated_at is null then now()+interval '90 days' else expires_at end,
    qualifying_order_id=coalesce(qualifying_order_id,p_order),source_order_id=coalesce(source_order_id,p_order),
    source_trip_id=coalesce(source_trip_id,p_trip),rules_version='referral-completed-90d-v1',
    source_event_id=coalesce(source_event_id,'referral-completed:'||p_relation::text),available_at=now()
  where referral_relationship_id=p_relation and recipient_kind='inviter' and status='pending_trip_completion'
  returning id into v_id;
  if v_id is not null then return v_id; end if;
  insert into public.discount_coupons(account_id,referral_relationship_id,recipient_kind,discount_percent,status,
    expires_at,activated_at,available_at,qualifying_order_id,source_type,rules_version,source_event_id,
    source_order_id,source_trip_id,max_discounted_seats)
  values(r.inviter_account_id,p_relation,'inviter',cfg.discount_percent,'active',now()+interval '90 days',now(),now(),p_order,
    'referral','referral-completed-90d-v1','referral-completed:'||p_relation::text,p_order,p_trip,1)
  on conflict(referral_relationship_id,recipient_kind) do nothing returning id into v_id;
  return v_id;
end$$;

create or replace function public.refresh_referral_lifecycle_for_order(p_order uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype; r public.referral_relationships%rowtype; l public.referral_lifecycles%rowtype;
  v_group uuid; v_completed timestamptz; v_seats integer; v_rule public.commission_rule_versions%rowtype; v_basis integer;
begin
  select * into o from public.orders where id=p_order for update;
  if not found then return 'missing_order'; end if;
  select * into r from public.referral_relationships where invitee_account_id=o.account_id;
  if not found then return 'not_referred'; end if;
  insert into public.referral_lifecycles(referral_relationship_id,invitee_account_id,registered_at)
  values(r.id,r.invitee_account_id,r.created_at) on conflict(referral_relationship_id) do nothing;
  select * into l from public.referral_lifecycles where referral_relationship_id=r.id for update;
  if l.first_order_id is null then
    update public.referral_lifecycles set first_order_id=o.id,first_order_created_at=o.created_at,status='first_order_created',updated_at=now()
    where referral_relationship_id=r.id;
    l.first_order_id:=o.id;
  end if;
  if l.first_order_id<>o.id then return 'not_first_order'; end if;
  if o.status in ('cancelled','refunded') or coalesce(o.refunded_amount_jpy,0)>=greatest(coalesce(o.amount,0),0) then
    update public.referral_lifecycles set status=case when o.status='refunded' or coalesce(o.refunded_amount_jpy,0)>0 then 'refunded' else 'cancelled' end,
      invalid_reason='first_order_cancelled_or_final_refunded',updated_at=now()
    where referral_relationship_id=r.id;
    update public.referral_qualified_seats set status='reversed',reversed_at=coalesce(reversed_at,now()),
      reversal_reason=coalesce(reversal_reason,'source_order_cancelled_or_final_refunded'),updated_at=now()
    where order_id=o.id and status='qualified';
    update public.cash_commission_entries set status='invalid',invalid_reason='source_order_cancelled_or_final_refunded',updated_at=now()
    where source_order_id=o.id and status in ('pending','confirmed','available','carried_over','withdrawal_pending');
    update public.discount_coupons set status='frozen'
    where referral_relationship_id=r.id and recipient_kind='inviter' and status in ('active','reserved');
    if r.inviter_account_id is not null then perform public.refresh_ambassador_qualification(r.inviter_account_id); end if;
    return 'invalid';
  end if;
  if o.status not in ('paid','confirmed') or coalesce(o.amount,0)<=0 then return 'awaiting_payment'; end if;
  update public.referral_lifecycles set first_paid_order_id=coalesce(first_paid_order_id,o.id),
    first_payment_completed_at=coalesce(first_payment_completed_at,now()),
    status=case when status in ('registered','first_order_created') then 'first_payment_completed' else status end,updated_at=now()
  where referral_relationship_id=r.id;
  insert into public.referral_qualified_seats(passenger_id,referral_relationship_id,inviter_account_id,invitee_account_id,
    order_id,vehicle_group_id,status,qualified_at,source_event_id)
  select p.id,r.id,r.inviter_account_id,r.invitee_account_id,o.id,pc.vehicle_group_id,'qualified',js.completed_at,
    'completed-paid-seat:'||p.id::text
  from public.passengers p
  join public.passenger_checkins pc on pc.passenger_id=p.id and pc.order_id=o.id and pc.status='boarded'
  join public.vehicle_group_journey_state js on js.vehicle_group_id=pc.vehicle_group_id and js.status='completed' and js.completed_at is not null
  join public.departures d on d.id=o.departure_id and coalesce(d.sales_scope,'public')='public'
  join public.trips t on t.id=d.trip_id and coalesce(t.publication_scope,'public')='public'
  where p.order_id=o.id and p.paid_seat_eligible and p.commerce_status='paid' and r.inviter_account_id is not null
  on conflict(passenger_id) do nothing;
  select count(*)::integer,(array_agg(vehicle_group_id order by qualified_at,passenger_id))[1],min(qualified_at)
  into v_seats,v_group,v_completed
  from public.referral_qualified_seats where order_id=o.id and referral_relationship_id=r.id and status='qualified';
  if coalesce(v_seats,0)=0 then return 'awaiting_completed_paid_seats'; end if;
  update public.referral_lifecycles set first_completed_order_id=o.id,first_completed_vehicle_group_id=v_group,
    first_trip_completed_at=coalesce(first_trip_completed_at,v_completed),valid_at=coalesce(valid_at,v_completed),
    status='valid_referral',invalid_reason=null,updated_at=now() where referral_relationship_id=r.id;
  if r.inviter_account_id is not null then perform public.refresh_ambassador_qualification(r.inviter_account_id); end if;
  if r.inviter_account_id is not null and public.growth_is_cash_eligible(r.inviter_account_id) then
    update public.discount_coupons set status='void'
      where referral_relationship_id=r.id and recipient_kind='inviter' and status='pending_trip_completion';
    select * into v_rule from public.commission_rule_versions where effective_from<=o.created_at
      and (effective_until is null or effective_until>o.created_at) order by effective_from desc limit 1;
    v_basis:=public.commission_basis_for_order(o.id);
    if found and v_basis>0 and not exists(select 1 from public.discount_coupons where referral_relationship_id=r.id and recipient_kind='inviter' and status not in ('void','expired')) then
      insert into public.cash_commission_entries(beneficiary_account_id,referred_account_id,referral_relationship_id,source_order_id,source_trip_id,
        rule_version,eligible_amount_jpy,basis_amount_jpy,commission_percent,amount_jpy,reward_rule,status,confirmed_at,unlocked_at,completed_vehicle_group_id)
      values(r.inviter_account_id,r.invitee_account_id,r.id,o.id,v_group,v_rule.id,v_basis,v_basis,v_rule.commission_percent,
        floor(v_basis*v_rule.commission_percent/100.0)::integer,v_rule.id,'available',now(),now(),v_group)
      on conflict(source_order_id) do nothing;
    end if;
  else
    perform public.issue_completed_referral_coupon(r.id,o.id,v_group);
  end if;
  return 'valid_referral';
end$$;

create or replace function public.record_referral_passenger_commerce_status(
  p_passenger uuid,p_status text,p_reason text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order uuid; v_inviter uuid; v_remaining integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_status not in ('paid','free','cancelled','refunded') or length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'valid passenger status and reason required';
  end if;
  select order_id into v_order from public.passengers where id=p_passenger for update;
  if not found then raise exception 'passenger not found'; end if;
  update public.passengers set commerce_status=p_status,paid_seat_eligible=(p_status='paid') where id=p_passenger;
  if p_status<>'paid' then
    update public.referral_qualified_seats set status='reversed',reversed_at=coalesce(reversed_at,now()),
      reversal_reason=left(trim(p_reason),500),updated_at=now() where passenger_id=p_passenger and status='qualified';
  end if;
  select r.inviter_account_id into v_inviter from public.referral_relationships r join public.orders o on o.account_id=r.invitee_account_id where o.id=v_order;
  if v_inviter is not null then v_remaining:=public.refresh_ambassador_qualification(v_inviter); end if;
  if not exists(select 1 from public.referral_qualified_seats where order_id=v_order and status='qualified') then
    update public.discount_coupons c set status='frozen' from public.referral_relationships r
    where r.invitee_account_id=(select account_id from public.orders where id=v_order)
      and c.referral_relationship_id=r.id and c.recipient_kind='inviter' and c.status in ('active','reserved');
  end if;
  return coalesce(v_remaining,0);
end$$;

create or replace function public.refresh_ambassador_activity(p_account uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_start timestamptz; v_last timestamptz; v_pending integer; v_status text; v_days numeric;
begin
  if not exists(select 1 from public.ambassador_qualifications where account_id=p_account and status in ('active','approved') and revoked_at is null)
     and not exists(select 1 from public.profiles where id=p_account and role in ('driver','guide')) then return 'not_applicable'; end if;
  select coalesce(activated_at,approved_at,qualification_achieved_at,applied_at) into v_start from public.ambassador_qualifications where account_id=p_account;
  select max(qualified_at) into v_last from public.referral_qualified_seats where inviter_account_id=p_account and status='qualified';
  select count(*)::integer into v_pending from public.referral_lifecycles l join public.referral_relationships r on r.id=l.referral_relationship_id
  join public.orders o on o.id=l.first_paid_order_id join public.departures d on d.id=o.departure_id
  where r.inviter_account_id=p_account and l.status='first_payment_completed' and o.status in ('paid','confirmed') and d.departs_at>now();
  if v_pending>0 then v_status:='referral_in_progress';
  elsif coalesce(v_last,v_start) is null then v_status:='review_required';
  else
    v_days:=extract(epoch from (now()-coalesce(v_last,v_start)))/86400;
    v_status:=case when v_days>=90 then 'inactive' when v_days>=60 then 'care_due' else 'active' end;
  end if;
  insert into public.ambassador_activity_states(account_id,status,observed_from,last_qualified_at,pending_first_paid_count,care_recorded_at,evaluated_at,updated_at)
  values(p_account,v_status,v_start,v_last,v_pending,case when v_status='care_due' then now() else null end,now(),now())
  on conflict(account_id) do update set status=excluded.status,observed_from=coalesce(public.ambassador_activity_states.observed_from,excluded.observed_from),
    last_qualified_at=excluded.last_qualified_at,pending_first_paid_count=excluded.pending_first_paid_count,
    care_recorded_at=case when excluded.status='care_due' then coalesce(public.ambassador_activity_states.care_recorded_at,now()) else public.ambassador_activity_states.care_recorded_at end,
    evaluated_at=now(),updated_at=now();
  return v_status;
end$$;

create or replace function public.resolve_public_referral_invitation(p_code text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select case when s.id is null then jsonb_build_object('valid',false)
    else jsonb_build_object('valid',true,'code',s.code,'rewardMode',case when s.account_id is not null and public.growth_is_cash_eligible(s.account_id) then 'cash' else 'coupon' end)
  end
  from (select upper(trim(coalesce(p_code,''))) code) input
  left join public.referral_sources s on s.code=input.code and s.active and s.disabled_at is null
  limit 1
$$;

create or replace function public.get_own_referral_summary() returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare own_code text; cfg public.referral_program_settings%rowtype; seat_count integer; registered_count integer; order_count integer; learning jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  own_code:=public.ensure_referral_code(auth.uid());
  select * into cfg from public.referral_program_settings where id=true;
  select count(*)::integer into registered_count from public.referral_relationships where inviter_account_id=auth.uid();
  select count(distinct order_id)::integer,count(*)::integer into order_count,seat_count
    from public.referral_qualified_seats where inviter_account_id=auth.uid() and status='qualified';
  select jsonb_build_object('status',eligibility_status,'eligibleAt',eligible_at,'contentPublished',
    (select content_published from public.referral_certification_config where singleton=true),'qualifyingPaidSeats',qualifying_paid_seats)
    into learning from public.referral_learning_eligibilities where account_id=auth.uid();
  return jsonb_build_object('code',own_code,'active',cfg.active,'discountPercent',cfg.discount_percent,'validityDays',90,
    'registeredAccounts',registered_count,'successfulInvites',registered_count,'completedOrders',coalesce(order_count,0),
    'completedInvites',coalesce(seat_count,0),'qualifyingPaidSeats',coalesce(seat_count,0),
    'pendingInvites',greatest(registered_count-coalesce(order_count,0),0),
    'achievementKey',case when seat_count>=10 then 'learning_candidate' when seat_count>=3 then 'rising_promoter' when seat_count>=1 then 'travel_sharer' else 'travel_explorer' end,
    'nextMilestone',case when seat_count<10 then 10 else null end,'learning',coalesce(learning,jsonb_build_object('status','not_eligible','contentPublished',false,'qualifyingPaidSeats',0)),
    'coupons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'discountPercent',discount_percent,'status',status,
      'expiresAt',expires_at,'recipientKind',recipient_kind,'activatedAt',activated_at,'availableAt',available_at,
      'qualifyingTripStartsAt',qualifying_trip_starts_at,'rulesVersion',rules_version) order by created_at desc)
      from public.discount_coupons where account_id=auth.uid()),'[]'::jsonb));
end$$;

create or replace function public.get_ambassador_dashboard() returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare v_activity text; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform public.refresh_ambassador_qualification(auth.uid());
  v_activity:=public.refresh_ambassador_activity(auth.uid());
  with me as (select auth.uid() account_id), q as (select * from public.ambassador_qualifications where account_id=auth.uid()),
  rel as (select r.id,r.created_at,l.first_payment_completed_at,l.valid_at,l.status from public.referral_relationships r left join public.referral_lifecycles l on l.referral_relationship_id=r.id where r.inviter_account_id=auth.uid()),
  seats as (select * from public.referral_qualified_seats where inviter_account_id=auth.uid() and status='qualified'),
  cash as (select * from public.cash_commission_entries where beneficiary_account_id=auth.uid()), payouts as (select * from public.commission_payout_requests where account_id=auth.uid()),
  bounds as (select date_trunc('month',now() at time zone 'Asia/Tokyo')::timestamptz current_start,(date_trunc('month',now() at time zone 'Asia/Tokyo')-interval '1 month')::timestamptz previous_start),
  learning as (select * from public.referral_learning_eligibilities where account_id=auth.uid())
  select jsonb_build_object(
    'qualification',jsonb_build_object('active',coalesce((select status in ('active','approved') and revoked_at is null from q),false),
      'status',coalesce((select status from q),'pending'),'achievedAt',(select qualification_achieved_at from q),'source',(select qualification_source from q),
      'currentValidReferrals',coalesce((select qualifying_referral_count from q),0),'currentPaidSeats',coalesce((select qualifying_paid_seat_count from q),0),
      'learningEligible',coalesce((select qualifying_paid_seats>=10 from learning),false),'learningStatus',coalesce((select eligibility_status from learning),'not_eligible'),
      'contentPublished',(select content_published from public.referral_certification_config where singleton=true)),
    'activity',jsonb_build_object('status',v_activity,'pendingFirstPaid',(select pending_first_paid_count from public.ambassador_activity_states where account_id=auth.uid()),
      'lastQualifiedAt',(select last_qualified_at from public.ambassador_activity_states where account_id=auth.uid())),
    'referralCode',coalesce((select code from public.referral_sources where account_id=auth.uid() order by created_at limit 1),''),
    'currentMonth',jsonb_build_object('registered',(select count(*) from rel,bounds where rel.created_at>=bounds.current_start),
      'firstPaid',(select count(*) from rel,bounds where rel.first_payment_completed_at>=bounds.current_start),
      'validReferrals',(select count(*) from rel,bounds where rel.valid_at>=bounds.current_start and rel.status='valid_referral'),
      'paidSeats',(select count(*) from seats,bounds where seats.qualified_at>=bounds.current_start),
      'rewardAmount',coalesce((select sum(amount_jpy) from cash,bounds where confirmed_at>=bounds.current_start and status not in ('invalid','void')),0)),
    'previousMonth',jsonb_build_object('registered',(select count(*) from rel,bounds where rel.created_at>=bounds.previous_start and rel.created_at<bounds.current_start),
      'firstPaid',(select count(*) from rel,bounds where rel.first_payment_completed_at>=bounds.previous_start and rel.first_payment_completed_at<bounds.current_start),
      'validReferrals',(select count(*) from rel,bounds where rel.valid_at>=bounds.previous_start and rel.valid_at<bounds.current_start and rel.status='valid_referral'),
      'paidSeats',(select count(*) from seats,bounds where seats.qualified_at>=bounds.previous_start and seats.qualified_at<bounds.current_start),
      'rewardAmount',coalesce((select sum(amount_jpy) from cash,bounds where confirmed_at>=bounds.previous_start and confirmed_at<bounds.current_start and status not in ('invalid','void')),0)),
    'lifetime',jsonb_build_object('registered',(select count(*) from rel),'validReferrals',(select count(*) from rel where status='valid_referral'),
      'paidSeats',(select count(*) from seats),'completedOrders',(select count(distinct order_id) from seats),
      'totalReward',coalesce((select sum(amount_jpy) from cash where status not in ('invalid','void')),0),
      'totalPaidOut',coalesce((select sum(amount_jpy) from payouts where status='paid'),0),
      'currentBalance',coalesce((select sum(amount_jpy) from cash where status in ('available','carried_over')),0)),
    'withdrawal',jsonb_build_object('threshold',10000,'eligibleAmount',coalesce((select sum(amount_jpy) from cash where status in ('available','carried_over')),0),
      'requestedThisMonth',exists(select 1 from payouts,bounds where period_month=bounds.current_start::date),
      'status',coalesce((select status from payouts,bounds where period_month=bounds.current_start::date order by requested_at desc limit 1),'not_requested')),
    'cashRule',coalesce((select jsonb_build_object('id',reward_rule,'percent',commission_percent) from cash order by confirmed_at desc nulls last,created_at desc limit 1),jsonb_build_object('id','cash-10-v1','percent',10))
  ) into v_result;
  return v_result;
end$$;

create or replace function public.operations_review_ambassador(p_account uuid,p_decision text,p_note text default '') returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() or p_decision not in ('approved','rejected','suspended') then raise exception 'operations role required'; end if;
  if p_decision='approved' and not exists(
    select 1 from public.ambassador_qualifications q where q.account_id=p_account
      and (q.source in ('staff_approval','company_granted') or exists(select 1 from public.referral_learning_eligibilities l where l.account_id=p_account and l.eligibility_status='passed'))
  ) then raise exception 'approved certification or direct grant required'; end if;
  update public.ambassador_qualifications set status=p_decision,
    source=case when p_decision='approved' and source not in ('staff_approval','company_granted') then 'certification' else source end,
    reviewed_by=auth.uid(),review_note=left(trim(coalesce(p_note,'')),500),
    approved_at=case when p_decision='approved' then coalesce(approved_at,now()) else approved_at end,
    activated_at=case when p_decision='approved' then coalesce(activated_at,now()) else activated_at end,updated_at=now()
  where account_id=p_account;
  return found;
end$$;

revoke all on function public.resolve_public_referral_invitation(text),public.issue_completed_referral_coupon(uuid,uuid,uuid),
  public.record_referral_passenger_commerce_status(uuid,text,text),public.refresh_ambassador_activity(uuid),
  public.activate_completed_referral_rewards(uuid) from public,anon,authenticated;
grant execute on function public.resolve_public_referral_invitation(text) to anon,authenticated;
grant execute on function public.issue_completed_referral_coupon(uuid,uuid,uuid),public.record_referral_passenger_commerce_status(uuid,text,text),
  public.refresh_ambassador_qualification(uuid),public.refresh_referral_lifecycle_for_order(uuid),public.refresh_ambassador_activity(uuid),
  public.activate_completed_referral_rewards(uuid) to service_role;
grant execute on function public.get_own_referral_summary(),public.get_ambassador_dashboard() to authenticated;
grant execute on function public.operations_review_ambassador(uuid,text,text),public.operations_update_referral_settings(integer,integer,boolean) to authenticated,service_role;

commit;
