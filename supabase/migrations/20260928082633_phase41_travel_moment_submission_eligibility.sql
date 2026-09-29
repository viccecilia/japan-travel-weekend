begin;

alter table public.orders add column if not exists is_test_order boolean not null default false;

create table public.travel_moment_submissions (
  id uuid primary key default gen_random_uuid(),
  serial bigint generated always as identity unique,
  submission_number text not null unique,
  account_id uuid not null references public.profiles(id),
  requested_order_id uuid not null,
  order_id uuid references public.orders(id),
  trip_id uuid references public.trips(id),
  platform text not null check (platform in ('tiktok','instagram')),
  post_url text not null,
  canonical_url text not null,
  canonical_content_id text,
  social_account_name text not null check (length(trim(social_account_name)) between 2 and 120),
  status text not null default 'submitted' check (status in ('submitted','checking','needs_adjustment','pending_review','eligible','ineligible','unavailable')),
  internal_verdict text not null default 'pending' check (internal_verdict in ('pending','eligible','ineligible')),
  external_verdict text not null default 'unknown' check (external_verdict in ('pending','passed','needs_adjustment','unknown','unavailable')),
  reason_codes text[] not null default '{}'::text[],
  first_verified_at timestamptz,
  published_at timestamptz,
  last_checked_at timestamptz,
  last_user_recheck_at timestamptz,
  is_test_order boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform, canonical_url)
);
create unique index travel_moment_submissions_content_unique
  on public.travel_moment_submissions(platform, canonical_content_id)
  where canonical_content_id is not null;
create index travel_moment_submissions_account_created_idx on public.travel_moment_submissions(account_id, created_at desc);
create index travel_moment_submissions_status_created_idx on public.travel_moment_submissions(status, created_at desc);

create table public.travel_moment_check_runs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.travel_moment_submissions(id) on delete cascade,
  triggered_by uuid references public.profiles(id),
  trigger text not null check (trigger in ('initial_submit','user_recheck','system_recheck','admin_recheck')),
  provider text not null,
  status text not null check (status in ('started','completed','unavailable','failed')),
  internal_result jsonb not null default '{}'::jsonb,
  external_result jsonb not null default '{}'::jsonb,
  reason_codes text[] not null default '{}'::text[],
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index travel_moment_check_runs_submission_idx on public.travel_moment_check_runs(submission_id, started_at desc);

create table public.travel_moment_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.travel_moment_submissions(id) on delete cascade,
  captured_at timestamptz not null default now(),
  provider text not null,
  views bigint check (views is null or views >= 0), likes bigint check (likes is null or likes >= 0),
  comments bigint check (comments is null or comments >= 0), shares bigint check (shares is null or shares >= 0),
  saves bigint check (saves is null or saves >= 0),
  raw_coverage jsonb not null default '{}'::jsonb
);
create index travel_moment_metrics_submission_idx on public.travel_moment_metric_snapshots(submission_id, captured_at desc);

create table public.travel_moment_flags (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.travel_moment_submissions(id) on delete cascade,
  code text not null check (code in ('DUPLICATE_CONTENT','ACCOUNT_MISMATCH','HIGH_SUBMISSION_VOLUME','POST_UNAVAILABLE')),
  created_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid references public.profiles(id),
  unique(submission_id, code, resolved_at)
);
create table public.travel_moment_eligibility_audits (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.travel_moment_submissions(id) on delete cascade,
  old_status text, new_status text not null, reason_codes text[] not null default '{}'::text[],
  source text not null check (source in ('internal','provider','manual','refund_hook','admin')),
  actor_id uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.travel_moment_manual_verifications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.travel_moment_submissions(id) on delete cascade,
  operator_id uuid not null references public.profiles(id),
  field text not null check (field in ('official_mention','campaign_hashtag','author')),
  decision text not null check (decision in ('confirmed','rejected')),
  reason text not null check (length(trim(reason)) >= 3), created_at timestamptz not null default now()
);

create or replace function public.tm_submission_number() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.submission_number is null or new.submission_number='' then
    new.submission_number := 'TM-' || to_char(now() at time zone 'Asia/Tokyo','YYYYMM') || '-' || lpad(new.serial::text, 6, '0');
  end if;
  return new;
end $$;
create trigger travel_moment_submission_number before insert on public.travel_moment_submissions for each row execute function public.tm_submission_number();

create or replace function public.tm_canonical_url(p_url text) returns text language sql immutable set search_path=public,pg_temp as $$
  select regexp_replace(regexp_replace(lower(trim(p_url)), '[?#].*$', ''), '/+$', '')
