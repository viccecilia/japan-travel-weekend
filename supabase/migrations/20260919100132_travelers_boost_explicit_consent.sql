begin;

create or replace function public.submit_travel_share_link(p_campaign uuid,p_order uuid,p_platform text,p_url text,p_platform_account text,p_authorization_version text,p_authorization_scope jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_campaign public.link_campaigns%rowtype;v_id uuid;v_url text:=lower(trim(p_url));
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  -- Exact JSON booleans: strings such as "true", null, omission and broader rights all fail closed.
  if p_authorization_version is distinct from 'share-link-limited-v2'
     or jsonb_typeof(p_authorization_scope) is distinct from 'object'
     or p_authorization_scope is distinct from '{"authorized":true,"mention_confirmed":true,"display":true,"monitoring":true,"repost":true,"download":false,"editing":false,"reupload":false,"paid_ads":false}'::jsonb
  then raise exception 'explicit limited Boost consent required' using errcode='42501'; end if;
  select c.* into v_campaign from public.link_campaigns c where c.id=p_campaign;
  if v_campaign.id is null or v_campaign.status<>'open' or now() not between v_campaign.opens_at and v_campaign.closes_at then raise exception 'campaign closed'; end if;
  if p_platform not in ('tiktok','instagram','facebook') or length(trim(p_platform_account))<2 or length(trim(p_authorization_version))<3 then raise exception 'invalid submission'; end if;
  if not ((p_platform='tiktok' and v_url~'^https://(www\.)?tiktok\.com/[a-z0-9@._/-]+([?][^#]*)?$') or (p_platform='instagram' and v_url~'^https://(www\.)?instagram\.com/[a-z0-9@._/-]+([?][^#]*)?$') or (p_platform='facebook' and v_url~'^https://(www\.)?facebook\.com/[a-z0-9@._/-]+([?][^#]*)?$')) then raise exception 'unsupported post link'; end if;
  if not exists(select 1 from public.orders o where o.id=p_order and o.account_id=auth.uid() and o.status in ('paid','confirmed') and exists(select 1 from public.vehicle_group_orders vgo join public.vehicle_group_journey_state j on j.vehicle_group_id=vgo.vehicle_group_id where vgo.order_id=o.id and j.status='completed')) then raise exception 'completed trip required'; end if;
  insert into public.link_campaign_submissions(campaign_id,account_id,order_id,platform,post_url,normalized_url,platform_account,authorization_version,authorized_at,authorization_scope)
  values(p_campaign,auth.uid(),p_order,p_platform,trim(p_url),split_part(v_url,'#',1),trim(p_platform_account),trim(p_authorization_version),now(),coalesce(p_authorization_scope,'{}')) returning id into v_id;
  return v_id;
end$$;

revoke all on function public.submit_travel_share_link(uuid,uuid,text,text,text,text,jsonb) from public,anon;
grant execute on function public.submit_travel_share_link(uuid,uuid,text,text,text,text,jsonb) to authenticated,service_role;

commit;
