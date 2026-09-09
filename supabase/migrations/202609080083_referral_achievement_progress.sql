begin;

create or replace function public.get_own_referral_summary() returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare own_code text; cfg public.referral_program_settings%rowtype; completed_count integer; registered_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  own_code:=public.ensure_referral_code(auth.uid());
  select * into cfg from public.referral_program_settings where id=true;
  select count(*)::integer into registered_count from public.referral_relationships where inviter_account_id=auth.uid();
  select count(*)::integer into completed_count
    from public.discount_coupons c
    join public.referral_relationships r on r.id=c.referral_relationship_id
   where r.inviter_account_id=auth.uid() and c.recipient_kind='inviter'
     and c.qualifying_order_id is not null and c.status in ('active','reserved','redeemed','frozen');
  return jsonb_build_object(
    'code',own_code,'active',cfg.active,'discountPercent',cfg.discount_percent,'validityDays',cfg.validity_days,
    'successfulInvites',registered_count,'completedInvites',completed_count,'pendingInvites',greatest(registered_count-completed_count,0),
    'achievementKey',case when completed_count>=100 then 'gold_ambassador' when completed_count>=10 then 'ambassador_candidate' when completed_count>=3 then 'rising_promoter' when completed_count>=1 then 'travel_sharer' else 'travel_explorer' end,
    'nextMilestone',case when completed_count<1 then 1 when completed_count<3 then 3 when completed_count<10 then 10 when completed_count<100 then 100 else null end,
    'coupons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'discountPercent',discount_percent,'status',status,'expiresAt',expires_at,'recipientKind',recipient_kind,'activatedAt',activated_at) order by created_at desc) from public.discount_coupons where account_id=auth.uid()),'[]'::jsonb)
  );
end$$;

commit;