$$;
create or replace function public.tm_content_id(p_platform text,p_url text) returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare m text[];
begin
  if p_platform='instagram' then m:=regexp_match(p_url,'instagram\\.com/(?:p|reel|reels)/([^/]+)'); if m is not null then return 'instagram:'||m[1]; end if; end if;
  if p_platform='tiktok' then m:=regexp_match(p_url,'tiktok\\.com/@[^/]+/video/([0-9]+)'); if m is not null then return 'tiktok:'||m[1]; end if; end if;
  return null;
end $$;
create or replace function public.tm_internal_reason(p_account uuid,p_order uuid) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare o record;
begin
  select o.id,o.account_id,o.status,o.is_test_order,j.status as journey_status into o from public.orders o
  left join public.vehicle_group_orders vgo on vgo.order_id=o.id
  left join public.vehicle_group_journey_state j on j.vehicle_group_id=vgo.vehicle_group_id where o.id=p_order;
  if o.id is null then return 'TRIP_NOT_FOUND'; end if;
  if o.account_id<>p_account then return 'TRIP_MISMATCH'; end if;
  if coalesce(o.is_test_order,false) then return 'TEST_ORDER'; end if;
  if o.status='refunded' then return 'ORDER_REFUNDED'; end if;
  if o.status not in ('paid','confirmed') then return 'ORDER_UNPAID'; end if;
  if o.journey_status is distinct from 'completed' then return 'TRIP_NOT_COMPLETED'; end if;
  return null;
end $$;

