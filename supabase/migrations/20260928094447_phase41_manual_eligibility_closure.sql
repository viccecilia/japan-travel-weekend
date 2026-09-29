begin;
create or replace function public.operations_manual_verify_travel_moment(p_submission uuid,p_field text,p_decision text,p_reason text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype; v_old text; v_result jsonb; v_reason text; v_next text;
begin
 if not public.is_operations() then raise exception 'operations only' using errcode='42501'; end if;
 if p_field not in ('official_mention','campaign_hashtag','author') or p_decision not in ('confirmed','rejected') or length(trim(p_reason))<3 then raise exception 'invalid manual verification'; end if;
 select * into s from public.travel_moment_submissions where id=p_submission for update; if s.id is null then return false; end if; v_old:=s.status;
 insert into public.travel_moment_manual_verifications(submission_id,operator_id,field,decision,reason) values(p_submission,auth.uid(),p_field,p_decision,trim(p_reason));
 select external_result into v_result from public.travel_moment_check_runs where submission_id=s.id and provider<>'internal' order by completed_at desc nulls last,started_at desc limit 1;
 if s.internal_verdict='ineligible' then v_next:='ineligible';
 elsif p_decision='rejected' then v_reason:=case p_field when 'official_mention' then 'MISSING_OFFICIAL_MENTION' when 'campaign_hashtag' then 'MISSING_CAMPAIGN_HASHTAG' else 'ACCOUNT_MISMATCH' end;v_next:='needs_adjustment';
 elsif coalesce((v_result->>'public')::boolean,false) and (p_field='official_mention' or coalesce((v_result->>'officialMention')::boolean,false)) and (p_field='campaign_hashtag' or coalesce((v_result->>'campaignHashtag')::boolean,false)) and (p_field='author' or coalesce((v_result->>'authorMatches')::boolean,false)) then v_next:='eligible'; else v_next:='pending_review'; end if;
 update public.travel_moment_submissions set status=v_next,external_verdict=case when v_next='eligible' then 'passed' when v_next='pending_review' then 'unknown' else 'needs_adjustment' end,reason_codes=case when v_reason is null then case when v_next='pending_review' then array['EXTERNAL_CHECK_UNAVAILABLE'] else '{}'::text[] end else array[v_reason] end,first_verified_at=case when v_next='eligible' then coalesce(first_verified_at,now()) else first_verified_at end,updated_at=now() where id=s.id;
 insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source,actor_id) values(s.id,v_old,v_next,case when v_reason is null then case when v_next='pending_review' then array['EXTERNAL_CHECK_UNAVAILABLE'] else '{}'::text[] end else array[v_reason] end,'manual',auth.uid());return true;
end $$;
create or replace function public.operations_recheck_travel_moment(p_submission uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype;
begin if not public.is_operations() then raise exception 'operations only' using errcode='42501'; end if;select * into s from public.travel_moment_submissions where id=p_submission for update;if s.id is null then return false;end if;update public.travel_moment_submissions set status=case when internal_verdict='ineligible' then 'ineligible' else 'checking' end,updated_at=now() where id=s.id;insert into public.travel_moment_check_runs(submission_id,triggered_by,trigger,provider,status) values(s.id,auth.uid(),'admin_recheck','pending','started');insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source,actor_id) values(s.id,s.status,case when s.internal_verdict='ineligible' then 'ineligible' else 'checking' end,s.reason_codes,'admin',auth.uid());return true;end $$;
revoke all on function public.operations_manual_verify_travel_moment(uuid,text,text,text),public.operations_recheck_travel_moment(uuid) from public,anon;
grant execute on function public.operations_manual_verify_travel_moment(uuid,text,text,text),public.operations_recheck_travel_moment(uuid) to authenticated,service_role;
commit;
