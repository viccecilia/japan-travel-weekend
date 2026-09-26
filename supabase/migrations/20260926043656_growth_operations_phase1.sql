begin;

-- Growth Operations V1 deliberately extends the existing referral, coupon and
-- cash-commission records.  It does not introduce a second account, order or
-- reward system.

create table if not exists public.referral_sources(
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check(source_kind in ('account','organization','company','school','partner','other')),
  account_id uuid unique references public.profiles(id) on delete restrict,
  display_name text not null default '',
  code text not null unique check(code ~ '^[A-Z0-9]{6,32}$'),
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  check((source_kind='account' and account_id is not null) or (source_kind<>'account'))
);

-- Existing public account codes remain stable.  The source row adds the
-- organization/company root capability required by the future tree.
insert into public.referral_sources(source_kind,account_id,display_name,code,created_at)
select 'account', rc.account_id, coalesce(p.display_name,''), rc.code, rc.created_at
from public.referral_codes rc join public.profiles p on p.id=rc.account_id
on conflict(account_id) do nothing;

alter table public.referral_relationships add column if not exists parent_source_id uuid references public.referral_sources(id) on delete restrict;
alter table public.referral_relationships add column if not exists root_source_id uuid references public.referral_sources(id) on delete restrict;
alter table public.referral_relationships alter column inviter_account_id drop not null;

update public.referral_relationships r
set parent_source_id=s.id,
    root_source_id=coalesce(r.root_source_id,s.id)
from public.referral_sources s
where s.account_id=r.inviter_account_id and r.parent_source_id is null;

alter table public.referral_relationships
  add constraint referral_relationship_parent_source_required check(parent_source_id is not null) not valid;
alter table public.referral_relationships validate constraint referral_relationship_parent_source_required;
alter table public.referral_relationships
  add constraint referral_relationship_not_own_source check(inviter_account_id is null or inviter_account_id<>invitee_account_id) not valid;
alter table public.referral_relationships validate constraint referral_relationship_not_own_source;
create index if not exists referral_relationships_parent_source_idx on public.referral_relationships(parent_source_id,created_at);
create index if not exists referral_relationships_root_source_idx on public.referral_relationships(root_source_id,created_at);

create table if not exists public.referral_lifecycles(
  referral_relationship_id uuid primary key references public.referral_relationships(id) on delete restrict,
  invitee_account_id uuid not null unique references public.profiles(id) on delete restrict,
  status text not null default 'registered' check(status in ('registered','first_order_created','first_payment_completed','first_trip_completed','valid_referral','cancelled','refunded','invalid')),
  registered_at timestamptz not null default now(),
  first_order_created_at timestamptz,
  first_payment_completed_at timestamptz,
  first_trip_completed_at timestamptz,
  valid_at timestamptz,
  first_order_id uuid references public.orders(id) on delete restrict,
  first_paid_order_id uuid references public.orders(id) on delete restrict,
  first_completed_order_id uuid references public.orders(id) on delete restrict,
  first_completed_vehicle_group_id uuid references public.vehicle_groups(id) on delete restrict,
  invalid_reason text,
  updated_at timestamptz not null default now()
);
insert into public.referral_lifecycles(referral_relationship_id,invitee_account_id,registered_at)
select r.id,r.invitee_account_id,r.created_at from public.referral_relationships r
on conflict(referral_relationship_id) do nothing;
create index if not exists referral_lifecycles_status_idx on public.referral_lifecycles(status,valid_at);

