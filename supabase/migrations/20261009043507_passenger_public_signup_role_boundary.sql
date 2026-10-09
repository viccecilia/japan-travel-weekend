begin;

-- Public Auth metadata is user-controlled. Public signup therefore always
-- creates a passenger and never opens a staff application. Existing staff
-- applications and operations-only review/provisioning functions are retained.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  applicant text:=trim(coalesce(new.raw_user_meta_data->>'display_name',''));
  referral text:=coalesce(new.raw_user_meta_data->>'referral_code','');
begin
  insert into public.profiles(id,display_name,role)
  values(new.id,applicant,'passenger');
  perform public.ensure_referral_code(new.id);
  perform public.apply_referral_registration(new.id,referral);
  return new;
end$$;

commit;
