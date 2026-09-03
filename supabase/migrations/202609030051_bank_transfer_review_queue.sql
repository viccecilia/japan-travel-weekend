begin;

alter table public.fulfilment_work_items drop constraint if exists fulfilment_work_items_kind_check;
alter table public.fulfilment_work_items add constraint fulfilment_work_items_kind_check
check(kind in ('paid_order_ready','payment_review','manual_payment_review'));

drop function if exists public.mark_bank_transfer_pending(uuid);
create function public.mark_bank_transfer_pending(p_order uuid,p_amount integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_expected bigint;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_amount<=0 then raise exception 'invalid bank transfer amount'; end if;
  select * into v_order from public.orders where id=p_order for update;
  if v_order.id is null then return false; end if;
  select d.seat_price_jpy::bigint*v_order.seat_count into v_expected from public.departures d where d.id=v_order.departure_id;
  if v_expected is null or v_expected<>p_amount then return false; end if;
  if v_order.status='pending_payment' then
    update public.orders set status='pending_manual_review',amount=p_amount,updated_at=now() where id=p_order;
  elsif v_order.status<>'pending_manual_review' or v_order.amount is distinct from p_amount then
    return false;
  end if;
  insert into public.fulfilment_work_items(order_id,departure_id,kind,status,source_event_id)
    values(p_order,v_order.departure_id,'manual_payment_review','pending','bank-transfer:'||p_order::text)
    on conflict(order_id,kind,source_event_id) do nothing;
  insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
    values('bank-transfer-pending:'||p_order::text,'bank-transfer-pending',v_order.account_id,p_order,true,jsonb_build_object('orderId',p_order),'pending')
    on conflict(event_id) do nothing;
  return true;
end$$;

create or replace function public.record_stripe_payment_intent(p_order uuid,p_payment_intent text,p_amount integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_expected bigint;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_payment_intent!~'^pi_' or p_amount<=0 then raise exception 'invalid payment intent'; end if;
  select d.seat_price_jpy::bigint*o.seat_count into v_expected
    from public.orders o join public.departures d on d.id=o.departure_id where o.id=p_order for update of o;
  if v_expected is null or v_expected<>p_amount then return false; end if;
  update public.orders set payment_intent_id=p_payment_intent,amount=p_amount,updated_at=now()
    where id=p_order and status='pending_payment' and payment_intent_id is null;
  if found then return true; end if;
  return exists(select 1 from public.orders where id=p_order and status='pending_payment' and payment_intent_id=p_payment_intent and amount=p_amount);
end$$;

revoke all on function public.mark_bank_transfer_pending(uuid,integer),public.record_stripe_payment_intent(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.mark_bank_transfer_pending(uuid,integer),public.record_stripe_payment_intent(uuid,text,integer) to service_role;

commit;
