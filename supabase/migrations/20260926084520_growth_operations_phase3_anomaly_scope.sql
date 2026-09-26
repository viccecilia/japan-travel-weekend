begin;

-- Scope anomaly checks to the selected root. Global legacy coupons or rewards
-- must never make a clean relationship tree look corrupt.
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

revoke all on function public.list_operations_referral_anomalies(uuid) from public,anon;
grant execute on function public.list_operations_referral_anomalies(uuid) to authenticated;

commit;
