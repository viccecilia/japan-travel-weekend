begin;

create table public.notification_delivery_actions(
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check(action in ('retry')),
  reason text not null check(length(reason) between 5 and 300),
  prior_status text not null,
  created_at timestamptz not null default now()
);
alter table public.notification_delivery_actions enable row level security;
revoke all on public.notification_delivery_actions from public,anon,authenticated;
grant all on public.notification_delivery_actions to service_role;

create or replace function public.get_operations_notification_delivery_queue()
returns table(id uuid,event_type text,order_id uuid,status text,attempts integer,last_error_code text,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer stable set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  return query select n.id,n.event_type,n.order_id,n.status,n.attempts,n.last_error_code,n.created_at,n.updated_at
    from public.notification_outbox n
    where n.status='failed' or (n.status='submitted' and n.updated_at<now()-interval '10 minutes')
    order by case when n.status='failed' then 0 else 1 end,n.updated_at asc limit 100;
end$$;

create or replace function public.operations_retry_notification_delivery(p_outbox uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare prior text;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 300 then raise exception 'retry reason required'; end if;
  select n.status into prior from public.notification_outbox n where n.id=p_outbox for update;
  if prior is distinct from 'failed' then raise exception 'only failed notification can be retried'; end if;
  insert into public.notification_delivery_actions(outbox_id,actor_id,action,reason,prior_status)
    values(p_outbox,auth.uid(),'retry',trim(p_reason),prior);
  update public.notification_outbox set status='pending',attempts=0,next_attempt_at=now(),locked_at=null,lock_token=null,last_error_code=null,provider=null,external_id=null,provider_status_at=null,updated_at=now() where id=p_outbox;
  return found;
end$$;

revoke all on function public.get_operations_notification_delivery_queue(),public.operations_retry_notification_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.get_operations_notification_delivery_queue(),public.operations_retry_notification_delivery(uuid,text) to authenticated;

commit;
