begin;

create function public.purge_expired_ephemeral_data(p_now timestamptz default now())
returns table(data_kind text,deleted integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_attempts integer;v_credentials integer;v_driver_locations integer;v_passenger_locations integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_now is null or p_now>now()+interval '5 minutes' or p_now<now()-interval '5 minutes' then raise exception 'invalid scheduler time'; end if;
  delete from public.boarding_verification_attempts where retain_until<=p_now;get diagnostics v_attempts=row_count;
  delete from public.boarding_credentials where expires_at<=p_now;get diagnostics v_credentials=row_count;
  delete from public.driver_location_sessions where expires_at<=p_now;get diagnostics v_driver_locations=row_count;
  delete from public.location_shares where expires_at<=p_now;get diagnostics v_passenger_locations=row_count;
  return query values('boarding_verification_attempts',v_attempts),('boarding_credentials',v_credentials),('driver_location_sessions',v_driver_locations),('location_shares',v_passenger_locations);
end$$;

revoke all on function public.purge_expired_ephemeral_data(timestamptz) from public,anon,authenticated;
grant execute on function public.purge_expired_ephemeral_data(timestamptz) to service_role;

commit;
