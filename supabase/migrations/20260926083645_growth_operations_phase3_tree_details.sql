begin;

-- Phase 3 analytics has deliberately small, centrally managed thresholds.  It
-- reads the existing referral, order, coupon and cash ledgers; it never
-- creates a new commission or coupon system.
create table if not exists public.referral_tree_analysis_settings(
  singleton boolean primary key default true check(singleton),
  flat_direct_ratio numeric not null default .75 check(flat_direct_ratio between 0 and 1),
  relay_direct_min integer not null default 3 check(relay_direct_min > 0),
  high_value_direct_min integer not null default 3 check(high_value_direct_min > 0),
  high_value_valid_min integer not null default 3 check(high_value_valid_min > 0),
  high_value_sales_min_jpy integer not null default 30000 check(high_value_sales_min_jpy >= 0),
  deep_depth_min integer not null default 3 check(deep_depth_min > 1),
  updated_at timestamptz not null default now()
);
insert into public.referral_tree_analysis_settings(singleton) values(true) on conflict(singleton) do nothing;
alter table public.referral_tree_analysis_settings enable row level security;
revoke all on public.referral_tree_analysis_settings from public,anon,authenticated;
grant all on public.referral_tree_analysis_settings to service_role;

create or replace function public.get_operations_referral_tree_children(
  p_root uuid,p_parent uuid,p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 40
) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations access required'; end if;
  if not exists(select 1 from public.referral_sources where id=p_root) then raise exception 'unknown referral root'; end if;
  return jsonb_build_object('items',coalesce((
    with settings as (select * from public.referral_tree_analysis_settings where singleton), children as (
      select r.id relation_id,r.invitee_account_id,r.parent_source_id,r.root_source_id,r.created_at,l.status,l.first_payment_completed_at,l.first_trip_completed_at,child.id source_id
      from public.referral_relationships r join public.referral_sources child on child.account_id=r.invitee_account_id
      left join public.referral_lifecycles l on l.referral_relationship_id=r.id
      where r.root_source_id=p_root and r.parent_source_id=p_parent
        and (p_from is null or r.created_at >= p_from::timestamptz) and (p_to is null or r.created_at < (p_to + 1)::timestamptz)
    ) select jsonb_agg(jsonb_build_object(
      'sourceId',source_id,'relationId',relation_id,'label','U***'||right(replace(invitee_account_id::text,'-',''),2),
      'depth',(select depth from public.get_referral_descendants(p_root) d where d.source_id=children.source_id),'status',coalesce(status,'registered'),'registeredAt',created_at,'firstPaidAt',first_payment_completed_at,'firstTripAt',first_trip_completed_at,
      'childCount',(select count(*) from public.referral_relationships c where c.parent_source_id=children.source_id),'validChildren',(select count(*) from public.referral_relationships c join public.referral_lifecycles cl on cl.referral_relationship_id=c.id where c.parent_source_id=children.source_id and cl.status='valid_referral'),
      'highValue',((select count(*) from public.referral_relationships c where c.parent_source_id=children.source_id)>=(select high_value_direct_min from settings) or (select count(*) from public.get_referral_descendants(children.source_id) d join public.referral_relationships r on r.invitee_account_id=d.account_id join public.referral_lifecycles l on l.referral_relationship_id=r.id where d.depth>0 and l.status='valid_referral')>=(select high_value_valid_min from settings))
    ) order by created_at asc) from (select * from children order by created_at asc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100)) children
  ),'[]'::jsonb),'nextOffset',p_offset+p_limit);
end$$;

