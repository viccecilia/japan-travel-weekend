begin;

-- A period restricts metrics, not the ancestral context needed to understand
-- an in-period descendant.  This keeps the tree readable when a parent was
-- registered earlier than the selected window.
create or replace function public.get_operations_referral_tree_children(
  p_root uuid,p_parent uuid,p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 40
) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations access required'; end if;
  if not exists(select 1 from public.referral_sources where id=p_root) then raise exception 'unknown referral root'; end if;
  return jsonb_build_object('items',coalesce((
    with recursive settings as (select * from public.referral_tree_analysis_settings where singleton), graph as (
      select r.id relation_id,r.invitee_account_id,r.parent_source_id,r.root_source_id,r.created_at,l.status,l.first_payment_completed_at,l.first_trip_completed_at,child.id source_id,
        exists(select 1 from public.ambassador_qualifications q where q.account_id=r.invitee_account_id and q.status in ('active','approved') and q.revoked_at is null) is_ambassador
      from public.referral_relationships r join public.referral_sources child on child.account_id=r.invitee_account_id
      left join public.referral_lifecycles l on l.referral_relationship_id=r.id where r.root_source_id=p_root
    ), matching as (
      select * from graph where (p_from is null or created_at>=p_from::timestamptz) and (p_to is null or created_at<(p_to+1)::timestamptz)
    ), context_sources(source_id) as (
      select source_id from matching
      union
      select g.parent_source_id from graph g join context_sources c on c.source_id=g.source_id where g.parent_source_id<>p_root
    ), children as (
      select * from graph where parent_source_id=p_parent and (p_from is null or source_id in (select source_id from context_sources))
    ) select jsonb_agg(jsonb_build_object(
      'sourceId',source_id,'relationId',relation_id,'label','U***'||right(replace(invitee_account_id::text,'-',''),2),'depth',(select depth from public.get_referral_descendants(p_root) d where d.source_id=children.source_id),'status',coalesce(status,'registered'),'registeredAt',created_at,'firstPaidAt',first_payment_completed_at,'firstTripAt',first_trip_completed_at,'isAmbassador',is_ambassador,
      'childCount',(select count(*) from public.referral_relationships c where c.parent_source_id=children.source_id),'validChildren',(select count(*) from public.referral_relationships c join public.referral_lifecycles cl on cl.referral_relationship_id=c.id where c.parent_source_id=children.source_id and cl.status='valid_referral'),
      'highValue',((select count(*) from public.referral_relationships c where c.parent_source_id=children.source_id)>=(select high_value_direct_min from settings) or (select count(*) from public.get_referral_descendants(children.source_id) d join public.referral_relationships r on r.invitee_account_id=d.account_id join public.referral_lifecycles l on l.referral_relationship_id=r.id where d.depth>0 and l.status='valid_referral')>=(select high_value_valid_min from settings))
    ) order by created_at asc) from (select * from children order by created_at asc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100)) children
  ),'[]'::jsonb),'nextOffset',p_offset+p_limit);
end$$;

revoke all on function public.get_operations_referral_tree_children(uuid,uuid,date,date,integer,integer) from public,anon;
grant execute on function public.get_operations_referral_tree_children(uuid,uuid,date,date,integer,integer) to authenticated;
commit;
