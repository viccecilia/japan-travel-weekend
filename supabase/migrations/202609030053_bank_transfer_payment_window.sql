begin;

alter table public.orders add column manual_payment_due_at timestamptz;

drop function if exists public.mark_bank_transfer_pending(uuid,integer);
create function public.mark_bank_transfer_pending(p_order uuid,p_amount integer)
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_expected bigint;
  v_departs_at timestamptz;
  v_due timestamptz;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_amount<=0 then raise exception 'invalid bank transfer amount'; end if;
  select * into v_order from public.orders where id=p_order for update;
  if v_order.id is null then return null; end if;
  select d.seat_price_jpy::bigint*v_order.seat_count,d.departs_at
    into v_expected,v_departs_at from public.departures d where d.id=v_order.departure_id;
  if v_expected is null or v_expected<>p_amount then return null; end if;
  if v_order.status='pending_manual_review' then
    if v_order.amount is distinct from p_amount or v_order.manual_payment_due_at<=now() then return null; end if;
    return v_order.manual_payment_due_at;
  end if;
  if v_order.status<>'pending_payment' then return null; end if;
  v_due:=least(now()+interval '24 hours',v_departs_at-interval '2 hours');
  if v_due<=now() then return null; end if;

  update public.orders set status='pending_manual_review',amount=p_amount,manual_payment_due_at=v_due,updated_at=now() where id=p_order;
  update public.inventory_locks set expires_at=v_due where order_id=p_order and status='held' and expires_at>now();
  if not found then raise exception 'active inventory hold required'; end if;
  insert into public.fulfilment_work_items(order_id,departure_id,kind,status,source_event_id)
    values(p_order,v_order.departure_id,'manual_payment_review','pending','bank-transfer:'||p_order::text)
    on conflict(order_id,kind,source_event_id) do nothing;
  insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
    values('bank-transfer-pending:'||p_order::text,'bank-transfer-pending',v_order.account_id,p_order,true,jsonb_build_object('orderId',p_order,'paymentDueAt',v_due),'pending')
    on conflict(event_id) do nothing;
  return v_due;
end$$;

revoke all on function public.mark_bank_transfer_pending(uuid,integer) from public,anon,authenticated;
grant execute on function public.mark_bank_transfer_pending(uuid,integer) to service_role;

create function public.expire_due_bank_transfers(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_now is null or p_now>now()+interval '5 minutes' or p_now<now()-interval '5 minutes' then raise exception 'invalid scheduler time'; end if;
  with expired as (
    update public.orders set status='expired',updated_at=now()
    where status='pending_manual_review' and manual_payment_due_at<=p_now returning id
  ) select count(*)::integer into v_count from expired;
  update public.inventory_locks il set status='expired'
    where il.status='held' and exists(select 1 from public.orders o where o.id=il.order_id and o.status='expired' and o.manual_payment_due_at<=p_now);
  return v_count;
end$$;
revoke all on function public.expire_due_bank_transfers(timestamptz) from public,anon,authenticated;
grant execute on function public.expire_due_bank_transfers(timestamptz) to service_role;

commit;
