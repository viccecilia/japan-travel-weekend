begin;

create table public.link_campaigns(
  id uuid primary key default gen_random_uuid(),campaign_month date not null unique check(campaign_month=date_trunc('month',campaign_month)::date),
  status text not null default 'draft' check(status in ('draft','open','verifying','published','closed')),
  scoring_rules jsonb not null default '{}'::jsonb,official_handles jsonb not null default '{}'::jsonb,rules_version text not null default 'link-campaign-draft-v1',
  opens_at timestamptz,closes_at timestamptz,published_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.link_campaign_submissions(
  id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.link_campaigns(id),account_id uuid not null references public.profiles(id),order_id uuid not null references public.orders(id),
  platform text not null check(platform in ('tiktok','instagram','facebook')),post_url text not null,normalized_url text not null unique,platform_account text not null,
  authorization_version text not null,authorized_at timestamptz not null,authorization_scope jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','valid','needs_information','ineligible','withdrawn')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(campaign_id,account_id,order_id,platform)
);
create table public.link_campaign_verifications(
  id uuid primary key default gen_random_uuid(),submission_id uuid not null references public.link_campaign_submissions(id),verified_by uuid not null references public.profiles(id),
  status text not null check(status in ('valid','needs_information','ineligible')),official_mention_verified boolean,ownership_verified boolean,trip_verified boolean,
  visible_metrics jsonb,source_observed_at timestamptz,reason text not null check(length(trim(reason))>=3),created_at timestamptz not null default now()
);
create table public.link_campaign_rankings(
  campaign_id uuid not null references public.link_campaigns(id),rank integer not null check(rank between 1 and 10),submission_id uuid not null references public.link_campaign_submissions(id),
  finalized_by uuid not null references public.profiles(id),finalized_at timestamptz not null default now(),coupon_id uuid references public.discount_coupons(id),primary key(campaign_id,rank),unique(campaign_id,submission_id)
);
create unique index link_campaign_coupon_award_unique on public.discount_coupons(source_type,source_id) where source_type='link_campaign' and source_id is not null;
alter table public.link_campaigns enable row level security;alter table public.link_campaign_submissions enable row level security;alter table public.link_campaign_verifications enable row level security;alter table public.link_campaign_rankings enable row level security;
revoke all on public.link_campaigns,public.link_campaign_submissions,public.link_campaign_verifications,public.link_campaign_rankings from public,anon,authenticated;
grant all on public.link_campaigns,public.link_campaign_submissions,public.link_campaign_verifications,public.link_campaign_rankings to service_role;
grant select on public.link_campaigns,public.link_campaign_rankings to authenticated;grant select on public.link_campaign_submissions to authenticated;
create policy link_campaign_visible on public.link_campaigns for select to authenticated using(status<>'draft' or public.is_operations());
create policy own_link_submissions on public.link_campaign_submissions for select to authenticated using(account_id=auth.uid() or public.is_operations());
create policy published_rankings on public.link_campaign_rankings for select to authenticated using(exists(select 1 from public.link_campaigns c where c.id=campaign_id and c.status='published') or public.is_operations());

create function public.submit_travel_share_link(p_campaign uuid,p_order uuid,p_platform text,p_url text,p_platform_account text,p_authorization_version text,p_authorization_scope jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_campaign public.link_campaigns%rowtype;v_id uuid;v_url text:=lower(trim(p_url));
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select c.* into v_campaign from public.link_campaigns c where c.id=p_campaign;
  if v_campaign.id is null or v_campaign.status<>'open' or now() not between v_campaign.opens_at and v_campaign.closes_at then raise exception 'campaign closed'; end if;
  if p_platform not in ('tiktok','instagram','facebook') or length(trim(p_platform_account))<2 or length(trim(p_authorization_version))<3 then raise exception 'invalid submission'; end if;
  if not ((p_platform='tiktok' and v_url~'^https://(www\.)?tiktok\.com/[a-z0-9@._/-]+([?][^#]*)?$') or (p_platform='instagram' and v_url~'^https://(www\.)?instagram\.com/[a-z0-9@._/-]+([?][^#]*)?$') or (p_platform='facebook' and v_url~'^https://(www\.)?facebook\.com/[a-z0-9@._/-]+([?][^#]*)?$')) then raise exception 'unsupported post link'; end if;
  if not exists(select 1 from public.orders o where o.id=p_order and o.account_id=auth.uid() and o.status in ('paid','confirmed') and exists(select 1 from public.vehicle_group_orders vgo join public.vehicle_group_journey_state j on j.vehicle_group_id=vgo.vehicle_group_id where vgo.order_id=o.id and j.status='completed')) then raise exception 'completed trip required'; end if;
  insert into public.link_campaign_submissions(campaign_id,account_id,order_id,platform,post_url,normalized_url,platform_account,authorization_version,authorized_at,authorization_scope)
  values(p_campaign,auth.uid(),p_order,p_platform,trim(p_url),split_part(v_url,'#',1),trim(p_platform_account),trim(p_authorization_version),now(),coalesce(p_authorization_scope,'{}')) returning id into v_id;
  return v_id;
end$$;

create function public.operations_verify_travel_share_link(p_submission uuid,p_status text,p_mention boolean,p_ownership boolean,p_trip boolean,p_metrics jsonb,p_observed_at timestamptz,p_reason text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_status not in ('valid','needs_information','ineligible') or length(trim(p_reason))<3 then raise exception 'invalid verification'; end if;
  if p_status='valid' and (p_mention is not true or p_ownership is not true or p_trip is not true or p_observed_at is null) then raise exception 'verification evidence incomplete'; end if;
  insert into public.link_campaign_verifications(submission_id,verified_by,status,official_mention_verified,ownership_verified,trip_verified,visible_metrics,source_observed_at,reason) values(p_submission,auth.uid(),p_status,p_mention,p_ownership,p_trip,p_metrics,p_observed_at,trim(p_reason));
  update public.link_campaign_submissions s set status=p_status,updated_at=now() where s.id=p_submission;return found;
end$$;

create function public.operations_finalize_link_campaign(p_campaign uuid,p_rankings jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.link_campaigns%rowtype;item jsonb;v_rank integer;v_submission uuid;v_account uuid;v_coupon uuid;v_percent integer;v_count integer:=0;v_source text;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  select x.* into c from public.link_campaigns x where x.id=p_campaign for update;
  if c.id is null or c.status not in ('verifying','published') or c.scoring_rules='{}' or c.official_handles='{}' then raise exception 'campaign rules incomplete'; end if;
  if jsonb_typeof(p_rankings)<>'array' then raise exception 'rankings required'; end if;
  for item in select * from jsonb_array_elements(p_rankings) loop
    v_rank:=(item->>'rank')::integer;v_submission:=(item->>'submissionId')::uuid;
    if v_rank not between 1 and 10 then raise exception 'invalid rank'; end if;
    select s.account_id into v_account from public.link_campaign_submissions s where s.id=v_submission and s.campaign_id=p_campaign and s.status='valid';
    if v_account is null then raise exception 'verified submission required'; end if;
    v_percent:=case v_rank when 1 then 100 when 2 then 50 when 3 then 30 else 10 end;v_source:=p_campaign::text||':'||v_rank::text;
    insert into public.discount_coupons(account_id,discount_percent,status,expires_at,source_type,source_id,rules_version,max_discounted_seats) values(v_account,v_percent,'active',now()+interval '3 months','link_campaign',v_source,c.rules_version,1)
      on conflict(source_type,source_id) where source_type='link_campaign' and source_id is not null do update set source_id=excluded.source_id returning id into v_coupon;
    insert into public.link_campaign_rankings(campaign_id,rank,submission_id,finalized_by,coupon_id) values(p_campaign,v_rank,v_submission,auth.uid(),v_coupon)
      on conflict(campaign_id,rank) do update set submission_id=excluded.submission_id,coupon_id=excluded.coupon_id where public.link_campaign_rankings.submission_id=excluded.submission_id;
    if not found then raise exception 'ranking conflict'; end if;v_count:=v_count+1;
  end loop;
  update public.link_campaigns set status='published',published_at=coalesce(published_at,now()),updated_at=now() where id=p_campaign;return v_count;
end$$;

revoke all on function public.submit_travel_share_link(uuid,uuid,text,text,text,text,jsonb),public.operations_verify_travel_share_link(uuid,text,boolean,boolean,boolean,jsonb,timestamptz,text),public.operations_finalize_link_campaign(uuid,jsonb) from public,anon;
grant execute on function public.submit_travel_share_link(uuid,uuid,text,text,text,text,jsonb) to authenticated,service_role;
grant execute on function public.operations_verify_travel_share_link(uuid,text,boolean,boolean,boolean,jsonb,timestamptz,text),public.operations_finalize_link_campaign(uuid,jsonb) to authenticated,service_role;

commit;
