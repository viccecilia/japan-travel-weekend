begin;

-- Passenger-facing choices must be actual completed trips in the open campaign month.
create or replace function public.get_own_travel_moment_orders(p_campaign uuid)
returns table(order_id uuid,trip_title text,departure_at timestamptz)
language sql security definer set search_path=public,pg_temp as $$
  select o.id,t.title,d.departs_at
  from public.link_campaigns c
  join public.orders o on o.account_id=auth.uid() and o.status in ('paid','confirmed')
  join public.departures d on d.id=o.departure_id
  join public.trips t on t.id=d.trip_id
  join public.vehicle_group_orders vgo on vgo.order_id=o.id
  join public.vehicle_group_journey_state journey on journey.vehicle_group_id=vgo.vehicle_group_id and journey.status='completed'
  where c.id=p_campaign
    and c.status='open'
    and now() between c.opens_at and c.closes_at
    and date_trunc('month',d.departs_at at time zone 'Asia/Tokyo')::date=c.campaign_month
  order by d.departs_at desc,o.id;
$$;

-- UI only accepts TikTok and Instagram. Keep existing explicit consent and every ownership/completion check.
create or replace function public.submit_travel_share_link(p_campaign uuid,p_order uuid,p_platform text,p_url text,p_platform_account text,p_authorization_version text,p_authorization_scope jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_campaign public.link_campaigns%rowtype;v_id uuid;v_url text:=lower(trim(p_url));v_normalized text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_authorization_version is distinct from 'share-link-limited-v2' or jsonb_typeof(p_authorization_scope) is distinct from 'object' or p_authorization_scope is distinct from '{"authorized":true,"mention_confirmed":true,"display":true,"monitoring":true,"repost":true,"download":false,"editing":false,"reupload":false,"paid_ads":false}'::jsonb then raise exception 'explicit limited Boost consent required' using errcode='42501'; end if;
  select c.* into v_campaign from public.link_campaigns c where c.id=p_campaign;
  if v_campaign.id is null or v_campaign.status<>'open' or now() not between v_campaign.opens_at and v_campaign.closes_at then raise exception 'campaign closed'; end if;
  if p_platform not in ('tiktok','instagram') or length(trim(p_platform_account)) not between 2 and 120 then raise exception 'invalid submission'; end if;
  if not ((p_platform='tiktok' and v_url~'^https://((www|vm)\.)?tiktok\.com/[a-z0-9@._/?=&-]+$') or (p_platform='instagram' and v_url~'^https://(www\.)?instagram\.com/(p|reel|reels)/[a-z0-9_-]+/?([?][^#]*)?$')) then raise exception 'unsupported post link'; end if;
  if not exists(select 1 from public.get_own_travel_moment_orders(p_campaign) eligible where eligible.order_id=p_order) then raise exception 'completed trip required'; end if;
  v_normalized:=regexp_replace(split_part(v_url,'#',1),'[?].*$','');
  insert into public.link_campaign_submissions(campaign_id,account_id,order_id,platform,post_url,normalized_url,platform_account,authorization_version,authorized_at,authorization_scope) values(p_campaign,auth.uid(),p_order,p_platform,trim(p_url),v_normalized,trim(p_platform_account),trim(p_authorization_version),now(),p_authorization_scope) returning id into v_id;
  return v_id;
end$$;

revoke all on function public.get_own_travel_moment_orders(uuid) from public,anon;
grant execute on function public.get_own_travel_moment_orders(uuid),public.submit_travel_share_link(uuid,uuid,text,text,text,text,jsonb) to authenticated,service_role;
commit;
