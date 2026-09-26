begin;

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

revoke all on function public.list_operations_referral_roots(date,date,text) from public,anon;
grant execute on function public.list_operations_referral_roots(date,date,text) to authenticated;

commit;