create or replace function public.create_travel_moment_submission(p_order uuid,p_platform text,p_url text,p_social_account_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account uuid:=auth.uid(); v_url text:=public.tm_canonical_url(p_url); v_detected text; v_reason text; v_existing uuid; v_submission public.travel_moment_submissions%rowtype; v_trip uuid;
begin
  if v_account is null then raise exception 'authentication required' using errcode='42501'; end if;
  if v_url !~ '^https://[^/]+/' then v_reason:='INVALID_URL';
  elsif v_url ~ '(^https://(?:www\\.|vm\\.)?tiktok\\.com/)' then v_detected:='tiktok';
  elsif v_url ~ '^https://(?:www\\.)?instagram\\.com/' then v_detected:='instagram';
  else v_reason:='UNSUPPORTED_PLATFORM'; end if;
  if v_reason is null and (p_platform<>v_detected or (v_detected='instagram' and v_url !~ 'instagram\\.com/(p|reel|reels)/[^/]+') or (v_detected='tiktok' and v_url !~ 'tiktok\\.com/(?:@[^/]+/video/[0-9]+|[^/]+)')) then v_reason:='PROFILE_URL_NOT_POST'; end if;
  select id into v_existing from public.travel_moment_submissions where platform=coalesce(v_detected,p_platform) and canonical_url=v_url;
  if v_existing is not null then return jsonb_build_object('submission_id',v_existing,'duplicate',true,'reason_code','DUPLICATE_CONTENT'); end if;
  v_reason:=coalesce(v_reason,public.tm_internal_reason(v_account,p_order));
  select d.trip_id into v_trip from public.orders o join public.departures d on d.id=o.departure_id where o.id=p_order;
  insert into public.travel_moment_submissions(submission_number,account_id,requested_order_id,order_id,trip_id,platform,post_url,canonical_url,canonical_content_id,social_account_name,status,internal_verdict,reason_codes,is_test_order)
  values('',v_account,p_order,case when v_trip is null then null else p_order end,v_trip,coalesce(v_detected,p_platform),trim(p_url),v_url,public.tm_content_id(coalesce(v_detected,p_platform),v_url),trim(p_social_account_name),case when v_reason is null then 'checking' else 'ineligible' end,case when v_reason is null then 'eligible' else 'ineligible' end,case when v_reason is null then '{}'::text[] else array[v_reason] end,coalesce((select is_test_order from public.orders where id=p_order),false)) returning * into v_submission;
  insert into public.travel_moment_check_runs(submission_id,triggered_by,trigger,provider,status,internal_result,reason_codes,completed_at) values(v_submission.id,v_account,'initial_submit','internal','completed',jsonb_build_object('verdict',v_submission.internal_verdict),v_submission.reason_codes,now());
  insert into public.travel_moment_eligibility_audits(submission_id,new_status,reason_codes,source,actor_id) values(v_submission.id,v_submission.status,v_submission.reason_codes,'internal',v_account);
  return jsonb_build_object('submission_id',v_submission.id,'submission_number',v_submission.submission_number,'duplicate',false,'status',v_submission.status,'reason_codes',v_submission.reason_codes);
end $$;

create or replace function public.request_travel_moment_recheck(p_submission uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype;
begin
  select * into s from public.travel_moment_submissions where id=p_submission and account_id=auth.uid() for update;
  if s.id is null then raise exception 'submission not found' using errcode='42501'; end if;
  if s.status not in ('needs_adjustment','pending_review','unavailable') then raise exception 'submission cannot be rechecked'; end if;
  if s.last_user_recheck_at is not null and s.last_user_recheck_at>now()-interval '6 hours' then raise exception 'recheck rate limited'; end if;
  update public.travel_moment_submissions set status='checking',last_user_recheck_at=now(),updated_at=now() where id=s.id;
  insert into public.travel_moment_check_runs(submission_id,triggered_by,trigger,provider,status) values(s.id,auth.uid(),'user_recheck','pending','started');
  insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,source,actor_id) values(s.id,s.status,'checking','internal',auth.uid()); return true;
end $$;

create or replace function public.update_own_travel_moment_submission(p_submission uuid,p_order uuid,p_social_account_name text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype; v_reason text; v_trip uuid;
begin
 select * into s from public.travel_moment_submissions where id=p_submission and account_id=auth.uid() for update;
 if s.id is null then raise exception 'submission not found' using errcode='42501'; end if;
 if s.status not in ('needs_adjustment','pending_review','unavailable') then raise exception 'submission cannot be edited'; end if;
 if length(trim(p_social_account_name)) not between 2 and 120 then raise exception 'invalid social account'; end if;
 v_reason:=public.tm_internal_reason(auth.uid(),p_order);select d.trip_id into v_trip from public.orders o join public.departures d on d.id=o.departure_id where o.id=p_order;
 update public.travel_moment_submissions set requested_order_id=p_order,order_id=case when v_trip is null then null else p_order end,trip_id=v_trip,social_account_name=trim(p_social_account_name),internal_verdict=case when v_reason is null then 'eligible' else 'ineligible' end,status=case when v_reason is null then 'pending_review' else 'ineligible' end,reason_codes=case when v_reason is null then '{}'::text[] else array[v_reason] end,updated_at=now() where id=s.id;
 insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source,actor_id) values(s.id,s.status,case when v_reason is null then 'pending_review' else 'ineligible' end,case when v_reason is null then '{}'::text[] else array[v_reason] end,'internal',auth.uid()); return true;
end $$;

create or replace function public.operations_recheck_travel_moment(p_submission uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype;
begin
 if not public.is_operations() then raise exception 'operations only' using errcode='42501'; end if;
 select * into s from public.travel_moment_submissions where id=p_submission for update; if s.id is null then return false; end if;
 update public.travel_moment_submissions set status=case when internal_verdict='ineligible' then 'ineligible' else 'checking' end,updated_at=now() where id=s.id;
 insert into public.travel_moment_check_runs(submission_id,triggered_by,trigger,provider,status) values(s.id,auth.uid(),'admin_recheck','pending','started');
 insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source,actor_id) values(s.id,s.status,case when s.internal_verdict='ineligible' then 'ineligible' else 'checking' end,s.reason_codes,'admin',auth.uid());return true;
end $$;

create or replace function public.get_own_travel_moment_trips() returns table(order_id uuid,trip_id uuid,trip_title text,departure_at timestamptz) language sql security definer set search_path=public,pg_temp as $$
 select o.id,d.trip_id,t.title,d.departs_at from public.orders o join public.departures d on d.id=o.departure_id join public.trips t on t.id=d.trip_id join public.vehicle_group_orders vgo on vgo.order_id=o.id join public.vehicle_group_journey_state j on j.vehicle_group_id=vgo.vehicle_group_id
 where o.account_id=auth.uid() and o.status in ('paid','confirmed') and o.is_test_order=false and j.status='completed' order by d.departs_at desc
$$;

create or replace function public.record_travel_moment_provider_check(p_submission uuid,p_trigger text,p_provider text,p_result jsonb,p_reason_codes text[],p_metrics jsonb default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype; v_status text; v_external text; v_old text;
begin
  if current_user not in ('service_role','postgres') and not public.is_operations() then raise exception 'trusted service only' using errcode='42501'; end if;
  select * into s from public.travel_moment_submissions where id=p_submission for update; if s.id is null then return false; end if; v_old:=s.status;
  if s.internal_verdict='ineligible' then v_status:='ineligible';v_external:='unknown';
  elsif coalesce(array_length(p_reason_codes,1),0)=0 and coalesce((p_result->>'public')::boolean,false) and coalesce((p_result->>'officialMention')::boolean,false) and coalesce((p_result->>'campaignHashtag')::boolean,false) and coalesce((p_result->>'authorMatches')::boolean,false) then v_status:='eligible';v_external:='passed';
  elsif 'EXTERNAL_CHECK_UNAVAILABLE'=any(p_reason_codes) then v_status:='pending_review';v_external:='unavailable';
  elsif 'POST_PRIVATE'=any(p_reason_codes) or 'POST_UNAVAILABLE'=any(p_reason_codes) then v_status:='needs_adjustment';v_external:='needs_adjustment';
  else v_status:='needs_adjustment';v_external:='needs_adjustment'; end if;
  update public.travel_moment_submissions set status=v_status,external_verdict=v_external,reason_codes=coalesce(p_reason_codes,'{}'),first_verified_at=case when v_status='eligible' then coalesce(first_verified_at,now()) else first_verified_at end,published_at=coalesce(nullif(p_result->>'publishedAt','')::timestamptz,published_at),last_checked_at=now(),updated_at=now() where id=s.id;
  insert into public.travel_moment_check_runs(submission_id,trigger,provider,status,external_result,reason_codes,completed_at) values(s.id,p_trigger,p_provider,case when v_external='unavailable' then 'unavailable' else 'completed' end,coalesce(p_result,'{}'),coalesce(p_reason_codes,'{}'),now());
  if p_metrics is not null then insert into public.travel_moment_metric_snapshots(submission_id,provider,views,likes,comments,shares,saves,raw_coverage) values(s.id,p_provider,nullif(p_metrics->>'views','')::bigint,nullif(p_metrics->>'likes','')::bigint,nullif(p_metrics->>'comments','')::bigint,nullif(p_metrics->>'shares','')::bigint,nullif(p_metrics->>'saves','')::bigint,coalesce(p_metrics->'coverage','{}')); end if;
  if 'ACCOUNT_MISMATCH'=any(p_reason_codes) or 'POST_UNAVAILABLE'=any(p_reason_codes) then insert into public.travel_moment_flags(submission_id,code) select s.id,case when 'ACCOUNT_MISMATCH'=any(p_reason_codes) then 'ACCOUNT_MISMATCH' else 'POST_UNAVAILABLE' end where not exists(select 1 from public.travel_moment_flags where submission_id=s.id and code in ('ACCOUNT_MISMATCH','POST_UNAVAILABLE') and resolved_at is null); end if;
  insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source) values(s.id,v_old,v_status,coalesce(p_reason_codes,'{}'),'provider'); return true;
end $$;

create or replace function public.operations_manual_verify_travel_moment(p_submission uuid,p_field text,p_decision text,p_reason text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype; v_old text; v_result jsonb; v_reason text; v_next text;
begin
 if not public.is_operations() then raise exception 'operations only' using errcode='42501'; end if;
 if p_field not in ('official_mention','campaign_hashtag','author') or p_decision not in ('confirmed','rejected') or length(trim(p_reason))<3 then raise exception 'invalid manual verification'; end if;
 select * into s from public.travel_moment_submissions where id=p_submission for update; if s.id is null then return false; end if; v_old:=s.status;
 insert into public.travel_moment_manual_verifications(submission_id,operator_id,field,decision,reason) values(p_submission,auth.uid(),p_field,p_decision,trim(p_reason));
 select external_result into v_result from public.travel_moment_check_runs where submission_id=s.id and provider<>'internal' order by completed_at desc nulls last,started_at desc limit 1;
 if s.internal_verdict='ineligible' then v_next:='ineligible';
 elsif p_decision='rejected' then v_reason:=case p_field when 'official_mention' then 'MISSING_OFFICIAL_MENTION' when 'campaign_hashtag' then 'MISSING_CAMPAIGN_HASHTAG' else 'ACCOUNT_MISMATCH' end; v_next:='needs_adjustment';
 elsif coalesce((v_result->>'public')::boolean,false) and (p_field='official_mention' or coalesce((v_result->>'officialMention')::boolean,false)) and (p_field='campaign_hashtag' or coalesce((v_result->>'campaignHashtag')::boolean,false)) and (p_field='author' or coalesce((v_result->>'authorMatches')::boolean,false)) then v_next:='eligible';
 else v_next:='pending_review'; end if;
 update public.travel_moment_submissions set status=v_next,external_verdict=case when v_next='eligible' then 'passed' when v_next='pending_review' then 'unknown' else 'needs_adjustment' end,reason_codes=case when v_reason is null then case when v_next='pending_review' then array['EXTERNAL_CHECK_UNAVAILABLE'] else '{}'::text[] end else array[v_reason] end,first_verified_at=case when v_next='eligible' then coalesce(first_verified_at,now()) else first_verified_at end,updated_at=now() where id=s.id;
 insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source,actor_id) values(s.id,v_old,v_next,case when v_reason is null then case when v_next='pending_review' then array['EXTERNAL_CHECK_UNAVAILABLE'] else '{}'::text[] end else array[v_reason] end,'manual',auth.uid()); return true;
end $$;

create or replace function public.tm_invalidate_refunded_order() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='refunded' and old.status is distinct from 'refunded' then
   update public.travel_moment_submissions set status='ineligible',internal_verdict='ineligible',reason_codes=array['ORDER_REFUNDED'],updated_at=now() where order_id=new.id and status<>'ineligible';
   insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source) select id,status,'ineligible',array['ORDER_REFUNDED'],'refund_hook' from public.travel_moment_submissions where order_id=new.id;
 end if; return new;
