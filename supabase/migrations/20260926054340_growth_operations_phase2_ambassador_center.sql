begin;

-- Phase 2 only exposes the existing Phase 1 ledger through narrowly scoped,
-- authenticated RPCs.  It does not create a second referral, cash, or payout
-- system.

create or replace function public.get_ambassador_dashboard()
returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with me as (select auth.uid() as account_id),
  bounds as (
    select date_trunc('month',now() at time zone 'Asia/Tokyo')::timestamptz as current_start,
      (date_trunc('month',now() at time zone 'Asia/Tokyo') - interval '1 month')::timestamptz as previous_start
  ),
  qualification as (
    select q.* from public.ambassador_qualifications q join me on me.account_id=q.account_id
  ),
  relation_rows as (
    select r.id,r.created_at,l.first_payment_completed_at,l.valid_at,l.status
    from public.referral_relationships r
    left join public.referral_lifecycles l on l.referral_relationship_id=r.id
    join me on r.inviter_account_id=me.account_id
  ),
  cash_rows as (
    select c.* from public.cash_commission_entries c join me on c.beneficiary_account_id=me.account_id
  ),
  payout_rows as (
    select p.* from public.commission_payout_requests p join me on p.account_id=me.account_id
  ),
  source_row as (
    select s.code from public.referral_sources s join me on s.account_id=me.account_id order by s.created_at asc limit 1
  ),
  relation_monthly as (
    select
      count(*) filter(where r.created_at>=b.current_start) as current_registered,
      count(*) filter(where r.first_payment_completed_at>=b.current_start) as current_paid,
      count(*) filter(where r.valid_at>=b.current_start and r.status='valid_referral') as current_valid,
      count(*) filter(where r.created_at>=b.previous_start and r.created_at<b.current_start) as previous_registered,
      count(*) filter(where r.first_payment_completed_at>=b.previous_start and r.first_payment_completed_at<b.current_start) as previous_paid,
      count(*) filter(where r.valid_at>=b.previous_start and r.valid_at<b.current_start and r.status='valid_referral') as previous_valid
    from relation_rows r cross join bounds b
  ),
  cash_monthly as (
    select coalesce(sum(c.amount_jpy) filter(where c.confirmed_at>=b.current_start and c.status not in ('invalid','void')),0) as current_reward,
      coalesce(sum(c.amount_jpy) filter(where c.confirmed_at>=b.previous_start and c.confirmed_at<b.current_start and c.status not in ('invalid','void')),0) as previous_reward
    from cash_rows c cross join bounds b
  ),
  monthly as (
    select jsonb_build_object(
      'registered',r.current_registered,'firstPaid',r.current_paid,'validReferrals',r.current_valid,'rewardAmount',c.current_reward
    ) as current_month,
    jsonb_build_object(
      'registered',r.previous_registered,'firstPaid',r.previous_paid,'validReferrals',r.previous_valid,'rewardAmount',c.previous_reward
    ) as previous_month
    from relation_monthly r cross join cash_monthly c
  )
  select jsonb_build_object(
    'qualification',jsonb_build_object(
      'active',coalesce((select status in ('active','approved') and revoked_at is null from qualification),false),
      'status',coalesce((select status from qualification),'pending'),
      'achievedAt',(select qualification_achieved_at from qualification),
      'source',(select qualification_source from qualification),
      'currentValidReferrals',coalesce((select qualifying_referral_count from qualification),0)
    ),
    'referralCode',coalesce((select code from source_row),''),
    'currentMonth',(select current_month from monthly),
    'previousMonth',(select previous_month from monthly),
    'lifetime',jsonb_build_object(
      'registered',(select count(*) from relation_rows),
      'validReferrals',(select count(*) from relation_rows where status='valid_referral'),
      'totalReward',coalesce((select sum(amount_jpy) from cash_rows where status not in ('invalid','void')),0),
      'totalPaidOut',coalesce((select sum(amount_jpy) from payout_rows where status='paid'),0),
      'currentBalance',coalesce((select sum(amount_jpy) from cash_rows where status in ('available','carried_over')),0)
    ),
    'withdrawal',jsonb_build_object(
      'threshold',10000,
      'eligibleAmount',coalesce((select sum(amount_jpy) from cash_rows where status in ('available','carried_over')),0),
      'requestedThisMonth',exists(select 1 from payout_rows p cross join bounds b where p.period_month=b.current_start::date),
      'status',coalesce((select status from payout_rows p cross join bounds b where p.period_month=b.current_start::date order by p.requested_at desc limit 1),'not_requested')
    ),
    'cashRule',coalesce((select jsonb_build_object('id',reward_rule,'percent',commission_percent) from cash_rows order by confirmed_at desc nulls last,created_at desc limit 1),jsonb_build_object('id','cash-10-v1','percent',10))
  );
