begin;

-- Phase 3 reads the Phase 1 referral graph; it deliberately does not create a
-- second referral, reward or coupon ledger.  Every operation is restricted to
-- operations users and masks public-facing identity fields by default.
create or replace function public.list_operations_referral_roots(
  p_from date default null,
  p_to date default null,
  p_kind text default 'all'
) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations access required'; end if;
  return coalesce((
    with roots as (
      select s.* from public.referral_sources s
      where s.active and (
        s.source_kind <> 'account' or not exists(
          select 1 from public.referral_relationships incoming where incoming.invitee_account_id=s.account_id
        )
      )
    ), scoped as (
      select r.* from public.referral_relationships r
      where (p_from is null or r.created_at >= p_from::timestamptz)
        and (p_to is null or r.created_at < (p_to + 1)::timestamptz)
    )
    select jsonb_agg(jsonb_build_object(
      'id',s.id,'code',s.code,'name',case when s.source_kind='account' then 'U***'||right(replace(s.id::text,'-',''),2) else s.display_name end,
      'kind',case when s.source_kind='account' then coalesce(a.source,'person') else s.source_kind end,
      'registered',(select count(*) from scoped r where r.root_source_id=s.id),
      'firstPaid',(select count(*) from scoped r join public.referral_lifecycles l on l.referral_relationship_id=r.id where r.root_source_id=s.id and l.first_payment_completed_at is not null),
      'validTrips',(select count(*) from scoped r join public.referral_lifecycles l on l.referral_relationship_id=r.id where r.root_source_id=s.id and l.status='valid_referral'),
      'downstream',(select count(*) from public.get_referral_descendants(s.id) d where d.depth>0)
    ) order by s.created_at desc)
    from roots s left join public.ambassador_qualifications a on a.account_id=s.account_id
    where p_kind='all' or p_kind=case when s.source_kind='account' then coalesce(a.source,'person') else s.source_kind end
  ),'[]'::jsonb);
end$$;

create or replace function public.get_operations_referral_tree_children(
  p_root uuid,p_parent uuid,p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 40
) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations access required'; end if;
  if not exists(select 1 from public.referral_sources where id=p_root) then raise exception 'unknown referral root'; end if;
  return jsonb_build_object('items',coalesce((
    with children as (
      select r.id relation_id,r.invitee_account_id,r.parent_source_id,r.root_source_id,r.created_at,l.status,l.first_payment_completed_at,l.first_trip_completed_at,
        child.id source_id, child.code, p.display_name
      from public.referral_relationships r
      join public.referral_sources child on child.account_id=r.invitee_account_id
      join public.profiles p on p.id=r.invitee_account_id
      left join public.referral_lifecycles l on l.referral_relationship_id=r.id
      where r.root_source_id=p_root and r.parent_source_id=p_parent
        and (p_from is null or r.created_at >= p_from::timestamptz)
        and (p_to is null or r.created_at < (p_to + 1)::timestamptz)
    ) select jsonb_agg(jsonb_build_object(
      'sourceId',source_id,'relationId',relation_id,'label','U***'||right(replace(invitee_account_id::text,'-',''),2),
      'depth',(select depth from public.get_referral_descendants(p_root) d where d.source_id=children.source_id),
      'status',coalesce(status,'registered'),'registeredAt',created_at,'firstPaidAt',first_payment_completed_at,'firstTripAt',first_trip_completed_at,
      'childCount',(select count(*) from public.referral_relationships c where c.parent_source_id=children.source_id),
      'validChildren',(select count(*) from public.referral_relationships c join public.referral_lifecycles cl on cl.referral_relationship_id=c.id where c.parent_source_id=children.source_id and cl.status='valid_referral')
    ) order by created_at asc)
    from (select * from children order by created_at asc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100)) children
  ),'[]'::jsonb),'nextOffset',p_offset+p_limit);
end$$;

create or replace function public.get_operations_referral_root_summary(p_root uuid,p_from date default null,p_to date default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  if not public.is_operations() then raise exception 'operations access required'; end if;
  with scoped as (
    select r.*,l.status,l.first_payment_completed_at,l.first_trip_completed_at,l.first_completed_order_id
    from public.referral_relationships r join public.referral_lifecycles l on l.referral_relationship_id=r.id
    where r.root_source_id=p_root and (p_from is null or r.created_at>=p_from::timestamptz) and (p_to is null or r.created_at<(p_to+1)::timestamptz)
  ), descendants as (select * from public.get_referral_descendants(p_root) where depth>0)
  select jsonb_build_object(
    'directRegistered',(select count(*) from scoped where parent_source_id=p_root),
    'indirectRegistered',(select count(*) from scoped where parent_source_id<>p_root),
    'downstream',(select count(*) from descendants),
    'firstPaid',(select count(*) from scoped where first_payment_completed_at is not null),
    'validTrips',(select count(*) from scoped where status='valid_referral'),
    'invalid',(select count(*) from scoped where status in ('refunded','invalid','cancelled')),
    'maxDepth',coalesce((select max(depth) from descendants),0),
    'salesJpy',coalesce((select sum(coalesce(o.gross_amount,o.amount,0)) from scoped s join public.orders o on o.id=s.first_completed_order_id where s.status='valid_referral'),0),
    'commissionJpy',coalesce((select sum(c.amount_jpy) from public.cash_commission_entries c join scoped s on s.id=c.referral_relationship_id),0),
    'avgRegistrationToPaymentDays',(select avg(extract(epoch from (first_payment_completed_at-created_at))/86400) from scoped where first_payment_completed_at is not null),
    'avgRegistrationToTripDays',(select avg(extract(epoch from (first_trip_completed_at-created_at))/86400) from scoped where first_trip_completed_at is not null)
  ) into v;
  return v;
end$$;

revoke all on function public.list_operations_referral_roots(date,date,text),public.get_operations_referral_tree_children(uuid,uuid,date,date,integer,integer),public.get_operations_referral_root_summary(uuid,date,date) from public,anon;
grant execute on function public.list_operations_referral_roots(date,date,text),public.get_operations_referral_tree_children(uuid,uuid,date,date,integer,integer),public.get_operations_referral_root_summary(uuid,date,date) to authenticated;
commit;
