begin;

update public.discount_coupons c
   set available_at=d.departs_at-interval '24 hours'
  from public.orders o join public.departures d on d.id=o.departure_id
 where c.qualifying_order_id=o.id and c.recipient_kind='inviter' and c.status='pending_trip_completion';

create or replace function public.schedule_referral_reward_after_payment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    update public.discount_coupons c
       set qualifying_order_id=new.id,
           qualifying_trip_starts_at=d.departs_at,
           available_at=d.departs_at-interval '24 hours'
      from public.referral_relationships r,public.departures d
     where r.invitee_account_id=new.account_id and r.id=c.referral_relationship_id and d.id=new.departure_id
       and c.recipient_kind='inviter' and c.status='pending_trip_completion' and c.qualifying_order_id is null;
  end if;
  return new;
end$$;

create or replace function public.activate_referral_rewards_at_refund_cutoff(p_account uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  if current_user not in ('service_role','postgres') and auth.uid() is distinct from p_account then raise exception 'own rewards only'; end if;
  update public.discount_coupons c
     set status='active',activated_at=now(),expires_at=now()+make_interval(days=>(select validity_days from public.referral_program_settings where id=true))
    from public.orders o join public.departures d on d.id=o.departure_id
   where c.account_id=p_account and c.qualifying_order_id=o.id and c.recipient_kind='inviter'
     and c.status='pending_trip_completion' and c.available_at<=now()
     and o.status in ('paid','confirmed') and d.status not in ('cancelled');
  get diagnostics changed=row_count;
  return changed;
end$$;

-- Coupon selection also matures a reward atomically, so stale clients cannot
-- bypass or miss the 24-hour cutoff transition.
create or replace function public.price_order_with_coupon(p_account uuid,p_order uuid,p_coupon uuid,p_expected_gross integer)
returns table(amount integer,gross_amount integer,discount_amount integer,discount_percent integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_coupon public.discount_coupons%rowtype;v_gross bigint;v_discount integer;v_amount integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  perform public.activate_referral_rewards_at_refund_cutoff(p_account);
  select * into v_order from public.orders where id=p_order and account_id=p_account for update;
  if not found or v_order.status<>'pending_payment' then return; end if;
  select d.seat_price_jpy::bigint*v_order.seat_count into v_gross from public.departures d where d.id=v_order.departure_id and d.status='open';
  if v_gross is null or v_gross<>p_expected_gross or v_gross>2147483647 then return; end if;
  if v_order.discount_coupon_id is not null then
    select * into v_coupon from public.discount_coupons where id=v_order.discount_coupon_id;
    if v_coupon.id is null or v_coupon.reserved_order_id<>p_order then return; end if;
  else
    select * into v_coupon from public.discount_coupons where id=p_coupon for update;
    if not found or v_coupon.account_id<>p_account or v_coupon.status<>'active' or v_coupon.expires_at<=now() then return; end if;
  end if;
  v_discount:=round(v_gross*v_coupon.discount_percent/100.0);v_amount:=v_gross::integer-v_discount;
  if v_amount<1 then return; end if;
  update public.discount_coupons set status='reserved',reserved_order_id=p_order where id=v_coupon.id and (status='active' or reserved_order_id=p_order);
  update public.orders set gross_amount=v_gross::integer,discount_amount=v_discount,discount_coupon_id=v_coupon.id,amount=v_amount,updated_at=now() where id=p_order;
  return query select v_amount,v_gross::integer,v_discount,v_coupon.discount_percent;
end$$;

-- The summary refresh turns matured grey rewards into usable coupons.
create or replace function public.get_own_referral_summary() returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare own_code text; cfg public.referral_program_settings%rowtype; completed_count integer; registered_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform public.activate_referral_rewards_at_refund_cutoff(auth.uid());
  own_code:=public.ensure_referral_code(auth.uid());select * into cfg from public.referral_program_settings where id=true;
  select count(*)::integer into registered_count from public.referral_relationships where inviter_account_id=auth.uid();
  select count(*)::integer into completed_count from public.discount_coupons c join public.referral_relationships r on r.id=c.referral_relationship_id where r.inviter_account_id=auth.uid() and c.recipient_kind='inviter' and c.qualifying_order_id is not null and c.status in ('active','reserved','redeemed');
  return jsonb_build_object('code',own_code,'active',cfg.active,'discountPercent',cfg.discount_percent,'validityDays',cfg.validity_days,'successfulInvites',registered_count,'completedInvites',completed_count,'pendingInvites',greatest(registered_count-completed_count,0),'achievementKey',case when completed_count>=100 then 'gold_ambassador' when completed_count>=10 then 'ambassador_candidate' when completed_count>=3 then 'rising_promoter' when completed_count>=1 then 'travel_sharer' else 'travel_explorer' end,'nextMilestone',case when completed_count<1 then 1 when completed_count<3 then 3 when completed_count<10 then 10 when completed_count<100 then 100 else null end,'coupons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'discountPercent',discount_percent,'status',status,'expiresAt',expires_at,'recipientKind',recipient_kind,'activatedAt',activated_at,'availableAt',available_at,'qualifyingTripStartsAt',qualifying_trip_starts_at) order by created_at desc) from public.discount_coupons where account_id=auth.uid()),'[]'::jsonb));
end$$;

revoke all on function public.activate_referral_rewards_at_refund_cutoff(uuid) from public,anon,authenticated;
grant execute on function public.activate_referral_rewards_at_refund_cutoff(uuid) to service_role;

commit;