create table if not exists public.referral_source_ambassador_grants(
  source_id uuid primary key references public.referral_sources(id) on delete restrict,
  status text not null check(status in ('active','suspended')),
  source text not null check(source in ('company_granted')),
  granted_by uuid not null references public.profiles(id),
  reason text not null check(length(trim(reason)) between 3 and 500),
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ambassador_qualifications drop constraint if exists ambassador_qualifications_status_check;
alter table public.ambassador_qualifications add constraint ambassador_qualifications_status_check
  check(status in ('pending','approved','active','rejected','suspended'));
alter table public.ambassador_qualifications drop constraint if exists ambassador_qualifications_source_check;
alter table public.ambassador_qualifications add constraint ambassador_qualifications_source_check
  check(source in ('staff_approval','passenger_application','operations','auto_unlocked','company_granted'));
alter table public.ambassador_qualifications add column if not exists activated_at timestamptz;
alter table public.ambassador_qualifications add column if not exists qualifying_referral_count integer not null default 0;
-- Automatic qualification is earned once. A later refund changes its own
-- lifecycle and unreleased cash entry, but never silently re-locks access.
alter table public.ambassador_qualifications add column if not exists qualification_achieved_at timestamptz;
alter table public.ambassador_qualifications add column if not exists qualification_source text;
alter table public.ambassador_qualifications add column if not exists revoked_at timestamptz;
alter table public.ambassador_qualifications add column if not exists revoked_reason text;

-- Coupon rows remain the existing checkout asset.  These columns make every
-- present and future coupon auditable without changing checkout's percentage
-- pricing behavior in this phase.
alter table public.discount_coupons add column if not exists face_value_jpy integer check(face_value_jpy is null or face_value_jpy>=0);
alter table public.discount_coupons add column if not exists remaining_value_jpy integer check(remaining_value_jpy is null or remaining_value_jpy>=0);
alter table public.discount_coupons add column if not exists source_event_id text;
alter table public.discount_coupons add column if not exists source_trip_id uuid references public.vehicle_groups(id) on delete restrict;
alter table public.discount_coupons add column if not exists source_order_id uuid references public.orders(id) on delete restrict;
alter table public.discount_coupons add column if not exists reward_rate_bps integer check(reward_rate_bps is null or reward_rate_bps between 0 and 10000);
alter table public.discount_coupons drop constraint if exists discount_coupons_source_type_check;
alter table public.discount_coupons add constraint discount_coupons_source_type_check
  check(source_type in ('referral','link_campaign','travel_moment','manual_service_recovery'));
create index if not exists discount_coupons_trace_idx on public.discount_coupons(account_id,source_type,source_event_id,source_order_id,source_trip_id);
create unique index if not exists discount_coupons_growth_source_event_unique on public.discount_coupons(source_type,source_event_id) where source_event_id is not null;

-- Cash is intentionally kept in the pre-existing cash ledger, never in
-- discount_coupons.  Legacy locked/reversed rows remain readable, while new
-- records use the monthly withdrawal states below.
alter table public.cash_commission_entries add column if not exists referred_account_id uuid references public.profiles(id) on delete restrict;
alter table public.cash_commission_entries add column if not exists source_trip_id uuid references public.vehicle_groups(id) on delete restrict;
alter table public.cash_commission_entries add column if not exists eligible_amount_jpy integer check(eligible_amount_jpy is null or eligible_amount_jpy>=0);
alter table public.cash_commission_entries add column if not exists reward_rule text;
alter table public.cash_commission_entries add column if not exists confirmed_at timestamptz;
alter table public.cash_commission_entries add column if not exists invalid_reason text;
alter table public.cash_commission_entries add column if not exists carried_over_at timestamptz;
alter table public.cash_commission_entries drop constraint if exists cash_commission_entries_status_check;
alter table public.cash_commission_entries add constraint cash_commission_entries_status_check
  check(status in ('pending','confirmed','available','carried_over','withdrawal_pending','paid','cancelled','invalid','locked','reversed','recovery_due'));
update public.cash_commission_entries set status='invalid',invalid_reason=coalesce(invalid_reason,adjustment_reason,'legacy_reversed') where status='reversed';
update public.cash_commission_entries set status='withdrawal_pending' where status='locked';
update public.cash_commission_entries c
set referred_account_id=r.invitee_account_id,
    source_trip_id=c.completed_vehicle_group_id,
    eligible_amount_jpy=coalesce(c.eligible_amount_jpy,c.basis_amount_jpy),
    reward_rule=coalesce(c.reward_rule,c.rule_version)
from public.referral_relationships r where r.id=c.referral_relationship_id;
create index if not exists cash_commission_growth_ledger_idx on public.cash_commission_entries(beneficiary_account_id,status,created_at);

alter table public.commission_payout_requests add column if not exists period_month date;
update public.commission_payout_requests set period_month=date_trunc('month',coalesce(requested_at,now()) at time zone 'Asia/Tokyo')::date where period_month is null;
alter table public.commission_payout_requests alter column period_month set not null;
alter table public.commission_payout_requests add constraint commission_payout_period_month_check check(period_month=date_trunc('month',period_month)::date) not valid;
alter table public.commission_payout_requests validate constraint commission_payout_period_month_check;
create unique index if not exists commission_payout_one_per_natural_month on public.commission_payout_requests(account_id,period_month);

alter table public.referral_sources enable row level security;
alter table public.referral_lifecycles enable row level security;
alter table public.referral_source_ambassador_grants enable row level security;
revoke all on public.referral_sources,public.referral_lifecycles,public.referral_source_ambassador_grants from public,anon,authenticated;
grant select on public.referral_sources,public.referral_lifecycles,public.referral_source_ambassador_grants to authenticated;
grant all on public.referral_sources,public.referral_lifecycles,public.referral_source_ambassador_grants to service_role;
create policy referral_sources_own_or_operations on public.referral_sources for select to authenticated
  using(account_id=auth.uid() or public.is_operations());
create policy referral_lifecycles_own_or_operations on public.referral_lifecycles for select to authenticated
  using(invitee_account_id=auth.uid() or exists(select 1 from public.referral_relationships r where r.id=referral_lifecycles.referral_relationship_id and r.inviter_account_id=auth.uid()) or public.is_operations());
create policy referral_source_grants_operations_read on public.referral_source_ambassador_grants for select to authenticated using(public.is_operations());

create or replace function public.ensure_referral_code(p_account uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_code text; v_tries integer:=0;
begin
  select code into v_code from public.referral_codes where account_id=p_account;
  if v_code is null then
    loop
      -- gen_random_uuid() is already available in every existing JTW stack;
      -- do not require the optional pgcrypto gen_random_bytes function.
      v_code:='JT'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,14));
      begin
        insert into public.referral_codes(account_id,code) values(p_account,v_code);
        exit;
      exception when unique_violation then
        v_tries:=v_tries+1;
        if v_tries>=8 then raise exception 'unable to allocate referral code'; end if;
      end;
    end loop;
  end if;
  insert into public.referral_sources(source_kind,account_id,display_name,code)
  select 'account',p.id,p.display_name,v_code from public.profiles p where p.id=p_account
  on conflict(account_id) do update set display_name=excluded.display_name;
  return v_code;
