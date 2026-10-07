-- A browser retry is also the deterministic expiry sweep for its own stale
-- payment hold. This does not create a replacement order or reserve seats.
create or replace function public.expire_stale_resumable_payment(p_account uuid,p_order uuid)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_hold public.inventory_locks%rowtype;
begin
  -- Keep the same lock order as payment-event handling: hold, then order.
  select * into v_hold from public.inventory_locks where order_id=p_order for update;
  select * into v_order from public.orders where id=p_order and account_id=p_account for update;

  if v_order.id is null or v_hold.id is null
     or v_order.status <> 'pending_payment'
     or v_hold.status <> 'held'
     or v_hold.expires_at > now()
  then
    return false;
  end if;

  update public.inventory_locks set status='expired' where id=v_hold.id and status='held';
  update public.orders set status='expired',updated_at=now()
  where id=v_order.id and account_id=p_account and status='pending_payment';
  return true;
end;
$$;
revoke all on function public.expire_stale_resumable_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.expire_stale_resumable_payment(uuid,uuid) to service_role;
