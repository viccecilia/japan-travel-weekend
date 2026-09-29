begin;

-- A generation is a complete external-verification attempt. Historical provider
-- and manual records remain queryable, while the evaluator only reads the current
-- generation on the submission.
alter table public.travel_moment_submissions add column if not exists verification_generation integer not null default 1 check (verification_generation > 0);
alter table public.travel_moment_check_runs add column if not exists verification_generation integer not null default 1 check (verification_generation > 0);
alter table public.travel_moment_manual_verifications add column if not exists verification_generation integer not null default 1 check (verification_generation > 0);
create index if not exists travel_moment_runs_generation_idx on public.travel_moment_check_runs(submission_id,verification_generation,completed_at desc,started_at desc);
create index if not exists travel_moment_manual_generation_idx on public.travel_moment_manual_verifications(submission_id,verification_generation,field,created_at desc);
alter table public.travel_moment_manual_verifications drop constraint if exists travel_moment_manual_verifications_field_check;
alter table public.travel_moment_manual_verifications add constraint travel_moment_manual_verifications_field_check check(field in ('public','official_mention','campaign_hashtag','author'));

-- The initial submission always starts at generation 1 and exposes that context
-- to the API caller initiating the provider request.
create or replace function public.create_travel_moment_submission(p_order uuid,p_platform text,p_url text,p_social_account_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account uuid:=auth.uid(); v_url text:=public.tm_canonical_url(p_url); v_detected text; v_reason text; v_existing uuid; v_submission public.travel_moment_submissions%rowtype; v_trip uuid;
begin
  if v_account is null then raise exception 'authentication required' using errcode='42501'; end if;
  if v_url !~ '^https://[^/]+/' then v_reason:='INVALID_URL';
  elsif v_url ~ '(^https://(?:www\\.|vm\\.)?tiktok\\.com/)' then v_detected:='tiktok';
  elsif v_url ~ '^https://(?:www\\.)?instagram\\.com/' then v_detected:='instagram'; else v_reason:='UNSUPPORTED_PLATFORM'; end if;
  if v_reason is null and (p_platform<>v_detected or (v_detected='instagram' and v_url !~ 'instagram\\.com/(p|reel|reels)/[^/]+') or (v_detected='tiktok' and v_url !~ 'tiktok\\.com/(?:@[^/]+/video/[0-9]+|[^/]+)')) then v_reason:='PROFILE_URL_NOT_POST'; end if;
  select id into v_existing from public.travel_moment_submissions where platform=coalesce(v_detected,p_platform) and canonical_url=v_url;
  if v_existing is not null then return jsonb_build_object('submission_id',v_existing,'duplicate',true,'reason_code','DUPLICATE_CONTENT'); end if;
  v_reason:=coalesce(v_reason,public.tm_internal_reason(v_account,p_order));
  select d.trip_id into v_trip from public.orders o join public.departures d on d.id=o.departure_id where o.id=p_order;
  insert into public.travel_moment_submissions(submission_number,account_id,requested_order_id,order_id,trip_id,platform,post_url,canonical_url,canonical_content_id,social_account_name,status,internal_verdict,reason_codes,is_test_order,verification_generation)
  values('',v_account,p_order,case when v_trip is null then null else p_order end,v_trip,coalesce(v_detected,p_platform),trim(p_url),v_url,public.tm_content_id(coalesce(v_detected,p_platform),v_url),trim(p_social_account_name),case when v_reason is null then 'checking' else 'ineligible' end,case when v_reason is null then 'eligible' else 'ineligible' end,case when v_reason is null then '{}'::text[] else array[v_reason] end,coalesce((select is_test_order from public.orders where id=p_order),false),1) returning * into v_submission;
  insert into public.travel_moment_check_runs(submission_id,triggered_by,trigger,provider,status,internal_result,reason_codes,completed_at,verification_generation) values(v_submission.id,v_account,'initial_submit','internal','completed',jsonb_build_object('verdict',v_submission.internal_verdict),v_submission.reason_codes,now(),1);
  insert into public.travel_moment_eligibility_audits(submission_id,new_status,reason_codes,source,actor_id) values(v_submission.id,v_submission.status,v_submission.reason_codes,'internal',v_account);
  return jsonb_build_object('submission_id',v_submission.id,'submission_number',v_submission.submission_number,'duplicate',false,'status',v_submission.status,'reason_codes',v_submission.reason_codes,'verification_generation',1);
end $$;

create or replace function public.tm_evaluate_external(p_submission uuid,p_actor uuid default null) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype; r jsonb; f text; provider_value boolean; manual_value text; effective text; rejected_reason text; next_status text; has_unknown boolean:=false; old_status text;
begin
 select * into s from public.travel_moment_submissions where id=p_submission for update; if s.id is null then return null; end if; old_status:=s.status;
 if s.internal_verdict='ineligible' then next_status:='ineligible';
 else
  select external_result into r from public.travel_moment_check_runs where submission_id=s.id and verification_generation=s.verification_generation and provider not in ('internal','pending') order by completed_at desc nulls last,started_at desc,id desc limit 1;
  foreach f in array array['public','official_mention','campaign_hashtag','author'] loop
   provider_value:=case f when 'public' then nullif(r->>'public','')::boolean when 'official_mention' then nullif(r->>'officialMention','')::boolean when 'campaign_hashtag' then nullif(r->>'campaignHashtag','')::boolean else nullif(r->>'authorMatches','')::boolean end;
   select decision into manual_value from public.travel_moment_manual_verifications where submission_id=s.id and verification_generation=s.verification_generation and field=f order by created_at desc,id desc limit 1;
   effective:=coalesce(manual_value,case when provider_value is true then 'confirmed' when provider_value is false then 'rejected' else 'unknown' end);
   if effective='rejected' then rejected_reason:=case f when 'official_mention' then 'MISSING_OFFICIAL_MENTION' when 'campaign_hashtag' then 'MISSING_CAMPAIGN_HASHTAG' when 'author' then 'ACCOUNT_MISMATCH' else 'POST_UNAVAILABLE' end; exit; end if;
   has_unknown:=has_unknown or effective='unknown';
  end loop;
  if rejected_reason is not null then next_status:='needs_adjustment'; elsif has_unknown then next_status:='pending_review'; else next_status:='eligible'; end if;
 end if;
 update public.travel_moment_submissions set status=next_status,external_verdict=case when next_status='eligible' then 'passed' when next_status='needs_adjustment' then 'needs_adjustment' else 'unknown' end,reason_codes=case when next_status='ineligible' then s.reason_codes when rejected_reason is not null then array[rejected_reason] when next_status='pending_review' then array['EXTERNAL_CHECK_UNAVAILABLE'] else '{}'::text[] end,updated_at=now(),first_verified_at=case when next_status='eligible' then coalesce(first_verified_at,now()) else first_verified_at end where id=s.id;
 insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source,actor_id) values(s.id,old_status,next_status,case when next_status='ineligible' then s.reason_codes when rejected_reason is not null then array[rejected_reason] when next_status='pending_review' then array['EXTERNAL_CHECK_UNAVAILABLE'] else '{}'::text[] end,'manual',p_actor);
 return next_status;