create or replace function public.get_operations_referral_node_detail(p_root uuid,p_source uuid)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  if not public.is_operations() then raise exception 'operations access required'; end if;
  if not exists(select 1 from public.referral_sources where id=p_root)
    or not exists(select 1 from public.referral_sources where id=p_source) then
    raise exception 'unknown referral source';
  end if;
  with node as (
    select s.id,s.account_id,s.code,p.display_name from public.referral_sources s
    left join public.profiles p on p.id=s.account_id where s.id=p_source
  ), membership as (
    select d.source_id,d.account_id,d.depth from public.get_referral_descendants(p_root) d where d.source_id=p_source
  ), incoming as (
    select r.*,l.status,l.registered_at,l.first_payment_completed_at,l.first_trip_completed_at,l.first_completed_order_id
    from public.referral_relationships r left join public.referral_lifecycles l on l.referral_relationship_id=r.id
    join node n on n.account_id=r.invitee_account_id limit 1
  ), descendants as (
    select d.* from public.get_referral_descendants(p_source) d where d.depth>0
  ), descendant_lifecycle as (
    select d.depth,r.id relation_id,r.invitee_account_id,l.status,l.first_completed_order_id
    from descendants d join public.referral_relationships r on r.invitee_account_id=d.account_id
    left join public.referral_lifecycles l on l.referral_relationship_id=r.id
  ), own_orders as (
    select o.* from public.orders o join node n on n.account_id=o.account_id where o.status in ('paid','confirmed')
  ), cash as (
    select c.* from public.cash_commission_entries c join node n on n.account_id=c.beneficiary_account_id
  ), coupons as (
    select c.* from public.discount_coupons c join node n on n.account_id=c.account_id
  )
  select jsonb_build_object(
    'basic',jsonb_build_object(
      'sourceId',(select id from node),'user','U***'||right(replace(coalesce((select account_id::text from node),(select id::text from node)),'-',''),2),
      'nickname',case when coalesce((select display_name from node),'')='' then null else left((select display_name from node),1)||'***' end,
      'registeredAt',(select registered_at from incoming),'parentSourceId',(select parent_source_id from incoming),'rootSourceId',p_root,
      'depth',coalesce((select depth from membership),0),'lifecycle',coalesce((select status from incoming),'root')
    ),
    'travel',jsonb_build_object(
      'completedFirstTrip',exists(select 1 from incoming where status='valid_referral'),'firstPaidAt',(select first_payment_completed_at from incoming),
      'firstTripAt',(select first_trip_completed_at from incoming),'completedTrips',(select count(*) from own_orders),
      'validSpendJpy',coalesce((select sum(coalesce(gross_amount,amount,0)) from own_orders),0),'invalid',coalesce((select status in ('refunded','invalid','cancelled') from incoming),false),
      'firstOrderId',(select first_completed_order_id from incoming)
    ),
    'propagation',jsonb_build_object(
      'directReferrals',(select count(*) from public.referral_relationships where parent_source_id=p_source),'downstream',(select count(*) from descendants),
      'validDescendants',(select count(*) from descendant_lifecycle where status='valid_referral'),
      'salesJpy',coalesce((select sum(coalesce(o.gross_amount,o.amount,0)) from descendant_lifecycle d join public.orders o on o.id=d.first_completed_order_id where d.status='valid_referral'),0),
      'maxDepth',coalesce((select max(depth) from descendants),0)
    ),
    'cash',jsonb_build_object(
      'totals',jsonb_build_object('generated',coalesce((select sum(amount_jpy) from cash),0),'pending',coalesce((select sum(amount_jpy) from cash where status='pending'),0),'available',coalesce((select sum(amount_jpy) from cash where status in ('available','carried_over','confirmed')),0),'withdrawalPending',coalesce((select sum(amount_jpy) from cash where status='withdrawal_pending'),0),'paid',coalesce((select sum(amount_jpy) from cash where status='paid'),0),'invalid',coalesce((select sum(amount_jpy) from cash where status='invalid'),0)),
      'entries',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'referredUser','U***'||right(replace(c.referred_account_id::text,'-',''),2),'relationId',c.referral_relationship_id,'orderId',c.source_order_id,'tripId',c.source_trip_id,'eligibleAmountJpy',c.eligible_amount_jpy,'rule',c.reward_rule,'amountJpy',c.amount_jpy,'status',c.status,'createdAt',c.created_at) order by c.created_at desc) from cash c),'[]'::jsonb)
    ),
    'coupons',jsonb_build_object(
      'activeJpy',coalesce((select sum(coalesce(remaining_value_jpy,face_value_jpy,0)) from coupons where status='active' and expires_at>now()),0),'historicalJpy',coalesce((select sum(coalesce(face_value_jpy,0)) from coupons),0),'usedJpy',coalesce((select sum(greatest(coalesce(face_value_jpy,0)-coalesce(remaining_value_jpy,0),0)) from coupons),0),'expiredJpy',coalesce((select sum(coalesce(remaining_value_jpy,face_value_jpy,0)) from coupons where status<>'active' or expires_at<=now()),0),
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'faceValueJpy',c.face_value_jpy,'remainingValueJpy',c.remaining_value_jpy,'sourceType',c.source_type,'sourceEventId',c.source_event_id,'orderId',c.source_order_id,'tripId',c.source_trip_id,'issuedAt',c.created_at,'status',c.status) order by c.created_at desc) from coupons c),'[]'::jsonb)
    )
  ) into v;
  return v;
end$$;