$$;

create or replace function public.list_own_referral_records(p_offset integer default 0,p_limit integer default 30)
returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with safe as (select greatest(0,coalesce(p_offset,0)) as off,least(100,greatest(1,coalesce(p_limit,30))) as lim),
  rows as (
    select r.id,r.created_at,l.status,l.first_payment_completed_at,l.valid_at,c.amount_jpy,c.status as cash_status,
      coalesce(nullif(p.display_name,''),split_part(u.email,'@',1),'U') as raw_name
    from public.referral_relationships r
    join auth.users u on u.id=r.invitee_account_id
    left join public.profiles p on p.id=r.invitee_account_id
    left join public.referral_lifecycles l on l.referral_relationship_id=r.id
    left join lateral (select * from public.cash_commission_entries c where c.referral_relationship_id=r.id order by c.created_at desc limit 1) c on true
    where r.inviter_account_id=auth.uid()
    order by r.created_at desc
  )
  select jsonb_build_object('total',(select count(*) from rows),'records',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'referredUser',left(raw_name,1)||'***'||right(replace(id::text,'-',''),2),'referredAt',created_at,
    'stage',case when status='valid_referral' then 'completed_first_trip' when status='first_payment_completed' then 'first_paid' when status in ('refunded','cancelled','invalid') then 'invalid' else 'registered' end,
    'rewardAmount',case when cash_status in ('available','carried_over','withdrawal_pending','paid') then amount_jpy else null end,
    'rewardStatus',coalesce(cash_status,case when status='valid_referral' then 'pending' else 'none' end)
  ) order by created_at desc) from (select * from rows offset (select off from safe) limit (select lim from safe)) page),'[]'::jsonb));
$$;

create or replace function public.list_own_commission_history(p_offset integer default 0,p_limit integer default 30)
returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with safe as (select greatest(0,coalesce(p_offset,0)) as off,least(100,greatest(1,coalesce(p_limit,30))) as lim),
  rows as (
    select c.id,c.amount_jpy,c.status,c.created_at,c.confirmed_at,c.invalid_reason,
      coalesce(nullif(p.display_name,''),split_part(u.email,'@',1),'U') as raw_name
    from public.cash_commission_entries c
    left join public.profiles p on p.id=c.referred_account_id
    left join auth.users u on u.id=c.referred_account_id
    where c.beneficiary_account_id=auth.uid() order by c.created_at desc
  ), payouts as (
    select id,period_month,amount_jpy,status,requested_at,paid_at from public.commission_payout_requests where account_id=auth.uid() order by requested_at desc
  )
  select jsonb_build_object(
    'entries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'referredUser',left(raw_name,1)||'***'||right(replace(id::text,'-',''),2),'createdAt',created_at,'confirmedAt',confirmed_at,'amountJpy',amount_jpy,'status',status,'invalidReason',invalid_reason) order by created_at desc) from (select * from rows offset (select off from safe) limit (select lim from safe)) page),'[]'::jsonb),
    'payouts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'periodMonth',period_month,'amountJpy',amount_jpy,'status',status,'requestedAt',requested_at,'paidAt',paid_at) order by requested_at desc) from payouts),'[]'::jsonb)
  );
$$;

revoke all on function public.get_ambassador_dashboard(),public.list_own_referral_records(integer,integer),public.list_own_commission_history(integer,integer) from public,anon;
grant execute on function public.get_ambassador_dashboard(),public.list_own_referral_records(integer,integer),public.list_own_commission_history(integer,integer) to authenticated;

commit;
