begin;
create or replace function public.issue_owner_boarding_credential(p_order uuid,p_account uuid,p_token_digest bytea,p_expires_at timestamptz)
returns table(boarding_id uuid,vehicle_group_id uuid,credential_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare b_id uuid;g_id uuid;c_id uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if octet_length(p_token_digest)<>32 or p_expires_at<=now() then raise exception 'invalid boarding credential'; end if;
  select b.id,vg.id into b_id,g_id from public.orders o join public.boardings b on b.order_id=o.id
    join public.vehicle_group_orders vgo on vgo.order_id=o.id join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id
    join public.trip_rooms r on r.vehicle_group_id=vg.id
    where o.id=p_order and o.account_id=p_account and o.status in ('paid','confirmed') and r.status='open' for update of b;
  if b_id is null then raise exception 'boarding credential unavailable'; end if;
  update public.boarding_credentials as bc set revoked_at=coalesce(bc.revoked_at,now()) where bc.boarding_id=b_id and bc.used_at is null and bc.revoked_at is null;
  insert into public.boarding_credentials as bc(boarding_id,vehicle_group_id,token_digest,token_version,expires_at)
    values(b_id,g_id,p_token_digest,1,p_expires_at) returning bc.id into c_id;
  update public.boardings as brd set status='issued',updated_at=now() where brd.id=b_id and brd.status in ('not_issued','revoked');
  return query select b_id,g_id,c_id;
end$$;
revoke all on function public.issue_owner_boarding_credential(uuid,uuid,bytea,timestamptz) from public,anon,authenticated;
grant execute on function public.issue_owner_boarding_credential(uuid,uuid,bytea,timestamptz) to service_role;
commit;