create or replace function public.get_operations_referral_tree_analysis(p_root uuid,p_from date default null,p_to date default null)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  if not public.is_operations() then raise exception 'operations access required'; end if;
  with settings as (select * from public.referral_tree_analysis_settings where singleton),
  scoped as (
    select r.*,l.status,l.first_payment_completed_at,l.first_trip_completed_at,l.first_completed_order_id
    from public.referral_relationships r left join public.referral_lifecycles l on l.referral_relationship_id=r.id
    where r.root_source_id=p_root and (p_from is null or r.created_at>=p_from::timestamptz) and (p_to is null or r.created_at<(p_to+1)::timestamptz)
  ), descendants as (select * from public.get_referral_descendants(p_root) where depth>0),
  relays as (
    select s.id from public.referral_sources s join descendants d on d.source_id=s.id
    where (select count(*) from public.referral_relationships r where r.parent_source_id=s.id)>=(select relay_direct_min from settings)
  ), high as (
    select d.source_id from descendants d where
      (select count(*) from public.referral_relationships r where r.parent_source_id=d.source_id)>=(select high_value_direct_min from settings)
      or (select count(*) from public.get_referral_descendants(d.source_id) x join public.referral_relationships r on r.invitee_account_id=x.account_id join public.referral_lifecycles l on l.referral_relationship_id=r.id where x.depth>0 and l.status='valid_referral')>=(select high_value_valid_min from settings)
      or coalesce((select sum(coalesce(o.gross_amount,o.amount,0)) from public.get_referral_descendants(d.source_id) x join public.referral_relationships r on r.invitee_account_id=x.account_id join public.referral_lifecycles l on l.referral_relationship_id=r.id join public.orders o on o.id=l.first_completed_order_id where x.depth>0 and l.status='valid_referral'),0)>=(select high_value_sales_min_jpy from settings)
  )
  select jsonb_build_object(
    'propagationType',case when (select max(depth) from descendants)>=(select deep_depth_min from settings) and (select count(*) from relays)>=2 then 'mixed' when (select max(depth) from descendants)>=(select deep_depth_min from settings) then 'deep' when (select count(*) from relays)>=2 then 'multi_relay' when coalesce((select count(*) filter(where parent_source_id=p_root)::numeric/nullif(count(*),0) from scoped),0)>=(select flat_direct_ratio from settings) then 'flat' else 'mixed' end,
    'relayCount',(select count(*) from relays),'highValueSourceIds',coalesce((select jsonb_agg(source_id) from high),'[]'::jsonb),
    'funnel',jsonb_build_object('registered',(select count(*) from scoped),'firstPaid',(select count(*) from scoped where first_payment_completed_at is not null),'validTrips',(select count(*) from scoped where status='valid_referral'),'invalid',(select count(*) from scoped where status in ('invalid','refunded','cancelled'))),
    'conversion',jsonb_build_object('registrationToPaid',coalesce((select round(100.0*count(*) filter(where first_payment_completed_at is not null)/nullif(count(*),0),1) from scoped),0),'paidToTrip',coalesce((select round(100.0*count(*) filter(where status='valid_referral')/nullif(count(*) filter(where first_payment_completed_at is not null),0),1) from scoped),0),'registrationToTrip',coalesce((select round(100.0*count(*) filter(where status='valid_referral')/nullif(count(*),0),1) from scoped),0))
  ) into v;
  return v;
end$$;

create or replace function public.list_operations_referral_anomalies(p_root uuid)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations access required'; end if;
  return coalesce((
    with graph as (select * from public.referral_relationships where root_source_id=p_root),
    rows as (
      select 'cash_missing_relation' type,c.id reference_id,c.beneficiary_account_id source_id from public.cash_commission_entries c
      join public.referral_sources beneficiary on beneficiary.account_id=c.beneficiary_account_id
      left join public.get_referral_descendants(p_root) d on d.source_id=beneficiary.id
      left join graph r on r.id=c.referral_relationship_id
      where c.referral_relationship_id is not null and r.id is null and (beneficiary.id=p_root or d.depth>0)
      union all select 'valid_missing_completed_trip',l.referral_relationship_id,r.parent_source_id from public.referral_lifecycles l join graph r on r.id=l.referral_relationship_id where l.status='valid_referral' and l.first_completed_order_id is null
      union all select 'coupon_missing_event',c.id,null::uuid from public.discount_coupons c join graph r on r.invitee_account_id=c.account_id where c.source_type in ('travel_moment','link_campaign') and nullif(c.source_event_id,'') is null
      union all select 'missing_parent',r.id,r.parent_source_id from graph r left join public.referral_sources s on s.id=r.parent_source_id where s.id is null
      union all select 'root_mismatch',r.id,r.parent_source_id from graph r join public.referral_sources p on p.id=r.parent_source_id where r.root_source_id<>p.id and not exists(select 1 from public.get_referral_descendants(r.root_source_id) d where d.source_id=p.id)
    ) select jsonb_agg(jsonb_build_object('type',type,'referenceId',reference_id,'sourceId',source_id)) from rows
  ),'[]'::jsonb);
end$$;

revoke all on function public.get_operations_referral_node_detail(uuid,uuid),public.get_operations_referral_tree_analysis(uuid,date,date),public.list_operations_referral_anomalies(uuid) from public,anon;
grant execute on function public.get_operations_referral_node_detail(uuid,uuid),public.get_operations_referral_tree_analysis(uuid,date,date),public.list_operations_referral_anomalies(uuid) to authenticated;

commit;
