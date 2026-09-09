begin;

alter table public.orders add column if not exists refunded_amount_jpy integer not null default 0 check(refunded_amount_jpy>=0);
alter table public.order_cancellation_requests drop constraint if exists order_cancellation_requests_status_check;
alter table public.order_cancellation_requests add constraint order_cancellation_requests_status_check check(status in (
  'requested','reviewing','rejected','refund_prepared','refund_processing','manual_refund_required',
  'provider_result_unknown','refunded','cancelled_without_refund','closed'
));

create table if not exists public.refund_operations(
  id uuid primary key default gen_random_uuid(),
  cancellation_request_id uuid not null references public.order_cancellation_requests(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  client_request_key text not null,
  provider_idempotency_key text not null unique,
  channel text not null check(channel in ('stripe','manual','none')),
  requested_amount integer not null check(requested_amount>=0),
  status text not null check(status in ('prepared','submitted','awaiting_manual_refund','completed_without_refund','completed','failed','provider_result_unknown')),
  provider_refund_id text unique,
  provider_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cancellation_request_id,client_request_key)
);
alter table public.refund_operations enable row level security;
revoke all on public.refund_operations from public,anon,authenticated;
grant select on public.refund_operations to authenticated;
grant all on public.refund_operations to service_role;
create policy refund_operations_ops_read on public.refund_operations for select to authenticated using(public.is_operations());

create or replace function public.operations_prepare_refund(p_request uuid,p_actor uuid,p_client_request_key text,p_channel text)
returns table(operation_id uuid,provider_idempotency_key text,operation_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare req public.order_cancellation_requests%rowtype;op public.refund_operations%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if length(trim(coalesce(p_client_request_key,''))) not between 8 and 100 or p_channel not in ('stripe','manual','none') then raise exception 'invalid refund operation'; end if;
  if not exists(select 1 from public.profiles where id=p_actor and role='operations') then raise exception 'operations only'; end if;
  select * into req from public.order_cancellation_requests where id=p_request for update;
  if not found or req.status not in ('requested','reviewing','refund_prepared','manual_refund_required','provider_result_unknown') then raise exception 'cancellation request unavailable'; end if;
  select * into op from public.refund_operations where cancellation_request_id=p_request and client_request_key=trim(p_client_request_key);
  if found then
    if op.channel<>p_channel or op.requested_amount<>req.estimated_refund_amount then raise exception 'refund idempotency mismatch'; end if;
  else
    insert into public.refund_operations(cancellation_request_id,order_id,actor_id,client_request_key,provider_idempotency_key,channel,requested_amount,status)
    values(req.id,req.order_id,p_actor,trim(p_client_request_key),'refund:'||gen_random_uuid()::text,p_channel,req.estimated_refund_amount,case when p_channel='manual' then 'awaiting_manual_refund' else 'prepared' end)
    returning * into op;
  end if;
  update public.order_cancellation_requests set status=case when p_channel='manual' then 'manual_refund_required' else 'refund_prepared' end,reviewed_by=p_actor,reviewed_at=coalesce(reviewed_at,now()),updated_at=now() where id=req.id;
  return query select op.id,op.provider_idempotency_key,op.status;
end$$;

create or replace function public.operations_complete_cancellation_without_refund(p_operation uuid,p_actor uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare op public.refund_operations%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  select * into op from public.refund_operations where id=p_operation for update;
  if not found or op.actor_id<>p_actor or op.channel<>'none' or op.requested_amount<>0 then return false; end if;
  update public.orders set status='cancelled',updated_at=now() where id=op.order_id and status in ('paid','confirmed','payment_review');
  update public.inventory_locks set status='released' where order_id=op.order_id and status in ('held','committed');
  update public.fulfilment_work_items set status='cancelled',updated_at=now() where order_id=op.order_id and status in ('pending','assigned');
  update public.refund_operations set status='completed_without_refund',updated_at=now() where id=op.id;
  update public.order_cancellation_requests set status='cancelled_without_refund',updated_at=now() where id=op.cancellation_request_id;
  return true;
end$$;

create or replace function public.operations_record_refund_provider_result(p_operation uuid,p_actor uuid,p_status text,p_refund_id text,p_error_code text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare op public.refund_operations%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_status not in ('submitted','failed') then raise exception 'invalid provider status'; end if;
  select * into op from public.refund_operations where id=p_operation for update;
  if not found or op.actor_id<>p_actor or op.channel<>'stripe' then return false; end if;
  if p_status='submitted' and coalesce(p_refund_id,'')!~'^re_' then raise exception 'invalid provider refund'; end if;
  update public.refund_operations set status=p_status,provider_refund_id=coalesce(p_refund_id,provider_refund_id),provider_error_code=p_error_code,updated_at=now() where id=op.id;
  update public.order_cancellation_requests set status=case when p_status='submitted' then 'refund_processing' else 'provider_result_unknown' end,updated_at=now() where id=op.cancellation_request_id;
  return true;
end$$;

create or replace function public.apply_stripe_refund_event(p_event_id text,p_order uuid,p_refund_id text,p_amount_refunded integer,p_charge_amount integer,p_created timestamptz,p_digest text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare previous_amount integer;delta integer;is_full boolean;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_amount_refunded<0 or p_charge_amount<1 or p_amount_refunded>p_charge_amount then raise exception 'invalid refund totals'; end if;
  if exists(select 1 from public.payment_events where provider_event_id=p_event_id) then return false; end if;
  select refunded_amount_jpy into previous_amount from public.orders where id=p_order for update;
  if not found then raise exception 'order not found'; end if;
  delta:=greatest(p_amount_refunded-previous_amount,0);is_full:=p_amount_refunded=p_charge_amount;
  insert into public.payment_events(provider,provider_event_id,order_id,status,event_created_at,payload_digest)
  values('stripe',p_event_id,p_order,'refunded',p_created,p_digest);
  update public.orders set refunded_amount_jpy=greatest(refunded_amount_jpy,p_amount_refunded),status=case when is_full then 'refunded'::public.order_status else status end,updated_at=now() where id=p_order;
  update public.refund_operations set status='completed',provider_refund_id=coalesce(provider_refund_id,p_refund_id),updated_at=now()
    where order_id=p_order and (provider_refund_id=p_refund_id or (provider_refund_id is null and status in ('submitted','provider_result_unknown')));
  update public.order_cancellation_requests set status=case when is_full then 'refunded' else 'closed' end,updated_at=now()
    where order_id=p_order and status in ('refund_processing','provider_result_unknown');
  if delta>0 then
    insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
    select 'refund-completed:'||p_event_id,'refund-completed',o.account_id,o.id,true,jsonb_build_object('orderId',o.id,'amount',delta,'cumulativeAmount',p_amount_refunded,'fullRefund',is_full,'currency',o.currency),'pending'
    from public.orders o where o.id=p_order on conflict(event_id) do nothing;
  end if;
  return true;
end$$;

revoke all on function public.operations_prepare_refund(uuid,uuid,text,text),public.operations_complete_cancellation_without_refund(uuid,uuid),public.operations_record_refund_provider_result(uuid,uuid,text,text,text),public.apply_stripe_refund_event(text,uuid,text,integer,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function public.operations_prepare_refund(uuid,uuid,text,text),public.operations_complete_cancellation_without_refund(uuid,uuid),public.operations_record_refund_provider_result(uuid,uuid,text,text,text),public.apply_stripe_refund_event(text,uuid,text,integer,integer,timestamptz,text) to service_role;

commit;
