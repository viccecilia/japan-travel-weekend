begin;

create or replace function public.reserve_inventory(p_departure uuid,p_account uuid,p_seats integer,p_key text,p_expires timestamptz)
returns table(order_id uuid,hold_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_departure public.departures%rowtype;
  v_used integer;
  v_existing_order public.orders%rowtype;
  v_existing_hold public.inventory_locks%rowtype;
  v_order_id uuid;
  v_hold_id uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_seats<=0 or p_expires<=now() or length(trim(p_key))<8 then raise exception 'invalid hold'; end if;
  select ord.* into v_existing_order from public.orders as ord where ord.account_id=p_account and ord.idempotency_key=p_key;
  if found then
    select il.* into v_existing_hold from public.inventory_locks as il where il.order_id=v_existing_order.id and il.idempotency_key=p_key;
    if not found then raise exception 'idempotency record incomplete'; end if;
    if v_existing_order.departure_id<>p_departure or v_existing_order.seat_count<>p_seats then raise exception 'idempotency parameter mismatch'; end if;
    if v_existing_order.status not in ('pending_payment','pending_manual_review') or v_existing_hold.status<>'held' or v_existing_hold.expires_at<=now() then raise exception 'idempotency request no longer active'; end if;
    return query select v_existing_order.id,v_existing_hold.id;
    return;
  end if;
  select dep.* into v_departure from public.departures as dep where dep.id=p_departure for update;
  if not found or v_departure.status<>'open' then raise exception 'departure unavailable'; end if;
  update public.inventory_locks as il set status='expired' where il.departure_id=p_departure and il.status='held' and il.expires_at<=now();
  update public.orders as ord set status='expired',updated_at=now() where ord.status='pending_payment' and exists(select 1 from public.inventory_locks il where il.order_id=ord.id and il.status='expired');
  select coalesce(sum(il.seats),0) into v_used from public.inventory_locks as il where il.departure_id=p_departure and il.status in ('held','committed');
  if v_used+p_seats>v_departure.capacity then raise exception 'insufficient inventory'; end if;
  insert into public.orders as ord(account_id,departure_id,idempotency_key,seat_count) values(p_account,p_departure,p_key,p_seats) returning ord.id into v_order_id;
  insert into public.inventory_locks as il(departure_id,order_id,idempotency_key,seats,expires_at) values(p_departure,v_order_id,p_key,p_seats,p_expires) returning il.id into v_hold_id;
  return query select v_order_id,v_hold_id;
end$$;

create or replace function public.mark_bank_transfer_pending(p_order uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  update public.orders as ord set status='pending_manual_review',updated_at=now() where ord.id=p_order and ord.status='pending_payment';
  if found then return true; end if;
  return exists(select 1 from public.orders as ord where ord.id=p_order and ord.status='pending_manual_review');
end$$;

create or replace function public.record_stripe_payment_intent(p_order uuid,p_payment_intent text,p_amount integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_payment_intent!~'^pi_' or p_amount<=0 then raise exception 'invalid payment intent'; end if;
  update public.orders as ord set payment_intent_id=p_payment_intent,amount=p_amount,updated_at=now() where ord.id=p_order and ord.status='pending_payment' and ord.payment_intent_id is null;
  if found then return true; end if;
  return exists(select 1 from public.orders as ord where ord.id=p_order and ord.status='pending_payment' and ord.payment_intent_id=p_payment_intent and ord.amount=p_amount);
end$$;

revoke all on function public.reserve_inventory(uuid,uuid,integer,text,timestamptz),public.mark_bank_transfer_pending(uuid),public.record_stripe_payment_intent(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_inventory(uuid,uuid,integer,text,timestamptz),public.mark_bank_transfer_pending(uuid),public.record_stripe_payment_intent(uuid,text,integer) to service_role;
commit;
