begin;

create table if not exists public.referral_coupon_admin_actions(
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.discount_coupons(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check(action in ('freeze','void','restore')),
  previous_status text not null,
  new_status text not null,
  reason text not null check(length(trim(reason)) between 3 and 300),
  created_at timestamptz not null default now()
);
alter table public.referral_coupon_admin_actions enable row level security;
revoke all on public.referral_coupon_admin_actions from public,anon,authenticated;
grant select on public.referral_coupon_admin_actions to authenticated;
grant all on public.referral_coupon_admin_actions to service_role;
create policy referral_coupon_admin_actions_operations_read on public.referral_coupon_admin_actions for select to authenticated using(public.is_operations());

create or replace function public.operations_set_referral_coupon_status(p_coupon uuid,p_action text,p_reason text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare old_status text;target text;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_action not in ('freeze','void','restore') or length(trim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'invalid action'; end if;
  select status into old_status from public.discount_coupons where id=p_coupon for update;
  if old_status is null then raise exception 'coupon not found'; end if;
  target:=case p_action when 'freeze' then 'frozen' when 'void' then 'void' else 'active' end;
  if p_action='restore' and not exists(
    select 1 from public.discount_coupons c left join public.orders o on o.id=c.qualifying_order_id
     where c.id=p_coupon and c.expires_at>now() and (c.recipient_kind='invitee' or (c.available_at<=now() and o.status in ('paid','confirmed')))
  ) then raise exception 'coupon is not eligible for restore'; end if;
  update public.discount_coupons set status=target,reserved_order_id=case when target='active' then null else reserved_order_id end where id=p_coupon;
  insert into public.referral_coupon_admin_actions(coupon_id,actor_id,action,previous_status,new_status,reason) values(p_coupon,auth.uid(),p_action,old_status,target,trim(p_reason));
  return target;
end$$;

create or replace function public.get_operations_referral_summary() returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare cfg public.referral_program_settings%rowtype;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  select * into cfg from public.referral_program_settings where id=true;
  return jsonb_build_object(
    'active',cfg.active,'discountPercent',cfg.discount_percent,'validityDays',cfg.validity_days,
    'successfulInvites',(select count(*) from public.referral_relationships),
    'paidInvitees',(select count(distinct r.id) from public.referral_relationships r join public.orders o on o.account_id=r.invitee_account_id and o.status in ('paid','confirmed')),
    'qualifiedInvites',(select count(*) from public.discount_coupons where recipient_kind='inviter' and status in ('active','reserved','redeemed')),
    'couponCounts',(select jsonb_build_object(
      'total',count(*),'pending',count(*) filter(where status='pending_trip_completion'),'active',count(*) filter(where status='active'),
      'reserved',count(*) filter(where status='reserved'),'redeemed',count(*) filter(where status='redeemed'),'void',count(*) filter(where status='void'),
      'frozen',count(*) filter(where status='frozen'),'expired',count(*) filter(where status='expired')) from public.discount_coupons),
    'discountAmountJpy',(select coalesce(sum(discount_amount),0) from public.orders where discount_coupon_id is not null and status in ('paid','confirmed','refunded')),
    'integrity',jsonb_build_object(
      'relationships',(select count(*) from public.referral_relationships),
      'expectedCoupons',(select count(*)*2 from public.referral_relationships),
      'actualCoupons',(select count(*) from public.discount_coupons),
      'missingPairs',(select count(*) from public.referral_relationships r where (select count(*) from public.discount_coupons c where c.referral_relationship_id=r.id)<>2),
      'orphanCoupons',(select count(*) from public.discount_coupons c where not exists(select 1 from public.referral_relationships r where r.id=c.referral_relationship_id))
    ),
    'alerts',coalesce((select jsonb_agg(to_jsonb(a) order by a.severity desc,a.created_at desc) from(
      select 'critical' severity,'reward_after_refund' kind,c.id::text reference_id,'退款或取消订单仍关联可用奖励券' message,c.created_at
        from public.discount_coupons c join public.orders o on o.id=c.qualifying_order_id where c.recipient_kind='inviter' and c.status in ('active','reserved','redeemed') and o.status in ('cancelled','refunded')
      union all select 'critical','invalid_early_activation',c.id::text,'推荐券在不可退款截止时间前被激活',c.created_at from public.discount_coupons c where c.recipient_kind='inviter' and c.status in ('active','reserved','redeemed') and c.available_at>now()
      union all select 'high','coupon_pair_mismatch',r.id::text,'推荐关系未严格对应两张优惠券',r.created_at from public.referral_relationships r where (select count(*) from public.discount_coupons c where c.referral_relationship_id=r.id)<>2
      union all select 'high','frozen_reward',c.id::text,'已核销奖励关联订单发生退款，需要追偿审核',c.created_at from public.discount_coupons c where c.status='frozen'
      union all select 'medium','rapid_referrals',r.inviter_account_id::text,'同一推荐人24小时内新增5个以上注册',max(r.created_at) from public.referral_relationships r where r.created_at>now()-interval '24 hours' group by r.inviter_account_id having count(*)>=5
      union all select 'medium','repeat_cancellation',r.invitee_account_id::text,'被推荐账户存在2笔以上取消或退款订单',max(o.updated_at) from public.referral_relationships r join public.orders o on o.account_id=r.invitee_account_id and o.status in ('cancelled','refunded') group by r.invitee_account_id having count(*)>=2
    ) a),'[]'::jsonb),
    'relations',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from(
      select r.id,r.created_at,r.referral_code,r.discount_percent,
        coalesce(ip.display_name,'') inviter_name,iu.email inviter_email,coalesce(ep.display_name,'') invitee_name,eu.email invitee_email,
        o.id qualifying_order_id,o.status order_status,o.amount order_amount_jpy,o.discount_amount order_discount_jpy,t.title trip_title,d.departs_at,d.ends_at,
        ic.id inviter_coupon_id,ic.status inviter_coupon_status,ic.available_at,ec.id invitee_coupon_id,ec.status invitee_coupon_status
      from public.referral_relationships r
      join public.profiles ip on ip.id=r.inviter_account_id join auth.users iu on iu.id=r.inviter_account_id
      join public.profiles ep on ep.id=r.invitee_account_id join auth.users eu on eu.id=r.invitee_account_id
      left join public.discount_coupons ic on ic.referral_relationship_id=r.id and ic.recipient_kind='inviter'
      left join public.discount_coupons ec on ec.referral_relationship_id=r.id and ec.recipient_kind='invitee'
      left join public.orders o on o.id=ic.qualifying_order_id left join public.departures d on d.id=o.departure_id left join public.trips t on t.id=d.trip_id
      order by r.created_at desc limit 200
    ) x),'[]'::jsonb),
    'unavailableSignals',jsonb_build_array('device_fingerprint','registration_ip','payment_method_fingerprint')
  );
end$$;

revoke all on function public.get_operations_referral_summary(),public.operations_set_referral_coupon_status(uuid,text,text) from public,anon;
grant execute on function public.get_operations_referral_summary(),public.operations_set_referral_coupon_status(uuid,text,text) to authenticated;

commit;
