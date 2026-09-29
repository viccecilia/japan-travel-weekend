begin;
create or replace function public.update_own_travel_moment_submission(p_submission uuid,p_order uuid,p_social_account_name text,p_url text default null) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.travel_moment_submissions%rowtype;v_reason text;v_trip uuid;v_url text;v_content text;v_platform text;
begin
 select * into s from public.travel_moment_submissions where id=p_submission and account_id=auth.uid() for update;if s.id is null then raise exception 'submission not found' using errcode='42501';end if;if s.status not in ('needs_adjustment','pending_review','unavailable') then raise exception 'submission cannot be edited';end if;if length(trim(p_social_account_name)) not between 2 and 120 then raise exception 'invalid social account';end if;
 v_url:=coalesce(public.tm_canonical_url(p_url),s.canonical_url);v_platform:=s.platform;if p_url is not null then
   if v_url !~ '^https://[^/]+/' then raise exception 'INVALID_URL';end if;
   if v_url ~ '^https://(?:www[.])?instagram[.]com/(p|reel|reels)/[^/]+' then v_platform:='instagram';elsif v_url ~ '^https://(?:www[.]|vm[.])?tiktok[.]com/(?:@[^/]+/video/[0-9]+|[^/]+)' then v_platform:='tiktok';else raise exception 'PROFILE_URL_NOT_POST';end if;
   v_content:=public.tm_content_id(v_platform,v_url);if exists(select 1 from public.travel_moment_submissions x where x.id<>s.id and x.platform=v_platform and (x.canonical_url=v_url or (v_content is not null and x.canonical_content_id=v_content))) then raise exception 'DUPLICATE_CONTENT';end if;
 end if;
 v_reason:=public.tm_internal_reason(auth.uid(),p_order);select d.trip_id into v_trip from public.orders o join public.departures d on d.id=o.departure_id where o.id=p_order;
 update public.travel_moment_submissions set requested_order_id=p_order,order_id=case when v_trip is null then null else p_order end,trip_id=v_trip,social_account_name=trim(p_social_account_name),post_url=coalesce(nullif(trim(p_url),''),post_url),canonical_url=v_url,platform=v_platform,canonical_content_id=coalesce(v_content,canonical_content_id),internal_verdict=case when v_reason is null then 'eligible' else 'ineligible' end,status=case when v_reason is null then 'pending_review' else 'ineligible' end,reason_codes=case when v_reason is null then '{}'::text[] else array[v_reason] end,updated_at=now() where id=s.id;
 insert into public.travel_moment_eligibility_audits(submission_id,old_status,new_status,reason_codes,source,actor_id) values(s.id,s.status,case when v_reason is null then 'pending_review' else 'ineligible' end,case when v_reason is null then '{}'::text[] else array[v_reason] end,'internal',auth.uid());return true;
end $$;
revoke all on function public.update_own_travel_moment_submission(uuid,uuid,text,text) from public,anon;
grant execute on function public.update_own_travel_moment_submission(uuid,uuid,text,text) to authenticated,service_role;
commit;