end $$;
create trigger travel_moment_refund_invalidation after update of status on public.orders for each row execute function public.tm_invalidate_refunded_order();

alter table public.travel_moment_submissions enable row level security;
alter table public.travel_moment_check_runs enable row level security;
alter table public.travel_moment_metric_snapshots enable row level security;
alter table public.travel_moment_flags enable row level security;
alter table public.travel_moment_eligibility_audits enable row level security;
alter table public.travel_moment_manual_verifications enable row level security;
revoke all on public.travel_moment_submissions,public.travel_moment_check_runs,public.travel_moment_metric_snapshots,public.travel_moment_flags,public.travel_moment_eligibility_audits,public.travel_moment_manual_verifications from public,anon,authenticated;
grant all on public.travel_moment_submissions,public.travel_moment_check_runs,public.travel_moment_metric_snapshots,public.travel_moment_flags,public.travel_moment_eligibility_audits,public.travel_moment_manual_verifications to service_role;
grant select on public.travel_moment_submissions,public.travel_moment_check_runs,public.travel_moment_metric_snapshots,public.travel_moment_eligibility_audits to authenticated;
create policy travel_moment_submissions_owner_or_ops on public.travel_moment_submissions for select to authenticated using(account_id=auth.uid() or public.is_operations());
create policy travel_moment_runs_owner_or_ops on public.travel_moment_check_runs for select to authenticated using(exists(select 1 from public.travel_moment_submissions s where s.id=submission_id and (s.account_id=auth.uid() or public.is_operations())));
create policy travel_moment_metrics_owner_or_ops on public.travel_moment_metric_snapshots for select to authenticated using(exists(select 1 from public.travel_moment_submissions s where s.id=submission_id and (s.account_id=auth.uid() or public.is_operations())));
create policy travel_moment_audits_owner_or_ops on public.travel_moment_eligibility_audits for select to authenticated using(exists(select 1 from public.travel_moment_submissions s where s.id=submission_id and (s.account_id=auth.uid() or public.is_operations())));
revoke all on function public.create_travel_moment_submission(uuid,text,text,text),public.request_travel_moment_recheck(uuid),public.update_own_travel_moment_submission(uuid,uuid,text),public.operations_recheck_travel_moment(uuid),public.record_travel_moment_provider_check(uuid,text,text,jsonb,text[],jsonb),public.operations_manual_verify_travel_moment(uuid,text,text,text) from public,anon;
revoke all on function public.get_own_travel_moment_trips() from public,anon;
grant execute on function public.create_travel_moment_submission(uuid,text,text,text),public.request_travel_moment_recheck(uuid),public.update_own_travel_moment_submission(uuid,uuid,text),public.get_own_travel_moment_trips() to authenticated,service_role;
grant execute on function public.record_travel_moment_provider_check(uuid,text,text,jsonb,text[],jsonb),public.operations_manual_verify_travel_moment(uuid,text,text,text) to authenticated,service_role;
grant execute on function public.operations_recheck_travel_moment(uuid) to authenticated,service_role;
commit;
