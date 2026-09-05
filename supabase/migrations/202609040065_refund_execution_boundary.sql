alter table public.order_cancellation_requests add column if not exists provider_refund_id text unique;
alter table public.order_cancellation_requests add column if not exists processing_actor_id uuid references public.profiles(id);
alter table public.order_cancellation_requests add column if not exists processing_idempotency_key text unique;

create or replace function public.operations_mark_refund_processing(p_request uuid,p_actor uuid,p_refund_id text,p_idempotency_key text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_refund_id!~'^re_' or length(trim(p_idempotency_key))<8 then raise exception 'invalid refund audit'; end if;
  update public.order_cancellation_requests set status='refund_processing',provider_refund_id=p_refund_id,processing_actor_id=p_actor,processing_idempotency_key=p_idempotency_key,updated_at=now()
  where id=p_request and status='requested' and exists(select 1 from public.profiles p where p.id=p_actor and p.role='operations');
  return found;
end$$;
revoke all on function public.operations_mark_refund_processing(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.operations_mark_refund_processing(uuid,uuid,text,text) to service_role;

create or replace function public.sync_refund_request_from_order() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='refunded' and old.status is distinct from new.status then update public.order_cancellation_requests set status='refunded',updated_at=now() where order_id=new.id and status='refund_processing'; end if;
  return new;
end$$;
drop trigger if exists sync_refund_request_from_order on public.orders;
create trigger sync_refund_request_from_order after update of status on public.orders for each row execute function public.sync_refund_request_from_order();