end $$;

-- Rechecks create context first, returning it to the requester before provider I/O.
drop function if exists public.request_travel_moment_recheck(uuid);
create function public.request_travel_moment_recheck(p_submission uuid) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype; v_generation integer;
begin
 select * into s from public.travel_moment_submissions where id=p_submission and account_id=auth.uid() for update;
 if s.id is null then raise exception 'submission not found' using errcode='42501'; end if;
 if s.status not in ('needs_adjustment','pending_review','unavailable') then raise exception 'submission cannot be rechecked'; end if;
 if s.last_user_recheck_at is not null and s.last_user_recheck_at>now()-interval '6 hours' then raise exception 'recheck rate limited'; end if;
 v_generation:=s.verification_generation+1;
 update public.travel_moment_submissions set verification_generation=v_generation,status=case when internal_verdict='ineligible' then 'ineligible' else 'checking' end,last_user_recheck_at=now(),updated_at=now() where id=s.id;
 insert into public.travel_moment_check_runs(submission_id,triggered_by,trigger,provider,status,verification_generation) values(s.id,auth.uid(),'user_recheck','pending','started',v_generation);
 insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source,actor_id) values(s.id,s.status,case when s.internal_verdict='ineligible' then 'ineligible' else 'checking' end,s.reason_codes,'internal',auth.uid());
 return v_generation;
