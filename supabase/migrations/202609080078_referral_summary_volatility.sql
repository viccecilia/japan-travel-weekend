begin;

create or replace function public.get_own_referral_summary() returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare own_code text; cfg public.referral_program_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  own_code:=public.ensure_referral_code(auth.uid());
  select * into cfg from public.referral_program_settings where id=true;
  return jsonb_build_object('code',own_code,'active',cfg.active,'discountPercent',cfg.discount_percent,'validityDays',cfg.validity_days,
    'successfulInvites',(select count(*) from public.referral_relationships where inviter_account_id=auth.uid()),
    'coupons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'discountPercent',discount_percent,'status',status,'expiresAt',expires_at,'recipientKind',recipient_kind) order by created_at desc) from public.discount_coupons where account_id=auth.uid()),'[]'::jsonb));
end$$;

commit;
