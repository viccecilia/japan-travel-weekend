begin;

-- Phase 4.2 deliberately keeps live metrics, frozen monthly evidence, and
-- candidate review runs separate from Phase 4.1 verification generations.
alter table public.travel_moment_flags drop constraint if exists travel_moment_flags_code_check;
alter table public.travel_moment_flags add constraint travel_moment_flags_code_check check (code in (
  'DUPLICATE_CONTENT','ACCOUNT_MISMATCH','HIGH_SUBMISSION_VOLUME','POST_UNAVAILABLE',
  'ENGAGEMENT_OUTLIER','METRIC_SPIKE','METRIC_DROP','ENGAGEMENT_WITHOUT_VIEW_GROWTH'
));
alter table public.travel_moment_metric_snapshots add column if not exists refresh_key text;
create unique index if not exists travel_moment_metric_snapshot_refresh_key_idx
  on public.travel_moment_metric_snapshots(submission_id,refresh_key) where refresh_key is not null;

create table public.travel_moment_monthly_runs (
  id uuid primary key default gen_random_uuid(),
  evaluation_month date not null unique,
  cutoff_at timestamptz not null,
  status text not null default 'finalized' check(status in ('draft','finalized')),
  score_version text not null default 'phase42-v1',
  eligible_count integer not null default 0,
  pending_maturity_count integer not null default 0,
  scored_count integer not null default 0,
  candidate_count integer not null default 0,
  reserve_count integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);
