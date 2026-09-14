begin;

-- A Stripe failure can be retried while its short inventory hold is valid.
-- A cancelled PaymentIntent is terminal for this checkout attempt and must not
-- continue occupying seats or appear as a paid booking.
create or replace function public.apply_payment_event(
  p_event_id text,
  p_order uuid,
  p_status public.payment_status,
  p_created timestamptz,
  p_digest text
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  latest public.payment_events%rowtype;
  hold public.inventory_locks%rowtype;
  v_departure uuid;
  v_account uuid;
  v_paid boolean:=false;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if exists(select 1 from public.payment_events where provider_event_id=p_event_id) then return false; end if;

  select * into latest
  from public.payment_events
  where order_id=p_order
  order by event_created_at desc,received_at desc
  limit 1;

  insert into public.payment_events(provider,provider_event_id,order_id,status,event_created_at,payload_digest)
  values('stripe',p_event_id,p_order,p_status,p_created,p_digest);
  if latest.id is not null and p_created<latest.event_created_at then return true; end if;

  select * into hold from public.inventory_locks where order_id=p_order for update;
  select departure_id,account_id into v_departure,v_account from public.orders where id=p_order for update;

  if p_status='succeeded' then
    if hold.status='held' and hold.expires_at>now() then
      update public.inventory_locks set status='committed' where id=hold.id;
      update public.orders
      set status='paid',payment_review_reason=null,updated_at=now()
      where id=p_order and status='pending_payment';
      v_paid:=found;
    else
      update public.orders
      set status='payment_review',payment_review_reason='payment_succeeded_without_valid_inventory',updated_at=now()
      where id=p_order and status in ('pending_payment','expired','cancelled');
      insert into public.fulfilment_work_items(order_id,departure_id,kind,status,source_event_id)
      values(p_order,v_departure,'payment_review','pending',p_event_id)
      on conflict do nothing;
    end if;

    if v_paid then
      insert into public.fulfilment_work_items(order_id,departure_id,kind,status,source_event_id)
      values(p_order,v_departure,'paid_order_ready','pending',p_event_id)
      on conflict do nothing;
      insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
      values('stripe:'||p_event_id||':confirmed','order-confirmed',v_account,p_order,true,jsonb_build_object('departureId',v_departure),'pending')
      on conflict(event_id) do nothing;
    end if;
  elsif p_status='cancelled' then
    update public.orders
    set status='cancelled',updated_at=now()
    where id=p_order and status='pending_payment';
    update public.inventory_locks
    set status='released'
    where order_id=p_order and status='held';
    update public.fulfilment_work_items
    set status='cancelled',updated_at=now()
    where order_id=p_order and status in ('pending','assigned');
  elsif p_status='refunded' then
    update public.orders set status='refunded',updated_at=now()
    where id=p_order and status in ('paid','confirmed','payment_review');
    update public.fulfilment_work_items
    set status='cancelled',updated_at=now()
    where order_id=p_order and status in ('pending','assigned');
  end if;

  return true;
end
$$;

revoke all on function public.apply_payment_event(text,uuid,public.payment_status,timestamptz,text) from public,anon,authenticated;
grant execute on function public.apply_payment_event(text,uuid,public.payment_status,timestamptz,text) to service_role;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select '202609140138',now() where public.is_operations()
$$;

revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;

commit;
