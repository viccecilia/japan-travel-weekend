-- Fix the trusted verifier after 007 was installed. Supabase keeps pgcrypto in the extensions schema,
-- while the security-definer function deliberately uses a restricted search_path.
begin;

create or replace function public.verify_boarding_credential(
  p_token_digest bytea,p_scanner_account uuid,p_vehicle_group uuid,p_idempotency_key text,p_now timestamptz default now()
) returns table(result text,boarding_id uuid,verified_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_fingerprint bytea;
  v_prior public.boarding_verification_attempts%rowtype;
  v_credential public.boarding_credentials%rowtype;
  v_result text;
  v_boarding_id uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if octet_length(p_token_digest)<>32 or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid verification request'; end if;
  if not exists(select 1 from public.profiles as p where p.id=p_scanner_account and p.role='operations')
     and not exists(select 1 from public.staff_assignments as sa where sa.staff_id=p_scanner_account and sa.vehicle_group_id=p_vehicle_group and sa.role in ('driver','guide'))
  then raise exception 'scanner not authorized for vehicle group'; end if;
  v_fingerprint:=extensions.digest(encode(p_token_digest,'hex')||':'||p_scanner_account::text||':'||p_vehicle_group::text,'sha256');
  perform pg_advisory_xact_lock(hashtextextended(p_scanner_account::text||':'||p_idempotency_key,0));
  select a.* into v_prior from public.boarding_verification_attempts as a
  where a.scanner_account_id=p_scanner_account and a.idempotency_key=p_idempotency_key for update;
  if found then
    if v_prior.request_fingerprint_digest<>v_fingerprint then raise exception 'idempotency parameter mismatch'; end if;
    return query select v_prior.result,v_prior.boarding_id,v_prior.verified_at; return;
  end if;
  select bc.* into v_credential from public.boarding_credentials as bc where bc.token_digest=p_token_digest for update;
  if not found then v_result:='revoked';v_boarding_id:=null;
  elsif v_credential.vehicle_group_id<>p_vehicle_group then v_result:='wrong-vehicle';v_boarding_id:=v_credential.boarding_id;
  elsif v_credential.revoked_at is not null then v_result:='revoked';v_boarding_id:=v_credential.boarding_id;
  elsif v_credential.expires_at<=p_now then v_result:='expired';v_boarding_id:=v_credential.boarding_id;
  elsif v_credential.used_at is not null then v_result:='used';v_boarding_id:=v_credential.boarding_id;
  else
    v_result:='valid';v_boarding_id:=v_credential.boarding_id;
    update public.boarding_credentials as bc set used_at=p_now where bc.id=v_credential.id and bc.used_at is null;
    update public.boardings as b set status='boarded',boarded_at=coalesce(b.boarded_at,p_now),updated_at=p_now where b.id=v_boarding_id and b.status='issued';
  end if;
  insert into public.boarding_verification_attempts as a(scanner_account_id,idempotency_key,request_fingerprint_digest,credential_id,requested_vehicle_group_id,result,boarding_id,verified_at)
  values(p_scanner_account,p_idempotency_key,v_fingerprint,v_credential.id,p_vehicle_group,v_result,v_boarding_id,p_now);
  return query select v_result,v_boarding_id,p_now;
end $$;

revoke all on function public.verify_boarding_credential(bytea,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.verify_boarding_credential(bytea,uuid,uuid,text,timestamptz) to service_role;

commit;