end $$;

drop function if exists public.operations_recheck_travel_moment(uuid);
create function public.operations_recheck_travel_moment(p_submission uuid) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype; v_generation integer;
begin
 if not public.is_operations() then raise exception 'operations only' using errcode='42501'; end if;
 select * into s from public.travel_moment_submissions where id=p_submission for update; if s.id is null then return null; end if;
 v_generation:=s.verification_generation+1;
 update public.travel_moment_submissions set verification_generation=v_generation,status=case when internal_verdict='ineligible' then 'ineligible' else 'checking' end,updated_at=now() where id=s.id;
 insert into public.travel_moment_check_runs(submission_id,triggered_by,trigger,provider,status,verification_generation) values(s.id,auth.uid(),'admin_recheck','pending','started',v_generation);
 insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source,actor_id) values(s.id,s.status,case when s.internal_verdict='ineligible' then 'ineligible' else 'checking' end,s.reason_codes,'admin',auth.uid()); return v_generation;
end $$;

-- Stale results are stored as history only; they never call the evaluator.
drop function if exists public.record_travel_moment_provider_check(uuid,text,text,jsonb,text[],jsonb);
create function public.record_travel_moment_provider_check(p_submission uuid,p_trigger text,p_provider text,p_result jsonb,p_reason_codes text[],p_metrics jsonb,p_expected_generation integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype; v_is_current boolean;
begin
 if current_user not in ('service_role','postgres') and not public.is_operations() then raise exception 'trusted service only' using errcode='42501'; end if;
 if p_trigger not in ('initial_submit','user_recheck','admin_recheck') or p_expected_generation is null or p_expected_generation<1 then raise exception 'invalid provider context'; end if;
 select * into s from public.travel_moment_submissions where id=p_submission for update; if s.id is null then return false; end if;
 v_is_current:=s.verification_generation=p_expected_generation;
 insert into public.travel_moment_check_runs(submission_id,trigger,provider,status,external_result,reason_codes,completed_at,verification_generation) values(s.id,p_trigger,p_provider,case when 'EXTERNAL_CHECK_UNAVAILABLE'=any(coalesce(p_reason_codes,'{}')) then 'unavailable' else 'completed' end,coalesce(p_result,'{}'),coalesce(p_reason_codes,'{}'),now(),p_expected_generation);
 if not v_is_current then return true; end if;
 update public.travel_moment_submissions set published_at=coalesce(nullif(p_result->>'publishedAt','')::timestamptz,published_at),last_checked_at=now(),updated_at=now() where id=s.id;
 if p_metrics is not null then insert into public.travel_moment_metric_snapshots(submission_id,provider,views,likes,comments,shares,saves,raw_coverage) values(s.id,p_provider,nullif(p_metrics->>'views','')::bigint,nullif(p_metrics->>'likes','')::bigint,nullif(p_metrics->>'comments','')::bigint,nullif(p_metrics->>'shares','')::bigint,nullif(p_metrics->>'saves','')::bigint,coalesce(p_metrics->'coverage','{}')); end if;
 if 'ACCOUNT_MISMATCH'=any(coalesce(p_reason_codes,'{}')) or 'POST_UNAVAILABLE'=any(coalesce(p_reason_codes,'{}')) then insert into public.travel_moment_flags(submission_id,code) select s.id,case when 'ACCOUNT_MISMATCH'=any(coalesce(p_reason_codes,'{}')) then 'ACCOUNT_MISMATCH' else 'POST_UNAVAILABLE' end where not exists(select 1 from public.travel_moment_flags where submission_id=s.id and code in ('ACCOUNT_MISMATCH','POST_UNAVAILABLE') and resolved_at is null); end if;
 perform public.tm_evaluate_external(s.id,null); return true;
end $$;

create or replace function public.operations_manual_verify_travel_moment(p_submission uuid,p_field text,p_decision text,p_reason text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype;
begin
 if not public.is_operations() then raise exception 'operations only' using errcode='42501'; end if;
 if p_field not in ('public','official_mention','campaign_hashtag','author') or p_decision not in ('confirmed','rejected') or length(trim(p_reason))<3 then raise exception 'invalid manual verification'; end if;
 select * into s from public.travel_moment_submissions where id=p_submission for update; if s.id is null then return false; end if;
 insert into public.travel_moment_manual_verifications(submission_id,operator_id,field,decision,reason,verification_generation) values(s.id,auth.uid(),p_field,p_decision,trim(p_reason),s.verification_generation);
 perform public.tm_evaluate_external(s.id,auth.uid()); return true;
end $$;

create or replace function public.operations_confirm_all_travel_moment_external(p_submission uuid,p_reason text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype; r jsonb; f text; provider_value boolean; manual_value text;
begin
 if not public.is_operations() then raise exception 'operations only' using errcode='42501'; end if;
 if length(trim(p_reason))<3 then raise exception 'invalid manual verification'; end if;
 select * into s from public.travel_moment_submissions where id=p_submission for update; if s.id is null then return false; end if;
 select external_result into r from public.travel_moment_check_runs where submission_id=s.id and verification_generation=s.verification_generation and provider not in ('internal','pending') order by completed_at desc nulls last,started_at desc,id desc limit 1;
 foreach f in array array['public','official_mention','campaign_hashtag','author'] loop
   provider_value:=case f when 'public' then nullif(r->>'public','')::boolean when 'official_mention' then nullif(r->>'officialMention','')::boolean when 'campaign_hashtag' then nullif(r->>'campaignHashtag','')::boolean else nullif(r->>'authorMatches','')::boolean end;
   select decision into manual_value from public.travel_moment_manual_verifications where submission_id=s.id and verification_generation=s.verification_generation and field=f order by created_at desc,id desc limit 1;
   if coalesce(manual_value,case when provider_value is true then 'confirmed' when provider_value is false then 'rejected' else 'unknown' end)='unknown' then insert into public.travel_moment_manual_verifications(submission_id,operator_id,field,decision,reason,verification_generation) values(s.id,auth.uid(),f,'confirmed',trim(p_reason),s.verification_generation); end if;
 end loop;
 perform public.tm_evaluate_external(s.id,auth.uid()); return true;
end $$;

revoke all on function public.tm_evaluate_external(uuid,uuid),public.request_travel_moment_recheck(uuid),public.operations_recheck_travel_moment(uuid),public.record_travel_moment_provider_check(uuid,text,text,jsonb,text[],jsonb,integer),public.operations_manual_verify_travel_moment(uuid,text,text,text),public.operations_confirm_all_travel_moment_external(uuid,text) from public,anon;
grant execute on function public.request_travel_moment_recheck(uuid),public.operations_recheck_travel_moment(uuid),public.operations_manual_verify_travel_moment(uuid,text,text,text),public.operations_confirm_all_travel_moment_external(uuid,text) to authenticated,service_role;
grant execute on function public.record_travel_moment_provider_check(uuid,text,text,jsonb,text[],jsonb,integer) to service_role;
commit;
