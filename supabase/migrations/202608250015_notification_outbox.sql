begin;
create table public.notification_outbox(
  id uuid primary key default gen_random_uuid(),event_id text not null unique,event_type text not null check(event_type in ('order-confirmed','bank-transfer-pending','meeting-updated','trip-room-opened','departure-reminder','departure-delayed','boarding-completed')),
  recipient_id uuid not null references public.profiles(id),order_id uuid references public.orders(id),necessary boolean not null default true,
  payload jsonb not null default '{}'::jsonb,status text not null default 'pending' check(status in ('pending','suppressed','delivered','failed')),provider text,external_id text,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.notification_outbox enable row level security;
create policy notification_owner_or_ops on public.notification_outbox for select using(recipient_id=auth.uid() or public.is_operations());
revoke all on public.notification_outbox from public,anon,authenticated;grant select(id,event_type,order_id,necessary,status,created_at,updated_at) on public.notification_outbox to authenticated;grant all on public.notification_outbox to service_role;
create or replace function public.enqueue_boarding_completed_notification(p_boarding uuid,p_event_id text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare outbox_id uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
    select p_event_id,'boarding-completed',o.account_id,o.id,true,jsonb_build_object('boardingId',b.id),'pending'
    from public.boardings b join public.orders o on o.id=b.order_id where b.id=p_boarding and b.status='boarded'
    on conflict(event_id) do update set updated_at=public.notification_outbox.updated_at returning id into outbox_id;
  return outbox_id;
end$$;
revoke all on function public.enqueue_boarding_completed_notification(uuid,text) from public,anon,authenticated;grant execute on function public.enqueue_boarding_completed_notification(uuid,text) to service_role;
commit;