create table public.travel_moment_final_snapshots (
  id uuid primary key default gen_random_uuid(),
  monthly_run_id uuid not null references public.travel_moment_monthly_runs(id) on delete cascade,
  submission_id uuid not null references public.travel_moment_submissions(id) on delete restrict,
  platform text not null check(platform in ('tiktok','instagram')),
  metric_snapshot_id uuid references public.travel_moment_metric_snapshots(id) on delete set null,
  provider text not null,
  views bigint, likes bigint, comments bigint, shares bigint, saves bigint,
  metric_coverage numeric(5,4) not null check(metric_coverage between 0 and 1),
  captured_at timestamptz not null,
  frozen_at timestamptz not null default now(),
  unique(monthly_run_id,submission_id)
);
create table public.travel_moment_monthly_candidates (
  id uuid primary key default gen_random_uuid(),
  monthly_run_id uuid not null references public.travel_moment_monthly_runs(id) on delete cascade,
  submission_id uuid not null references public.travel_moment_submissions(id) on delete restrict,
  account_id uuid not null references public.profiles(id),
  lane text not null check(lane in ('candidate','reserve')),
  original_rank integer not null check(original_rank > 0),
  current_rank integer not null check(current_rank > 0),
  auto_score numeric(8,4) not null,
  metric_coverage numeric(5,4) not null check(metric_coverage between 0 and 1),
  metric_percentiles jsonb not null default '{}'::jsonb,
  flags jsonb not null default '[]'::jsonb,
  review_status text not null default 'pending' check(review_status in ('pending','approved','rejected','featured')),
  review_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  promoted_from_reserve boolean not null default false,
  promoted_at timestamptz,
  promotion_reason text,
  created_at timestamptz not null default now(),
  unique(monthly_run_id,submission_id),
  unique(monthly_run_id,account_id)
);
create table public.travel_moment_monthly_review_audits (
  id uuid primary key default gen_random_uuid(),
  monthly_run_id uuid not null references public.travel_moment_monthly_runs(id) on delete cascade,
  candidate_id uuid references public.travel_moment_monthly_candidates(id) on delete set null,
  action text not null check(action in ('generated','rejected','approved','featured','promoted')),
  actor_id uuid references public.profiles(id),
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index travel_moment_final_snapshots_run_idx on public.travel_moment_final_snapshots(monthly_run_id,platform);
create index travel_moment_monthly_candidates_run_lane_idx on public.travel_moment_monthly_candidates(monthly_run_id,lane,current_rank);

-- A post enters the first Tokyo month whose cutoff can fairly see 72 hours of
-- public/verified evidence. This moves a late-month post to the next cycle.
create or replace function public.tm_evaluation_month(p_published_at timestamptz,p_first_verified_at timestamptz)
returns date language sql immutable set search_path=public,pg_temp as $$
  select date_trunc('month', timezone('Asia/Tokyo', coalesce(p_published_at,p_first_verified_at) + interval '72 hours'))::date
$$;

create or replace function public.tm_month_cutoff(p_month date)
returns timestamptz language sql immutable set search_path=public,pg_temp as $$
  select ((p_month + interval '1 month')::timestamp at time zone 'Asia/Tokyo')
$$;

create or replace function public.tm_open_flag(p_submission uuid,p_code text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.travel_moment_flags where submission_id=p_submission and code=p_code and resolved_at is null) then
    insert into public.travel_moment_flags(submission_id,code) values(p_submission,p_code);
  end if;
end $$;

create or replace function public.tm_detect_metric_flags(p_submission uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer; cur public.travel_moment_metric_snapshots%rowtype; prev public.travel_moment_metric_snapshots%rowtype; account_count integer;
begin
  select * into cur from public.travel_moment_metric_snapshots where submission_id=p_submission order by captured_at desc,id desc limit 1;
  if cur.id is null then return; end if;
  select * into prev from public.travel_moment_metric_snapshots where submission_id=p_submission and id<>cur.id order by captured_at desc,id desc limit 1;
  if prev.id is not null then
    if cur.likes is not null and prev.likes is not null and cur.likes >= greatest(prev.likes * 4, prev.likes + 500) then perform public.tm_open_flag(p_submission,'METRIC_SPIKE'); end if;
    if cur.likes is not null and prev.likes is not null and cur.likes * 100 < prev.likes * 70 then perform public.tm_open_flag(p_submission,'METRIC_DROP'); end if;
    if cur.views is not null and prev.views is not null and cur.likes is not null and prev.likes is not null and cur.likes > prev.likes * 2 and cur.views <= greatest(prev.views,1) * 11 / 10 then perform public.tm_open_flag(p_submission,'ENGAGEMENT_WITHOUT_VIEW_GROWTH'); end if;
  end if;
  select count(*) into account_count from public.travel_moment_submissions s where s.account_id=(select account_id from public.travel_moment_submissions where id=p_submission) and date_trunc('month',timezone('Asia/Tokyo',s.created_at))=date_trunc('month',timezone('Asia/Tokyo',(select created_at from public.travel_moment_submissions where id=p_submission)));
  if account_count >= 5 then perform public.tm_open_flag(p_submission,'HIGH_SUBMISSION_VOLUME'); end if;
  select count(*) into n from public.travel_moment_submissions s where s.platform=(select platform from public.travel_moment_submissions where id=p_submission) and s.status='eligible';
  -- Small samples never create an outlier flag. The score run remains usable.
  if n >= 5 and cur.likes is not null and cur.likes > coalesce((select percentile_cont(.5) within group(order by m.likes) + 5 * percentile_cont(.5) within group(order by abs(m.likes - med.med_likes)) from public.travel_moment_metric_snapshots m join public.travel_moment_submissions s on s.id=m.submission_id cross join lateral (select percentile_cont(.5) within group(order by x.likes) med_likes from public.travel_moment_metric_snapshots x join public.travel_moment_submissions xs on xs.id=x.submission_id where xs.platform=(select platform from public.travel_moment_submissions where id=p_submission) and xs.status='eligible') med where s.platform=(select platform from public.travel_moment_submissions where id=p_submission) and s.status='eligible'), 9223372036854775807) then perform public.tm_open_flag(p_submission,'ENGAGEMENT_OUTLIER'); end if;
end $$;

create or replace function public.record_travel_moment_metric_snapshot(p_submission uuid,p_provider text,p_metrics jsonb,p_refresh_key text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only' using errcode='42501'; end if;
  if nullif(trim(p_refresh_key),'') is null then raise exception 'refresh key required'; end if;
  select * into s from public.travel_moment_submissions where id=p_submission for update;
  if s.id is null or s.status<>'eligible' then return false; end if;
  insert into public.travel_moment_metric_snapshots(submission_id,provider,views,likes,comments,shares,saves,raw_coverage,refresh_key)
  values(s.id,p_provider,nullif(p_metrics->>'views','')::bigint,nullif(p_metrics->>'likes','')::bigint,nullif(p_metrics->>'comments','')::bigint,nullif(p_metrics->>'shares','')::bigint,nullif(p_metrics->>'saves','')::bigint,coalesce(p_metrics->'coverage','{}'),p_refresh_key)
  on conflict (submission_id,refresh_key) where refresh_key is not null do nothing;
  update public.travel_moment_submissions set last_checked_at=now(),updated_at=now() where id=s.id;
  perform public.tm_detect_metric_flags(s.id);
  return true;
end $$;

create or replace function public.get_travel_moment_metrics_refresh_queue()
returns table(submission_id uuid,post_url text,social_account_name text,platform text,verification_generation integer)
language sql security definer set search_path=public,pg_temp as $$
  select id,post_url,social_account_name,platform,verification_generation from public.travel_moment_submissions
  where status='eligible' order by coalesce(last_checked_at,first_verified_at,created_at),created_at
$$;

create or replace function public.operations_generate_travel_moment_monthly_candidates(p_month date)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run public.travel_moment_monthly_runs%rowtype; v_cutoff timestamptz:=public.tm_month_cutoff(p_month); v_actor uuid:=auth.uid();
begin
  if current_user not in ('service_role','postgres') and not public.is_operations() then raise exception 'operations only' using errcode='42501'; end if;
  insert into public.travel_moment_monthly_runs(evaluation_month,cutoff_at,created_by) values(p_month,v_cutoff,v_actor)
  on conflict(evaluation_month) do update set evaluation_month=excluded.evaluation_month returning * into v_run;
  if v_run.status='finalized' and v_run.finalized_at is not null then return v_run.id; end if;
  delete from public.travel_moment_monthly_candidates where monthly_run_id=v_run.id;
  delete from public.travel_moment_final_snapshots where monthly_run_id=v_run.id;
  insert into public.travel_moment_final_snapshots(monthly_run_id,submission_id,platform,metric_snapshot_id,provider,views,likes,comments,shares,saves,metric_coverage,captured_at)
  select v_run.id,s.id,s.platform,m.id,m.provider,m.views,m.likes,m.comments,m.shares,m.saves,
    ((m.views is not null)::int+(m.likes is not null)::int+(m.comments is not null)::int+(m.shares is not null)::int+(m.saves is not null)::int)::numeric/5,m.captured_at
  from public.travel_moment_submissions s
  join lateral (select * from public.travel_moment_metric_snapshots x where x.submission_id=s.id and x.captured_at<=v_cutoff order by x.captured_at desc,x.id desc limit 1) m on true
  where s.status='eligible' and public.tm_evaluation_month(s.published_at,s.first_verified_at)=p_month and coalesce(s.published_at,s.first_verified_at)<=v_cutoff-interval '72 hours';
  with base as (
    select f.*,s.account_id,
      case when f.likes is null then null else cume_dist() over(partition by f.platform order by f.likes nulls first) end likes_p,
      case when f.comments is null then null else cume_dist() over(partition by f.platform order by f.comments nulls first) end comments_p,
      case when f.shares is null then null else cume_dist() over(partition by f.platform order by f.shares nulls first) end shares_p,
      case when f.saves is null then null else cume_dist() over(partition by f.platform order by f.saves nulls first) end saves_p,
      case when f.views is null then null else cume_dist() over(partition by f.platform order by f.views nulls first) end views_p,
      case when f.views is null or f.views<10 or (f.likes is null and f.comments is null and f.shares is null) then null else cume_dist() over(partition by f.platform order by ((coalesce(f.likes,0)+coalesce(f.comments,0)+coalesce(f.shares,0))::numeric/f.views) nulls first) end efficiency_p
    from public.travel_moment_final_snapshots f join public.travel_moment_submissions s on s.id=f.submission_id where f.monthly_run_id=v_run.id
  ), scored as (
    select *, ((case when likes_p is null then 0 else .25 end)+(case when comments_p is null then 0 else .15 end)+(case when shares_p is null then 0 else .20 end)+(case when saves_p is null then 0 else .15 end)+(case when views_p is null then 0 else .10 end)+(case when efficiency_p is null then 0 else .15 end)) weight_sum,
    coalesce(likes_p,0)*.25+coalesce(comments_p,0)*.15+coalesce(shares_p,0)*.20+coalesce(saves_p,0)*.15+coalesce(views_p,0)*.10+coalesce(efficiency_p,0)*.15 weighted
    from base
  ), per_user as (
    select *,case when weight_sum=0 then 0 else weighted/weight_sum*100 end score,row_number() over(partition by account_id order by case when weight_sum=0 then 0 else weighted/weight_sum*100 end desc,submission_id) user_row
    from scored
  ), ranked as (
    select *,row_number() over(order by score desc,submission_id) rank from per_user where user_row=1
  )
  insert into public.travel_moment_monthly_candidates(monthly_run_id,submission_id,account_id,lane,original_rank,current_rank,auto_score,metric_coverage,metric_percentiles,flags)
  select v_run.id,r.submission_id,r.account_id,case when r.rank<=25 then 'candidate' else 'reserve' end,r.rank,r.rank,r.score,r.metric_coverage,
    jsonb_build_object('likes',r.likes_p,'comments',r.comments_p,'shares',r.shares_p,'saves',r.saves_p,'views',r.views_p,'engagementEfficiency',r.efficiency_p),
    coalesce((select jsonb_agg(f.code order by f.code) from public.travel_moment_flags f where f.submission_id=r.submission_id and f.resolved_at is null),'[]'::jsonb)
  from ranked r where r.rank<=50;
  update public.travel_moment_monthly_runs set status='finalized',finalized_at=now(),eligible_count=(select count(*) from public.travel_moment_submissions s where s.status='eligible' and public.tm_evaluation_month(s.published_at,s.first_verified_at)=p_month),pending_maturity_count=(select count(*) from public.travel_moment_submissions s where s.status='eligible' and date_trunc('month',timezone('Asia/Tokyo',coalesce(s.published_at,s.first_verified_at)))::date=p_month and coalesce(s.published_at,s.first_verified_at)>v_cutoff-interval '72 hours'),scored_count=(select count(*) from public.travel_moment_final_snapshots where monthly_run_id=v_run.id),candidate_count=(select count(*) from public.travel_moment_monthly_candidates where monthly_run_id=v_run.id and lane='candidate'),reserve_count=(select count(*) from public.travel_moment_monthly_candidates where monthly_run_id=v_run.id and lane='reserve') where id=v_run.id;
  insert into public.travel_moment_monthly_review_audits(monthly_run_id,action,actor_id,details) values(v_run.id,'generated',v_actor,jsonb_build_object('cutoffAt',v_cutoff,'scoreVersion','phase42-v1'));
  return v_run.id;
end $$;

create or replace function public.operations_review_travel_moment_candidate(p_candidate uuid,p_status text,p_reason text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.travel_moment_monthly_candidates%rowtype; reserve public.travel_moment_monthly_candidates%rowtype;
begin
  if not public.is_operations() then raise exception 'operations only' using errcode='42501'; end if;
  if p_status not in ('approved','rejected','featured') then raise exception 'invalid review status'; end if;
  if p_status='rejected' and length(trim(p_reason))<3 then raise exception 'rejection reason required'; end if;
  select * into c from public.travel_moment_monthly_candidates where id=p_candidate for update; if c.id is null then return false; end if;
  if c.review_status='rejected' then return true; end if;
  update public.travel_moment_monthly_candidates set review_status=p_status,review_reason=nullif(trim(p_reason),''),reviewed_by=auth.uid(),reviewed_at=now() where id=c.id;
  insert into public.travel_moment_monthly_review_audits(monthly_run_id,candidate_id,action,actor_id,reason) values(c.monthly_run_id,c.id,p_status,auth.uid(),nullif(trim(p_reason),''));
  if p_status='rejected' and c.lane='candidate' then
    select * into reserve from public.travel_moment_monthly_candidates where monthly_run_id=c.monthly_run_id and lane='reserve' and review_status<>'rejected' order by current_rank limit 1 for update;
    if reserve.id is not null then
      update public.travel_moment_monthly_candidates set lane='candidate',current_rank=c.current_rank,promoted_from_reserve=true,promoted_at=now(),promotion_reason='candidate rejected' where id=reserve.id;
      insert into public.travel_moment_monthly_review_audits(monthly_run_id,candidate_id,action,actor_id,reason,details) values(c.monthly_run_id,reserve.id,'promoted',auth.uid(),'candidate rejected',jsonb_build_object('rejectedCandidateId',c.id,'originalRank',reserve.original_rank,'newRank',c.current_rank));
    end if;
  end if;
  return true;
end $$;

create or replace function public.get_operations_travel_moment_monthly_review(p_month date default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.travel_moment_monthly_runs%rowtype;
begin
  if not public.is_operations() then raise exception 'operations only' using errcode='42501'; end if;
  select * into r from public.travel_moment_monthly_runs where evaluation_month=coalesce(p_month,(select max(evaluation_month) from public.travel_moment_monthly_runs)) limit 1;
  if r.id is null then return jsonb_build_object('run',null,'entries','[]'::jsonb); end if;
  return jsonb_build_object('run',to_jsonb(r),'entries',coalesce((select jsonb_agg(jsonb_build_object('candidate',to_jsonb(c),'submission',jsonb_build_object('submission_number',s.submission_number,'post_url',s.post_url,'platform',s.platform,'status',s.status),'account',jsonb_build_object('display_name',p.display_name),'trip',jsonb_build_object('title',t.title),'final_snapshot',to_jsonb(f)) order by c.lane,c.current_rank) from public.travel_moment_monthly_candidates c join public.travel_moment_submissions s on s.id=c.submission_id join public.profiles p on p.id=c.account_id left join public.trips t on t.id=s.trip_id join public.travel_moment_final_snapshots f on f.monthly_run_id=c.monthly_run_id and f.submission_id=c.submission_id where c.monthly_run_id=r.id),'[]'::jsonb));
end $$;

alter table public.travel_moment_monthly_runs enable row level security;
alter table public.travel_moment_final_snapshots enable row level security;
alter table public.travel_moment_monthly_candidates enable row level security;
alter table public.travel_moment_monthly_review_audits enable row level security;
revoke all on public.travel_moment_monthly_runs,public.travel_moment_final_snapshots,public.travel_moment_monthly_candidates,public.travel_moment_monthly_review_audits from public,anon,authenticated;
grant all on public.travel_moment_monthly_runs,public.travel_moment_final_snapshots,public.travel_moment_monthly_candidates,public.travel_moment_monthly_review_audits to service_role;
revoke all on function public.tm_open_flag(uuid,text),public.tm_detect_metric_flags(uuid),public.record_travel_moment_metric_snapshot(uuid,text,jsonb,text),public.get_travel_moment_metrics_refresh_queue(),public.operations_generate_travel_moment_monthly_candidates(date),public.operations_review_travel_moment_candidate(uuid,text,text),public.get_operations_travel_moment_monthly_review(date) from public,anon;
grant execute on function public.operations_generate_travel_moment_monthly_candidates(date),public.operations_review_travel_moment_candidate(uuid,text,text),public.get_operations_travel_moment_monthly_review(date) to authenticated,service_role;
grant execute on function public.get_travel_moment_metrics_refresh_queue(),public.record_travel_moment_metric_snapshot(uuid,text,jsonb,text) to service_role;

commit;
