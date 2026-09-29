begin;

-- Canonical content identity is the business duplicate key.  Query it before
-- insertion so equivalent share/tracking URLs return a user-safe result rather
-- than leaking the backing unique-index error.
create or replace function public.create_travel_moment_submission(p_order uuid,p_platform text,p_url text,p_social_account_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account uuid:=auth.uid(); v_url text:=public.tm_canonical_url(p_url); v_detected text; v_reason text; v_existing uuid; v_submission public.travel_moment_submissions%rowtype; v_trip uuid; v_content text;
begin
  if v_account is null then raise exception 'authentication required' using errcode='42501'; end if;
  if v_url !~ '^https://[^/]+/' then v_reason:='INVALID_URL';
  elsif v_url ~ '(^https://(?:www\\.|vm\\.)?tiktok\\.com/)' then v_detected:='tiktok';
  elsif v_url ~ '^https://(?:www\\.)?instagram\\.com/' then v_detected:='instagram'; else v_reason:='UNSUPPORTED_PLATFORM'; end if;
  if v_reason is null and (p_platform<>v_detected or (v_detected='instagram' and v_url !~ 'instagram\\.com/(p|reel|reels)/[^/]+') or (v_detected='tiktok' and v_url !~ 'tiktok\\.com/(?:@[^/]+/video/[0-9]+|[^/]+)')) then v_reason:='PROFILE_URL_NOT_POST'; end if;
  v_content:=public.tm_content_id(coalesce(v_detected,p_platform),v_url);
  select id into v_existing from public.travel_moment_submissions where platform=coalesce(v_detected,p_platform) and (canonical_url=v_url or (v_content is not null and canonical_content_id=v_content));
  if v_existing is not null then return jsonb_build_object('submission_id',v_existing,'duplicate',true,'reason_code','DUPLICATE_CONTENT'); end if;
  v_reason:=coalesce(v_reason,public.tm_internal_reason(v_account,p_order));
  select d.trip_id into v_trip from public.orders o join public.departures d on d.id=o.departure_id where o.id=p_order;
  insert into public.travel_moment_submissions(submission_number,account_id,requested_order_id,order_id,trip_id,platform,post_url,canonical_url,canonical_content_id,social_account_name,status,internal_verdict,reason_codes,is_test_order,verification_generation)
  values('',v_account,p_order,case when v_trip is null then null else p_order end,v_trip,coalesce(v_detected,p_platform),trim(p_url),v_url,v_content,trim(p_social_account_name),case when v_reason is null then 'checking' else 'ineligible' end,case when v_reason is null then 'eligible' else 'ineligible' end,case when v_reason is null then '{}'::text[] else array[v_reason] end,coalesce((select is_test_order from public.orders where id=p_order),false),1) returning * into v_submission;
  insert into public.travel_moment_check_runs(submission_id,triggered_by,trigger,provider,status,internal_result,reason_codes,completed_at,verification_generation) values(v_submission.id,v_account,'initial_submit','internal','completed',jsonb_build_object('verdict',v_submission.internal_verdict),v_submission.reason_codes,now(),1);
  insert into public.travel_moment_eligibility_audits(submission_id,new_status,reason_codes,source,actor_id) values(v_submission.id,v_submission.status,v_submission.reason_codes,'internal',v_account);
  return jsonb_build_object('submission_id',v_submission.id,'submission_number',v_submission.submission_number,'duplicate',false,'status',v_submission.status,'reason_codes',v_submission.reason_codes,'verification_generation',1);
end $$;

revoke all on function public.create_travel_moment_submission(uuid,text,text,text) from public,anon;
grant execute on function public.create_travel_moment_submission(uuid,text,text,text) to authenticated,service_role;

commit;
