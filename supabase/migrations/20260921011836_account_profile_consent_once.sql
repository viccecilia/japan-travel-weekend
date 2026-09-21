-- Consent is required only for missing timestamps; existing acceptance is immutable.
create or replace function public.update_own_account_profile(
  p_display_name text,p_phone text,p_emergency_name text,p_emergency_phone text,
  p_accept_terms boolean,p_accept_privacy boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_account uuid:=auth.uid();
  v_terms timestamptz;
  v_privacy timestamptz;
begin
  if v_account is null then raise exception 'authentication required'; end if;
  if length(trim(coalesce(p_display_name,''))) not between 1 and 80
    or length(trim(coalesce(p_phone,''))) not between 5 and 40
    or length(trim(coalesce(p_emergency_name,''))) not between 1 and 80
    or length(trim(coalesce(p_emergency_phone,''))) not between 5 and 40
  then raise exception 'profile input invalid'; end if;
  -- Lock the stable parent even when this is the first profile write.
  perform 1 from public.profiles where id=v_account for update;
  if not found then raise exception 'account required'; end if;
  select accepted_terms_at,accepted_privacy_at into v_terms,v_privacy
    from public.account_private_profiles where account_id=v_account for update;
  if (v_terms is null and not coalesce(p_accept_terms,false))
    or (v_privacy is null and not coalesce(p_accept_privacy,false))
  then raise exception 'consent required'; end if;
  insert into public.account_private_profiles(account_id,display_name,phone,emergency_name,emergency_phone,accepted_terms_at,accepted_privacy_at)
  values(v_account,trim(p_display_name),trim(p_phone),trim(p_emergency_name),trim(p_emergency_phone),coalesce(v_terms,now()),coalesce(v_privacy,now()))
  on conflict(account_id) do update set
    display_name=excluded.display_name,phone=excluded.phone,emergency_name=excluded.emergency_name,
    emergency_phone=excluded.emergency_phone,
    accepted_terms_at=coalesce(public.account_private_profiles.accepted_terms_at,excluded.accepted_terms_at),
    accepted_privacy_at=coalesce(public.account_private_profiles.accepted_privacy_at,excluded.accepted_privacy_at),updated_at=now();
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
    values(v_account,'profile_updated','account_profile',v_account,
      jsonb_build_object('fields',array['display_name','phone','emergency_contact'],'consentRecorded',true));
end $$;
revoke all on function public.update_own_account_profile(text,text,text,text,boolean,boolean) from public,anon;
grant execute on function public.update_own_account_profile(text,text,text,text,boolean,boolean) to authenticated,service_role;
