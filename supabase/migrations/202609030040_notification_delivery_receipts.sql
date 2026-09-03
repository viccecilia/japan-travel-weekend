begin;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_status_check,
  add column if not exists provider_status_at timestamptz,
  add constraint notification_outbox_status_check check(status in ('pending','processing','submitted','suppressed','delivered','failed'));

create or replace function public.complete_notification_delivery(p_id uuid,p_lock_token uuid,p_outcome text,p_provider text default null,p_external_id text default null,p_error_code text default null,p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_outcome not in ('submitted','retry','suppressed','failed') then raise exception 'invalid notification outcome'; end if;
  update public.notification_outbox n set
    status=case when p_outcome='retry' and n.attempts<5 then 'pending' when p_outcome='retry' then 'failed' else p_outcome end,
    provider=case when p_outcome='submitted' then p_provider else n.provider end,
    external_id=case when p_outcome='submitted' then p_external_id else n.external_id end,
    last_error_code=case when p_outcome in ('retry','failed') then left(coalesce(p_error_code,'provider-error'),100) else null end,
    next_attempt_at=case when p_outcome='retry' and n.attempts<5 then p_now+make_interval(mins=>least(60,power(2,n.attempts)::integer)) else n.next_attempt_at end,
    locked_at=null,lock_token=null,updated_at=p_now
  where n.id=p_id and n.status='processing' and n.lock_token=p_lock_token;
  return found;
end$$;

create table public.notification_delivery_receipts(
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  status text not null check(status in ('delivered','failed')),
  external_id text not null,
  occurred_at timestamptz not null,
  payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now()
);
alter table public.notification_delivery_receipts enable row level security;
revoke all on public.notification_delivery_receipts from public,anon,authenticated;
grant all on public.notification_delivery_receipts to service_role;

create or replace function public.apply_notification_delivery_receipt(p_provider_event_id text,p_outbox_id uuid,p_status text,p_external_id text,p_occurred_at timestamptz,p_payload_digest text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare inserted_count integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_status not in ('delivered','failed') or p_provider_event_id is null or length(p_provider_event_id)>200 or p_external_id is null or length(p_external_id)>200 or p_payload_digest !~ '^[0-9a-f]{64}$' then raise exception 'invalid notification receipt'; end if;
  if not exists(select 1 from public.notification_outbox n where n.id=p_outbox_id and n.external_id=p_external_id) then raise exception 'notification receipt does not match submitted delivery'; end if;
  insert into public.notification_delivery_receipts(provider_event_id,outbox_id,status,external_id,occurred_at,payload_digest)
  values(p_provider_event_id,p_outbox_id,p_status,p_external_id,p_occurred_at,p_payload_digest)
  on conflict(provider_event_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count=0 then return true; end if;
  update public.notification_outbox n set
    status=p_status,provider_status_at=p_occurred_at,last_error_code=case when p_status='failed' then 'provider-delivery-failed' else null end,updated_at=now()
  where n.id=p_outbox_id and n.external_id=p_external_id and n.status<>'delivered' and (n.provider_status_at is null or p_occurred_at>=n.provider_status_at);
  return true;
end$$;

revoke all on function public.apply_notification_delivery_receipt(text,uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.apply_notification_delivery_receipt(text,uuid,text,text,timestamptz,text) to service_role;
revoke all on function public.complete_notification_delivery(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.complete_notification_delivery(uuid,uuid,text,text,text,text,timestamptz) to service_role;

commit;
