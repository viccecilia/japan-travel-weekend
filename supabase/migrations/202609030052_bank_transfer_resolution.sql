begin;

create table public.manual_payment_decisions(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  actor_id uuid not null references public.profiles(id),
  decision text not null check(decision in ('confirmed','rejected')),
  reconciliation_reference text,
  reason text,
  idempotency_key text not null,
  result_status text not null,
  created_at timestamptz not null default now(),
  unique(actor_id,idempotency_key)
);
alter table public.manual_payment_decisions enable row level security;
revoke all on public.manual_payment_decisions from public,anon,authenticated;
grant select on public.manual_payment_decisions to authenticated;
grant all on public.manual_payment_decisions to service_role;
create policy manual_payment_decisions_operations_select on public.manual_payment_decisions
  for select to authenticated using(public.is_operations());

create function public.operations_resolve_bank_transfer(
  p_order uuid,
  p_decision text,
  p_reference text,
  p_reason text,
  p_idempotency_key text
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid();
  v_order public.orders%rowtype;
  v_hold public.inventory_locks%rowtype;
  v_existing public.manual_payment_decisions%rowtype;
  v_result text;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_decision not in ('confirmed','rejected') then raise exception 'invalid decision'; end if;
  if coalesce(length(trim(p_idempotency_key)),0)<8 or length(p_idempotency_key)>100 then raise exception 'invalid idempotency key'; end if;

  select * into v_existing from public.manual_payment_decisions
    where actor_id=v_actor and idempotency_key=p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.order_id<>p_order or v_existing.decision<>p_decision
      or v_existing.reconciliation_reference is distinct from nullif(trim(p_reference),'')
      or v_existing.reason is distinct from nullif(trim(p_reason),'') then
      raise exception 'idempotency parameter mismatch';
    end if;
    return v_existing.result_status;
  end if;

  select * into v_order from public.orders where id=p_order for update;
  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.status<>'pending_manual_review' then raise exception 'order is not awaiting bank review'; end if;
  select * into v_hold from public.inventory_locks where order_id=p_order for update;

  if p_decision='confirmed' then
    if coalesce(length(trim(p_reference)),0)<4 or length(p_reference)>100 then
      raise exception 'reconciliation reference must be 4 to 100 characters';
    end if;
    if v_hold.id is not null and v_hold.status='held' and v_hold.expires_at>now() then
      update public.inventory_locks set status='committed' where id=v_hold.id;
      update public.orders set status='paid',payment_review_reason=null,updated_at=now() where id=p_order;
      v_result:='paid';
      insert into public.fulfilment_work_items(order_id,departure_id,kind,status,source_event_id)
        values(p_order,v_order.departure_id,'paid_order_ready','pending','bank-transfer-confirmed:'||p_order::text)
        on conflict(order_id,kind,source_event_id) do nothing;
      insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
        values('bank-transfer-confirmed:'||p_order::text,'order-confirmed',v_order.account_id,p_order,true,jsonb_build_object('orderId',p_order),'pending')
        on conflict(event_id) do nothing;
    else
      update public.orders set status='payment_review',payment_review_reason='manual_transfer_without_valid_inventory',updated_at=now() where id=p_order;
      v_result:='payment_review';
      insert into public.fulfilment_work_items(order_id,departure_id,kind,status,source_event_id)
        values(p_order,v_order.departure_id,'payment_review','pending','bank-transfer-inventory-review:'||p_order::text)
        on conflict(order_id,kind,source_event_id) do nothing;
    end if;
  else
    if coalesce(length(trim(p_reason)),0)<3 or length(p_reason)>500 then raise exception 'rejection reason must be 3 to 500 characters'; end if;
    update public.orders set status='cancelled',updated_at=now() where id=p_order;
    update public.inventory_locks set status='released' where order_id=p_order and status='held';
    v_result:='cancelled';
  end if;

  update public.fulfilment_work_items set status='completed',updated_at=now()
    where order_id=p_order and kind='manual_payment_review' and status in ('pending','assigned');
  insert into public.manual_payment_decisions(order_id,actor_id,decision,reconciliation_reference,reason,idempotency_key,result_status)
    values(p_order,v_actor,p_decision,nullif(trim(p_reference),''),nullif(trim(p_reason),''),p_idempotency_key,v_result);
  return v_result;
end$$;

revoke all on function public.operations_resolve_bank_transfer(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.operations_resolve_bank_transfer(uuid,text,text,text,text) to authenticated,service_role;

commit;