end$$;

create or replace function public.referral_source_root(p_parent uuid) returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
  with recursive parents(source_id,parent_source_id) as (
    select s.id,r.parent_source_id from public.referral_sources s
    left join public.referral_relationships r on r.invitee_account_id=s.account_id
    where s.id=p_parent
    union all
    select p.source_id,r.parent_source_id from parents p
    join public.referral_sources s on s.id=p.parent_source_id
    left join public.referral_relationships r on r.invitee_account_id=s.account_id
    where p.parent_source_id is not null
  )
  select coalesce((select source_id from parents where parent_source_id is null limit 1),p_parent)
$$;

create or replace function public.assert_referral_parent_is_safe(p_invitee uuid,p_parent uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_invitee_source uuid;
begin
  select id into v_invitee_source from public.referral_sources where account_id=p_invitee;
  if v_invitee_source is not null and v_invitee_source=p_parent then raise exception 'self referral is not allowed'; end if;
  if exists(
    with recursive ancestors(source_id) as (
      select p_parent
      union all
      select r.parent_source_id from ancestors a
      join public.referral_sources s on s.id=a.source_id
      join public.referral_relationships r on r.invitee_account_id=s.account_id
      where r.parent_source_id is not null
    ) select 1 from ancestors where source_id=v_invitee_source
  ) then raise exception 'referral cycle is not allowed'; end if;
end$$;

create or replace function public.prevent_referral_parent_mutation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and (new.parent_source_id is distinct from old.parent_source_id or new.invitee_account_id is distinct from old.invitee_account_id) then
    raise exception 'referral parent is permanent';
  end if;
  return new;
end$$;
drop trigger if exists prevent_referral_parent_mutation_trigger on public.referral_relationships;
create trigger prevent_referral_parent_mutation_trigger before update on public.referral_relationships
for each row execute function public.prevent_referral_parent_mutation();

create or replace function public.apply_referral_registration(p_invitee uuid,p_raw_code text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.referral_program_settings%rowtype; v_source public.referral_sources%rowtype; v_relation uuid; v_code text:=upper(trim(coalesce(p_raw_code,'')));
begin
  if v_code='' then return false; end if;
  select * into cfg from public.referral_program_settings where id=true;
  if not found or not cfg.active then return false; end if;
  -- A relationship is a registration-time fact.  Existing users and users who
  -- already created an order may not be retroactively attached to a source.
  if exists(select 1 from public.referral_relationships where invitee_account_id=p_invitee)
     or exists(select 1 from public.orders where account_id=p_invitee) then return false; end if;
  select * into v_source from public.referral_sources where code=v_code and active and disabled_at is null;
  if not found then
    select rs.* into v_source from public.referral_codes rc join public.referral_sources rs on rs.account_id=rc.account_id where rc.code=v_code and rs.active and rs.disabled_at is null;
  end if;
  if not found then return false; end if;
  perform public.assert_referral_parent_is_safe(p_invitee,v_source.id);
  insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent,parent_source_id,root_source_id)
  values(v_source.account_id,p_invitee,v_code,cfg.discount_percent,v_source.id,public.referral_source_root(v_source.id))
  on conflict(invitee_account_id) do nothing returning id into v_relation;
  if v_relation is null then return false; end if;
  insert into public.referral_lifecycles(referral_relationship_id,invitee_account_id,status,registered_at)
  values(v_relation,p_invitee,'registered',now()) on conflict(referral_relationship_id) do nothing;
  -- The existing newcomer coupon stays available; it is an asset separate from
  -- cash thank-you money.
  insert into public.discount_coupons(account_id,referral_relationship_id,recipient_kind,discount_percent,status,expires_at,activated_at,source_type,rules_version,source_event_id)
  values(p_invitee,v_relation,'invitee',cfg.discount_percent,'active',now()+make_interval(days=>cfg.validity_days),now(),'referral','cash-referral-v3',v_relation::text)
  on conflict(account_id,referral_relationship_id) do nothing;
  return true;
end$$;

create or replace function public.growth_is_cash_eligible(p_account uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.ambassador_qualifications q where q.account_id=p_account and q.status in ('approved','active'))
     or exists(select 1 from public.profiles p where p.id=p_account and p.role in ('driver','guide'))
$$;

-- Driver/guide accounts use the existing staff application flow.  Once that
-- flow approves an account, provision its durable source code without giving
-- it the passenger ambassador UI.
create or replace function public.sync_staff_ambassador_qualification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='approved' then
    perform public.ensure_referral_code(new.account_id);
    insert into public.ambassador_qualifications(account_id,status,source,approved_at,updated_at)
    values(new.account_id,'approved','staff_approval',coalesce(new.reviewed_at,now()),now())
    on conflict(account_id) do update set status='approved',source='staff_approval',approved_at=coalesce(public.ambassador_qualifications.approved_at,excluded.approved_at),updated_at=now();
  elsif new.status='suspended' then
    update public.ambassador_qualifications set status='suspended',review_note='staff account suspended',updated_at=now() where account_id=new.account_id;
  end if;
  return new;
end$$;

create or replace function public.refresh_ambassador_qualification(p_account uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_valid_count integer;
begin
  select count(*)::integer into v_valid_count
  from public.referral_lifecycles l join public.referral_relationships r on r.id=l.referral_relationship_id
  where r.inviter_account_id=p_account and l.status='valid_referral';
  insert into public.ambassador_qualifications(account_id,status,source,approved_at,activated_at,qualification_achieved_at,qualification_source,qualifying_referral_count,updated_at)
  values(p_account,case when v_valid_count>=10 then 'active' else 'pending' end,case when v_valid_count>=10 then 'auto_unlocked' else 'passenger_application' end,case when v_valid_count>=10 then now() else null end,case when v_valid_count>=10 then now() else null end,case when v_valid_count>=10 then now() else null end,case when v_valid_count>=10 then 'auto_unlocked' else null end,v_valid_count,now())
  on conflict(account_id) do update set
    qualifying_referral_count=excluded.qualifying_referral_count,
    status=case when public.ambassador_qualifications.revoked_at is not null then public.ambassador_qualifications.status when public.ambassador_qualifications.source='company_granted' then 'active' when public.ambassador_qualifications.qualification_achieved_at is not null then 'active' when excluded.qualifying_referral_count>=10 then 'active' else public.ambassador_qualifications.status end,
    source=case when public.ambassador_qualifications.source='company_granted' then 'company_granted' when public.ambassador_qualifications.qualification_achieved_at is not null then 'auto_unlocked' when excluded.qualifying_referral_count>=10 then 'auto_unlocked' else public.ambassador_qualifications.source end,
    approved_at=case when excluded.qualifying_referral_count>=10 then coalesce(public.ambassador_qualifications.approved_at,now()) else public.ambassador_qualifications.approved_at end,
    activated_at=case when excluded.qualifying_referral_count>=10 then coalesce(public.ambassador_qualifications.activated_at,now()) else public.ambassador_qualifications.activated_at end,
    qualification_achieved_at=case when excluded.qualifying_referral_count>=10 then coalesce(public.ambassador_qualifications.qualification_achieved_at,now()) else public.ambassador_qualifications.qualification_achieved_at end,
    qualification_source=case when excluded.qualifying_referral_count>=10 then coalesce(public.ambassador_qualifications.qualification_source,'auto_unlocked') else public.ambassador_qualifications.qualification_source end,
    updated_at=now();
  return v_valid_count;
end$$;

create or replace function public.refresh_referral_lifecycle_for_order(p_order uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype; r public.referral_relationships%rowtype; v_lifecycle public.referral_lifecycles%rowtype; v_group uuid; v_completed timestamptz; v_valid_count integer; v_rule public.commission_rule_versions%rowtype; v_basis integer;
begin
  select * into o from public.orders where id=p_order;
  if not found then return 'missing_order'; end if;
  select * into r from public.referral_relationships where invitee_account_id=o.account_id;
  if not found then return 'not_referred'; end if;
  insert into public.referral_lifecycles(referral_relationship_id,invitee_account_id,registered_at)
  values(r.id,r.invitee_account_id,r.created_at) on conflict(referral_relationship_id) do nothing;
  select * into v_lifecycle from public.referral_lifecycles where referral_relationship_id=r.id for update;
  if v_lifecycle.first_order_id is null then
    update public.referral_lifecycles set first_order_id=o.id,first_order_created_at=o.created_at,status='first_order_created',updated_at=now() where referral_relationship_id=r.id;
  end if;
  if o.status in ('cancelled','refunded') or coalesce(o.refunded_amount_jpy,0)>=greatest(coalesce(o.amount,0),0) then
    update public.referral_lifecycles set status=case when o.status='refunded' or coalesce(o.refunded_amount_jpy,0)>0 then 'refunded' else 'cancelled' end,invalid_reason='first_order_cancelled_or_final_refunded',updated_at=now() where referral_relationship_id=r.id and first_order_id=o.id;
    update public.cash_commission_entries set status='invalid',invalid_reason='source_order_cancelled_or_final_refunded',updated_at=now() where source_order_id=o.id and status in ('pending','confirmed','available','carried_over','withdrawal_pending');
    return 'invalid';
  end if;
  if o.status not in ('paid','confirmed') or coalesce(o.amount,0)<=0 then return 'awaiting_payment'; end if;
  update public.referral_lifecycles set first_paid_order_id=coalesce(first_paid_order_id,o.id),first_payment_completed_at=coalesce(first_payment_completed_at,now()),status=case when status in ('registered','first_order_created') then 'first_payment_completed' else status end,updated_at=now() where referral_relationship_id=r.id;
  select vgo.vehicle_group_id,js.completed_at into v_group,v_completed
  from public.vehicle_group_orders vgo join public.vehicle_group_journey_state js on js.vehicle_group_id=vgo.vehicle_group_id and js.status='completed'
  where vgo.order_id=o.id order by js.completed_at asc nulls last limit 1;
  if v_group is null or v_completed is null or not exists(select 1 from public.passengers p join public.passenger_checkins pc on pc.passenger_id=p.id and pc.status='boarded' where p.order_id=o.id)
     or not exists(select 1 from public.departures d join public.trips t on t.id=d.trip_id where d.id=o.departure_id and coalesce(d.sales_scope,'public')='public' and coalesce(t.publication_scope,'public')='public') then
    return 'awaiting_completed_real_trip';
  end if;
  update public.referral_lifecycles set first_completed_order_id=o.id,first_completed_vehicle_group_id=v_group,first_trip_completed_at=coalesce(first_trip_completed_at,v_completed),valid_at=coalesce(valid_at,now()),status='valid_referral',invalid_reason=null,updated_at=now() where referral_relationship_id=r.id;
  if r.inviter_account_id is not null then perform public.refresh_ambassador_qualification(r.inviter_account_id); end if;
  if r.inviter_account_id is not null and public.growth_is_cash_eligible(r.inviter_account_id) then
    select * into v_rule from public.commission_rule_versions where effective_from<=o.created_at and (effective_until is null or effective_until>o.created_at) order by effective_from desc limit 1;
    v_basis:=public.commission_basis_for_order(o.id);
    if found and v_basis>0 then
      insert into public.cash_commission_entries(beneficiary_account_id,referred_account_id,referral_relationship_id,source_order_id,source_trip_id,rule_version,eligible_amount_jpy,basis_amount_jpy,commission_percent,amount_jpy,reward_rule,status,confirmed_at,unlocked_at,completed_vehicle_group_id)
      values(r.inviter_account_id,r.invitee_account_id,r.id,o.id,v_group,v_rule.id,v_basis,v_basis,v_rule.commission_percent,floor(v_basis*v_rule.commission_percent/100.0)::integer,v_rule.id,'available',now(),now(),v_group)
      on conflict(source_order_id) do nothing;
    end if;
  end if;
  return 'valid_referral';
end$$;

create or replace function public.create_pending_commission_after_payment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  if new.status is distinct from old.status or new.refunded_amount_jpy is distinct from old.refunded_amount_jpy then perform public.refresh_referral_lifecycle_for_order(new.id); end if;
  return new;
end$$;

create or replace function public.settle_cash_commissions_for_completed_group(p_vehicle_group uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer:=0; v_order uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  for v_order in select order_id from public.vehicle_group_orders where vehicle_group_id=p_vehicle_group loop
    perform public.refresh_referral_lifecycle_for_order(v_order);
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end$$;

create or replace function public.grant_company_ambassador(p_account uuid,p_reason text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() or length(trim(coalesce(p_reason,'')))<3 then raise exception 'operations and reason required'; end if;
  insert into public.ambassador_qualifications(account_id,status,source,approved_at,activated_at,qualification_achieved_at,qualification_source,reviewed_by,review_note,updated_at)
  values(p_account,'active','company_granted',now(),now(),now(),'company_granted',auth.uid(),left(trim(p_reason),500),now())
  on conflict(account_id) do update set status='active',source='company_granted',approved_at=coalesce(public.ambassador_qualifications.approved_at,now()),activated_at=coalesce(public.ambassador_qualifications.activated_at,now()),qualification_achieved_at=coalesce(public.ambassador_qualifications.qualification_achieved_at,now()),qualification_source='company_granted',revoked_at=null,revoked_reason=null,reviewed_by=auth.uid(),review_note=excluded.review_note,updated_at=now();
  return true;
end$$;

create or replace function public.grant_company_referral_source(p_source uuid,p_reason text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() or length(trim(coalesce(p_reason,'')))<3 then raise exception 'operations and reason required'; end if;
  insert into public.referral_source_ambassador_grants(source_id,status,source,granted_by,reason,granted_at,updated_at)
  values(p_source,'active','company_granted',auth.uid(),left(trim(p_reason),500),now(),now())
  on conflict(source_id) do update set status='active',source='company_granted',granted_by=auth.uid(),reason=excluded.reason,updated_at=now();
  return found;
end$$;

create or replace function public.issue_travel_reward_coupon(p_account uuid,p_source_type text,p_source_event_id text,p_order uuid,p_trip uuid,p_reward_rate_bps integer,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_basis integer; v_face integer; v_id uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_source_type not in ('link_campaign','travel_moment','manual_service_recovery') or length(trim(coalesce(p_source_event_id,'')))<3 or p_reward_rate_bps not between 1 and 10000 or p_expires_at<=now() then raise exception 'invalid coupon provenance'; end if;
  if not exists(select 1 from public.orders where id=p_order and account_id=p_account and status in ('paid','confirmed')) then raise exception 'owned paid order required'; end if;
  v_basis:=public.commission_basis_for_order(p_order); v_face:=floor(v_basis*p_reward_rate_bps/10000.0)::integer;
  if v_face<=0 then raise exception 'non-positive coupon amount'; end if;
  insert into public.discount_coupons(account_id,discount_percent,status,expires_at,source_type,source_id,source_event_id,source_order_id,source_trip_id,face_value_jpy,remaining_value_jpy,reward_rate_bps,rules_version,max_discounted_seats)
  values(p_account,10,'active',p_expires_at,p_source_type,p_source_event_id,p_source_event_id,p_order,p_trip,v_face,v_face,p_reward_rate_bps,'growth-travel-coupon-v1',1)
  on conflict(source_type,source_event_id) where source_event_id is not null do nothing
  returning id into v_id;
  if v_id is null then raise exception 'duplicate coupon source'; end if;
  return v_id;
end$$;

create or replace function public.request_own_commission_payout(p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_month date:=date_trunc('month',now() at time zone 'Asia/Tokyo')::date; v_request public.commission_payout_requests%rowtype; v_amount integer;
begin
  if auth.uid() is null or length(trim(coalesce(p_idempotency_key,'')))<8 then raise exception 'invalid payout request'; end if;
  select * into v_request from public.commission_payout_requests where account_id=auth.uid() and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('id',v_request.id,'status',v_request.status,'amountJpy',v_request.amount_jpy,'periodMonth',v_request.period_month); end if;
  if exists(select 1 from public.commission_payout_requests where account_id=auth.uid() and period_month=v_month) then raise exception 'one payout request per natural month'; end if;
  perform 1 from public.cash_commission_entries where beneficiary_account_id=auth.uid() and status in ('available','carried_over') for update;
  select coalesce(sum(amount_jpy),0)::integer into v_amount from public.cash_commission_entries where beneficiary_account_id=auth.uid() and status in ('available','carried_over');
  if v_amount<10000 then
    update public.cash_commission_entries set status='carried_over',carried_over_at=coalesce(carried_over_at,now()),updated_at=now() where beneficiary_account_id=auth.uid() and status='available';
    raise exception 'minimum payout is 10000 JPY';
  end if;
  insert into public.commission_payout_requests(account_id,week_start,period_month,amount_jpy,idempotency_key)
  values(auth.uid(),v_month,v_month,v_amount,p_idempotency_key) returning * into v_request;
  update public.cash_commission_entries set status='withdrawal_pending',payout_request_id=v_request.id,updated_at=now() where beneficiary_account_id=auth.uid() and status in ('available','carried_over');
  return jsonb_build_object('id',v_request.id,'status',v_request.status,'amountJpy',v_request.amount_jpy,'periodMonth',v_request.period_month);
end$$;

create or replace function public.get_own_cash_commission_summary() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 with current_month as (select date_trunc('month',now() at time zone 'Asia/Tokyo')::date value), entries as (select * from public.cash_commission_entries where beneficiary_account_id=auth.uid())
 select jsonb_build_object(
   'availableJpy',coalesce(sum(amount_jpy) filter(where status in ('available','carried_over')),0),
   'withdrawalPendingJpy',coalesce(sum(amount_jpy) filter(where status='withdrawal_pending'),0),
   'paidJpy',coalesce(sum(amount_jpy) filter(where status='paid'),0),
   'carriedOverJpy',coalesce(sum(amount_jpy) filter(where status='carried_over'),0),
   'currentPeriodNewJpy',coalesce(sum(amount_jpy) filter(where status in ('available','carried_over') and created_at >= (select value from current_month)::timestamptz),0),
   'nextPeriodCarryJpy',coalesce(sum(amount_jpy) filter(where status in ('available','carried_over') and exists(select 1 from public.commission_payout_requests p where p.account_id=auth.uid() and p.period_month=(select value from current_month))),0),
   'minimumPayoutJpy',10000,
   'canRequestPayout',coalesce(sum(amount_jpy) filter(where status in ('available','carried_over')),0)>=10000 and not exists(select 1 from public.commission_payout_requests p where p.account_id=auth.uid() and p.period_month=(select value from current_month)),
   'entries',coalesce(jsonb_agg(jsonb_build_object('id',id,'referredAccountId',referred_account_id,'relationId',referral_relationship_id,'sourceOrderId',source_order_id,'sourceTripId',source_trip_id,'eligibleAmountJpy',eligible_amount_jpy,'rewardRate',commission_percent,'rewardRule',reward_rule,'amountJpy',amount_jpy,'status',status,'invalidReason',invalid_reason) order by created_at desc),'[]'::jsonb)
 ) from entries
$$;

create or replace function public.operations_review_commission_payout(p_request uuid,p_action text,p_note text,p_provider_reference text default null)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.commission_payout_requests%rowtype; v_target text;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into v from public.commission_payout_requests where id=p_request for update;
  if not found then raise exception 'request not found'; end if;
  if p_action='approve' and v.status='pending' then v_target:='approved';
  elsif p_action='mark_processing' and v.status='approved' then v_target:='processing';
  elsif p_action='mark_paid' and v.status in ('approved','processing') and length(trim(coalesce(p_provider_reference,'')))>=3 then v_target:='paid';
  elsif p_action='fail' and v.status in ('approved','processing') then v_target:='failed';
  elsif p_action='retry' and v.status='failed' then v_target:='approved';
  elsif p_action='cancel' and v.status in ('pending','failed') then v_target:='cancelled';
  else raise exception 'invalid payout transition'; end if;
  update public.commission_payout_requests set status=v_target,reviewed_by=auth.uid(),review_note=trim(coalesce(p_note,'')),provider_reference=coalesce(nullif(trim(coalesce(p_provider_reference,'')),''),provider_reference),reviewed_at=now(),paid_at=case when v_target='paid' then now() else paid_at end,updated_at=now() where id=v.id;
  if v_target='paid' then
    update public.cash_commission_entries set status='paid',updated_at=now() where payout_request_id=v.id and status in ('withdrawal_pending','locked');
  elsif v_target='cancelled' then
    update public.cash_commission_entries set status='available',payout_request_id=null,updated_at=now() where payout_request_id=v.id and status in ('withdrawal_pending','locked');
  end if;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'commission_payout_'||v_target,'commission_payout',v.id,jsonb_build_object('priorStatus',v.status,'amountJpy',v.amount_jpy,'providerReference',p_provider_reference));
  return v_target;
end$$;

create or replace function public.get_referral_descendants(p_source uuid) returns table(source_id uuid,account_id uuid,depth integer)
language sql stable security definer set search_path=public,pg_temp as $$
  with recursive tree(source_id,account_id,depth,path) as (
    select s.id,s.account_id,0,array[s.id] from public.referral_sources s where s.id=p_source
    union all
    select child.id,child.account_id,t.depth+1,t.path||child.id
    from tree t join public.referral_relationships r on r.parent_source_id=t.source_id
    join public.referral_sources child on child.account_id=r.invitee_account_id
    where not child.id=any(t.path)
  ) select source_id,account_id,depth from tree
  where public.is_operations() or exists(select 1 from public.referral_sources own where own.account_id=auth.uid() and own.id=p_source)
$$;

revoke all on function public.ensure_referral_code(uuid),public.apply_referral_registration(uuid,text),public.assert_referral_parent_is_safe(uuid,uuid),public.sync_staff_ambassador_qualification(),public.refresh_ambassador_qualification(uuid),public.refresh_referral_lifecycle_for_order(uuid),public.create_pending_commission_after_payment(),public.settle_cash_commissions_for_completed_group(uuid),public.grant_company_ambassador(uuid,text),public.grant_company_referral_source(uuid,text),public.issue_travel_reward_coupon(uuid,text,text,uuid,uuid,integer,timestamptz),public.request_own_commission_payout(text),public.get_own_cash_commission_summary(),public.operations_review_commission_payout(uuid,text,text,text),public.get_referral_descendants(uuid) from public,anon,authenticated;
grant execute on function public.get_own_cash_commission_summary(),public.request_own_commission_payout(text),public.get_referral_descendants(uuid) to authenticated;
grant execute on function public.grant_company_ambassador(uuid,text) to authenticated,service_role;
grant execute on function public.grant_company_referral_source(uuid,text) to authenticated,service_role;
grant execute on function public.ensure_referral_code(uuid),public.apply_referral_registration(uuid,text),public.refresh_ambassador_qualification(uuid),public.refresh_referral_lifecycle_for_order(uuid),public.settle_cash_commissions_for_completed_group(uuid),public.issue_travel_reward_coupon(uuid,text,text,uuid,uuid,integer,timestamptz) to service_role;

commit;
