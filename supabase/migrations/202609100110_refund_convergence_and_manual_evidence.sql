begin;

alter table public.refund_operations add column if not exists handled_by uuid references public.profiles(id);
alter table public.refund_operations add column if not exists manual_reference text;
alter table public.refund_operations add column if not exists evidence_note text;

create or replace function public.operations_record_refund_provider_result(p_operation uuid,p_actor uuid,p_status text,p_refund_id text,p_error_code text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare op public.refund_operations%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_status not in ('submitted','failed','provider_result_unknown') or not exists(select 1 from public.profiles where id=p_actor and role='operations') then raise exception 'invalid provider result'; end if;
  select * into op from public.refund_operations where id=p_operation for update;
  if not found or op.channel<>'stripe' then return false; end if;
  if op.status='completed' then return true; end if;
  if p_status='submitted' and coalesce(p_refund_id,'')!~'^re_' then raise exception 'invalid provider refund'; end if;
  update public.refund_operations set status=case when p_status='failed' then 'provider_result_unknown' else p_status end,provider_refund_id=coalesce(p_refund_id,provider_refund_id),provider_error_code=p_error_code,handled_by=p_actor,updated_at=now() where id=op.id;
  update public.order_cancellation_requests set status=case when p_status='submitted' then 'refund_processing' else 'provider_result_unknown' end,reviewed_by=p_actor,updated_at=now() where id=op.cancellation_request_id and status not in ('refunded','closed');
  return true;
end$$;

create or replace function public.operations_complete_manual_refund(p_operation uuid,p_actor uuid,p_reference text,p_actual_amount integer,p_evidence_note text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare op public.refund_operations%rowtype;o public.orders%rowtype;v_full boolean;
begin
  if current_user not in ('service_role','postgres') or not exists(select 1 from public.profiles where id=p_actor and role='operations') then raise exception 'operations only'; end if;
  if length(trim(coalesce(p_reference,'')))<4 or length(trim(coalesce(p_evidence_note,'')))<3 or p_actual_amount<0 then raise exception 'manual refund evidence required'; end if;
  select * into op from public.refund_operations where id=p_operation for update;
  if not found or op.channel<>'manual' then return false; end if;
  if op.status='completed' then return op.actual_refund_amount=p_actual_amount and op.manual_reference=trim(p_reference); end if;
  if op.status<>'awaiting_manual_refund' or p_actual_amount<>op.requested_amount then return false; end if;
  select * into o from public.orders where id=op.order_id for update;v_full:=p_actual_amount>=coalesce(o.amount,0);
  update public.refund_operations set status='completed',actual_refund_amount=p_actual_amount,completed_at=now(),handled_by=p_actor,manual_reference=trim(p_reference),evidence_note=trim(p_evidence_note),updated_at=now() where id=op.id;
  update public.orders set refunded_amount_jpy=greatest(refunded_amount_jpy,p_actual_amount),status=case when v_full then 'refunded'::public.order_status else status end,updated_at=now() where id=op.order_id;
  update public.order_cancellation_requests set status=case when v_full then 'refunded' else 'closed' end,reviewed_by=p_actor,updated_at=now() where id=op.cancellation_request_id;
  if v_full then update public.inventory_locks set status='released' where order_id=op.order_id and status in ('held','committed');end if;
  insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
    select 'refund-completed:manual:'||op.id,'refund-completed',ord.account_id,ord.id,true,jsonb_build_object('orderId',ord.id,'amount',p_actual_amount,'fullRefund',v_full,'currency',ord.currency),'pending' from public.orders ord where ord.id=op.order_id on conflict(event_id) do nothing;
  return true;
end$$;

create or replace function public.apply_stripe_refund_status_event(p_event_id text,p_order uuid,p_refund_id text,p_status text,p_amount integer,p_created timestamptz,p_digest text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare op public.refund_operations%rowtype;o public.orders%rowtype;v_full boolean;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_status not in ('succeeded','failed','canceled','pending','requires_action') or p_amount<0 or coalesce(p_refund_id,'')!~'^re_' then raise exception 'invalid refund event'; end if;
  if exists(select 1 from public.payment_events where provider_event_id=p_event_id) then return false;end if;
  select * into op from public.refund_operations where provider_refund_id=p_refund_id or (order_id=p_order and provider_refund_id is null and status in ('prepared','submitted','provider_result_unknown')) order by created_at desc limit 1 for update;
  if not found then raise exception 'refund operation unavailable';end if;
  insert into public.payment_events(provider,provider_event_id,order_id,status,event_created_at,payload_digest) values('stripe',p_event_id,p_order,(case when p_status='succeeded' then 'refunded' else 'failed' end)::public.payment_status,p_created,p_digest);
  if op.status='completed' then return true;end if;
  if p_status<>'succeeded' then
    update public.refund_operations set status='provider_result_unknown',provider_refund_id=coalesce(provider_refund_id,p_refund_id),provider_error_code='refund_'||p_status,updated_at=now() where id=op.id;
    update public.order_cancellation_requests set status='provider_result_unknown',updated_at=now() where id=op.cancellation_request_id and status not in ('refunded','closed');return true;
  end if;
  select * into o from public.orders where id=p_order for update;v_full:=p_amount>=coalesce(o.amount,0);
  update public.refund_operations set status='completed',provider_refund_id=p_refund_id,actual_refund_amount=p_amount,completed_at=now(),provider_error_code=null,updated_at=now() where id=op.id;
  update public.orders set refunded_amount_jpy=greatest(refunded_amount_jpy,p_amount),status=case when v_full then 'refunded'::public.order_status else status end,updated_at=now() where id=p_order;
  update public.order_cancellation_requests set status=case when v_full then 'refunded' else 'closed' end,updated_at=now() where id=op.cancellation_request_id;
  insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status) select 'refund-completed:'||p_event_id,'refund-completed',o.account_id,o.id,true,jsonb_build_object('orderId',o.id,'amount',p_amount,'fullRefund',v_full,'currency',o.currency),'pending' from public.orders o where o.id=p_order on conflict(event_id) do nothing;
  return true;
end$$;

revoke all on function public.operations_record_refund_provider_result(uuid,uuid,text,text,text),public.operations_complete_manual_refund(uuid,uuid,text,integer,text),public.apply_stripe_refund_status_event(text,uuid,text,text,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function public.operations_record_refund_provider_result(uuid,uuid,text,text,text),public.operations_complete_manual_refund(uuid,uuid,text,integer,text),public.apply_stripe_refund_status_event(text,uuid,text,text,integer,timestamptz,text) to service_role;

commit;
