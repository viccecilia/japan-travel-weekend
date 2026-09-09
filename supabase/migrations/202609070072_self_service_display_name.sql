begin;

create or replace function public.update_own_profile(p_display_name text)
returns public.profiles
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_account uuid:=auth.uid();
  v_name text:=trim(coalesce(p_display_name,''));
  result public.profiles;
begin
  if v_account is null then raise exception 'authentication required'; end if;
  if length(v_name) not between 1 and 80 then raise exception 'display name invalid'; end if;
  update public.profiles set display_name=v_name,updated_at=now() where id=v_account returning * into result;
  update public.driver_resources set display_name=v_name,updated_at=now() where account_id=v_account;
  insert into public.account_private_profiles(account_id,display_name)
  values(v_account,v_name)
  on conflict(account_id) do update set display_name=excluded.display_name,updated_at=now();
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(v_account,'profile_updated','account_profile',v_account,jsonb_build_object('fields',array['display_name']));
  return result;
end $$;

revoke all on function public.update_own_profile(text) from public,anon;
grant execute on function public.update_own_profile(text) to authenticated,service_role;

commit;
