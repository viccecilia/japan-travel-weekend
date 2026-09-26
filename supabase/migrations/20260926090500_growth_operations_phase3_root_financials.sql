begin;

-- Root commercial figures remain read-only and keep coupon source categories
-- separate from referral cash costs.
create or replace function public.get_operations_referral_root_summary(p_root uuid,p_from date default null,p_to date default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  if not public.is_operations() then raise exception 'operations access required'; end if;
  with scoped as (
    select r.*,l.status,l.first_payment_completed_at,l.first_trip_completed_at,l.first_completed_order_id
    from public.referral_relationships r join public.referral_lifecycles l on l.referral_relationship_id=r.id
    where r.root_source_id=p_root and (p_from is null or r.created_at>=p_from::timestamptz) and (p_to is null or r.created_at<(p_to+1)::timestamptz)
  ), descendants as (select * from public.get_referral_descendants(p_root) where depth>0),
  cash as (select c.* from public.cash_commission_entries c join scoped s on s.id=c.referral_relationship_id),
  coupons as (select c.* from public.discount_coupons c join scoped s on s.invitee_account_id=c.account_id),
  coupon_sources as (select coalesce(source_type,'unknown') source_type,sum(coalesce(face_value_jpy,0)) amount from coupons group by coalesce(source_type,'unknown'))
  select jsonb_build_object(
    'directRegistered',(select count(*) from scoped where parent_source_id=p_root),
    'indirectRegistered',(select count(*) from scoped where parent_source_id<>p_root),
    'downstream',(select count(*) from descendants),
    'firstPaid',(select count(*) from scoped where first_payment_completed_at is not null),
    'validTrips',(select count(*) from scoped where status='valid_referral'),
    'invalid',(select count(*) from scoped where status in ('refunded','invalid','cancelled')),
    'maxDepth',coalesce((select max(depth) from descendants),0),
    'salesJpy',coalesce((select sum(coalesce(o.gross_amount,o.amount,0)) from scoped s join public.orders o on o.id=s.first_completed_order_id where s.status='valid_referral'),0),
    'cumulativeSalesJpy',coalesce((select sum(coalesce(o.gross_amount,o.amount,0)) from scoped s join public.orders o on o.id=s.first_completed_order_id),0),
    'commissionJpy',coalesce((select sum(amount_jpy) from cash),0),
    'commissionPaidJpy',coalesce((select sum(amount_jpy) from cash where status='paid'),0),
    'commissionInvalidJpy',coalesce((select sum(amount_jpy) from cash where status='invalid'),0),
    'couponBySource',coalesce((select jsonb_object_agg(source_type,amount) from coupon_sources),'{}'::jsonb),
    'avgRegistrationToPaymentDays',(select avg(extract(epoch from (first_payment_completed_at-created_at))/86400) from scoped where first_payment_completed_at is not null),
    'avgRegistrationToTripDays',(select avg(extract(epoch from (first_trip_completed_at-created_at))/86400) from scoped where first_trip_completed_at is not null)
  ) into v;
  return v;
end$$;

revoke all on function public.get_operations_referral_root_summary(uuid,date,date) from public,anon;
grant execute on function public.get_operations_referral_root_summary(uuid,date,date) to authenticated;
commit;
