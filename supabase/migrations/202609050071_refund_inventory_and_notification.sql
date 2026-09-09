begin;

alter table public.notification_outbox drop constraint if exists notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check(event_type in (
  'order-confirmed','bank-transfer-pending','meeting-updated','trip-room-opened','departure-reminder',
  'departure-delayed','boarding-completed','checkin-reminder','passenger-contact-escalation',
  'meeting-started','trip-progress','trip-completed','free-time-started','refund-completed'
));

create or replace function public.request_own_order_cancellation(p_order uuid,p_reason_code text,p_customer_note text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_departs timestamptz;v_percent integer;v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_reason_code not in ('plans_changed','health','transport','duplicate','other') or length(trim(coalesce(p_customer_note,'')))>500 then raise exception 'invalid request'; end if;
  select o.* into v_order from public.orders o where o.id=p_order and o.account_id=auth.uid() for update;
  if v_order.id is null or v_order.status not in ('paid','confirmed') then raise exception 'order is not cancellation eligible'; end if;
  select d.departs_at into v_departs from public.departures d where d.id=v_order.departure_id;
  if v_departs<=now() then raise exception 'departure already started'; end if;
  v_percent:=case when v_departs-now()>=interval '24 hours' then 100 else 0 end;
  insert into public.order_cancellation_requests(order_id,account_id,reason_code,customer_note,refund_percent,estimated_refund_amount)
  values(v_order.id,auth.uid(),p_reason_code,trim(coalesce(p_customer_note,'')),v_percent,round(coalesce(v_order.amount,0)*v_percent/100.0)) returning id into v_id;
  return v_id;
end$$;
revoke all on function public.request_own_order_cancellation(uuid,text,text) from public,anon;
grant execute on function public.request_own_order_cancellation(uuid,text,text) to authenticated,service_role;

create or replace function public.finalize_refunded_order()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='refunded' and old.status is distinct from new.status then
    update public.inventory_locks set status='released'
      where order_id=new.id and status in ('held','committed');
    update public.fulfilment_work_items set status='cancelled',updated_at=now()
      where order_id=new.id and status in ('pending','assigned');
    insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
      values(
        'refund-completed:'||new.id::text,
        'refund-completed',
        new.account_id,
        new.id,
        true,
        jsonb_build_object('orderId',new.id,'amount',new.amount,'currency',new.currency),
        'pending'
      ) on conflict(event_id) do nothing;
  end if;
  return new;
end$$;

drop trigger if exists finalize_refunded_order_trigger on public.orders;
create trigger finalize_refunded_order_trigger after update of status on public.orders
for each row execute function public.finalize_refunded_order();

revoke all on function public.finalize_refunded_order() from public,anon,authenticated,service_role;

update public.inventory_locks l set status='released'
from public.orders o where o.id=l.order_id and o.status='refunded' and l.status in ('held','committed');

insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
select 'refund-completed:'||o.id::text,'refund-completed',o.account_id,o.id,true,
  jsonb_build_object('orderId',o.id,'amount',o.amount,'currency',o.currency),'pending'
from public.orders o where o.status='refunded'
on conflict(event_id) do nothing;

commit;
