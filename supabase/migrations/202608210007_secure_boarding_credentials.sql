begin;

create table public.boarding_credentials (
  id uuid primary key default gen_random_uuid(),
  boarding_id uuid not null unique references public.boardings(id) on delete cascade,
  vehicle_group_id uuid not null references public.vehicle_groups(id),
  token_digest bytea not null unique check(octet_length(token_digest)=32),
  token_version smallint not null default 1 check(token_version>0),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check(expires_at>created_at),
  check(used_at is null or used_at>=created_at),
  check(revoked_at is null or revoked_at>=created_at)
);
create index boarding_credentials_group_active_idx on public.boarding_credentials(vehicle_group_id,expires_at) where used_at is null and revoked_at is null;

create table public.boarding_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  scanner_account_id uuid not null references public.profiles(id),
  idempotency_key text not null check(length(idempotency_key) between 8 and 200),
  request_fingerprint_digest bytea not null check(octet_length(request_fingerprint_digest)=32),
  credential_id uuid references public.boarding_credentials(id) on delete set null,
  requested_vehicle_group_id uuid not null references public.vehicle_groups(id),
  result text not null check(result in ('valid','used','expired','revoked','wrong-vehicle')),
  boarding_id uuid references public.boardings(id) on delete set null,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  retain_until timestamptz not null default (now()+interval '90 days'),
  unique(scanner_account_id,idempotency_key),
  check(retain_until>created_at)
);
create index boarding_attempts_retention_idx on public.boarding_verification_attempts(retain_until);
create index boarding_attempts_boarding_idx on public.boarding_verification_attempts(boarding_id,created_at desc);

alter table public.boarding_credentials enable row level security;
alter table public.boarding_verification_attempts enable row level security;
revoke all on public.boarding_credentials,public.boarding_verification_attempts from public,anon,authenticated;
grant all on public.boarding_credentials,public.boarding_verification_attempts to service_role;

create or replace view public.boarding_status_for_passenger with (security_invoker=true,security_barrier=true) as
select b.id as boarding_id,b.status,b.boarded_at,b.updated_at
from public.boardings as b
join public.orders as o on o.id=b.order_id
where o.account_id=auth.uid();
revoke all on public.boarding_status_for_passenger from public,anon;
grant select on public.boarding_status_for_passenger to authenticated;
revoke select on public.boardings from authenticated;
grant select(id,order_id,status,boarded_at,updated_at) on public.boardings to authenticated;

create or replace function public.issue_boarding_credential(
  p_boarding uuid,p_vehicle_group uuid,p_token_digest bytea,p_token_version smallint,p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_credential_id uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if octet_length(p_token_digest)<>32 or p_token_version<=0 or p_expires_at<=now() then raise exception 'invalid boarding credential'; end if;
  if not exists(
    select 1 from public.boardings as b
    join public.vehicle_group_orders as vgo on vgo.order_id=b.order_id
    where b.id=p_boarding and vgo.vehicle_group_id=p_vehicle_group
  ) then raise exception 'boarding vehicle group mismatch'; end if;
  insert into public.boarding_credentials as bc(boarding_id,vehicle_group_id,token_digest,token_version,expires_at)
  values(p_boarding,p_vehicle_group,p_token_digest,p_token_version,p_expires_at)
  returning bc.id into v_credential_id;
  update public.boardings as b set status='issued',updated_at=now() where b.id=p_boarding and b.status='not_issued';
  return v_credential_id;
end $$;

create or replace function public.revoke_boarding_credential(p_token_digest bytea,p_revoked_at timestamptz default now())
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_boarding_id uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if octet_length(p_token_digest)<>32 then raise exception 'invalid token digest'; end if;
  update public.boarding_credentials as bc set revoked_at=coalesce(bc.revoked_at,p_revoked_at)
  where bc.token_digest=p_token_digest and bc.used_at is null returning bc.boarding_id into v_boarding_id;
  if v_boarding_id is null then return false; end if;
  update public.boardings as b set status='revoked',updated_at=p_revoked_at where b.id=v_boarding_id and b.status<>'boarded';
  return true;
end $$;

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
  v_fingerprint:=digest(encode(p_token_digest,'hex')||':'||p_scanner_account::text||':'||p_vehicle_group::text,'sha256');
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

revoke all on function public.issue_boarding_credential(uuid,uuid,bytea,smallint,timestamptz),public.revoke_boarding_credential(bytea,timestamptz),public.verify_boarding_credential(bytea,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.issue_boarding_credential(uuid,uuid,bytea,smallint,timestamptz),public.revoke_boarding_credential(bytea,timestamptz),public.verify_boarding_credential(bytea,uuid,uuid,text,timestamptz) to service_role;

commit;
