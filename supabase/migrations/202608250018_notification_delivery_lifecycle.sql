begin;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_status_check,
  add column if not exists attempts integer not null default 0 check(attempts>=0),
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists lock_token uuid,
  add column if not exists last_error_code text,
  add constraint notification_outbox_status_check check(status in ('pending','processing','suppressed','delivered','failed'));

create index if not exists notification_outbox_delivery_idx on public.notification_outbox(status,next_attempt_at,created_at);

create or replace function public.claim_notification_outbox(p_limit integer,p_lock_token uuid,p_now timestamptz default now())
returns table(id uuid,event_id text,event_type text,recipient_id uuid,order_id uuid,necessary boolean,payload jsonb,attempts integer)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_limit not between 1 and 100 or p_lock_token is null then raise exception 'invalid notification claim'; end if;
  return query
    with candidates as (
      select n.id from public.notification_outbox n
      where (n.status='pending' and n.next_attempt_at<=p_now) or (n.status='processing' and n.locked_at<p_now-interval '5 minutes')
      order by n.created_at for update skip locked limit p_limit
    ), claimed as (
      update public.notification_outbox n set status='processing',locked_at=p_now,lock_token=p_lock_token,attempts=n.attempts+1,updated_at=p_now
      from candidates c where n.id=c.id
      returning n.id,n.event_id,n.event_type,n.recipient_id,n.order_id,n.necessary,n.payload,n.attempts
    ) select * from claimed;
end$$;

create or replace function public.complete_notification_delivery(p_id uuid,p_lock_token uuid,p_outcome text,p_provider text default null,p_external_id text default null,p_error_code text default null,p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_outcome not in ('delivered','retry','suppressed','failed') then raise exception 'invalid notification outcome'; end if;
  update public.notification_outbox n set
    status=case when p_outcome='retry' and n.attempts<5 then 'pending' when p_outcome='retry' then 'failed' else p_outcome end,
    provider=case when p_outcome='delivered' then p_provider else n.provider end,
    external_id=case when p_outcome='delivered' then p_external_id else n.external_id end,
    last_error_code=case when p_outcome in ('retry','failed') then left(coalesce(p_error_code,'provider-error'),100) else null end,
    next_attempt_at=case when p_outcome='retry' and n.attempts<5 then p_now+make_interval(mins=>least(60,power(2,n.attempts)::integer)) else n.next_attempt_at end,
    locked_at=null,lock_token=null,updated_at=p_now
  where n.id=p_id and n.status='processing' and n.lock_token=p_lock_token;
  return found;
end$$;

revoke all on function public.claim_notification_outbox(integer,uuid,timestamptz),public.complete_notification_delivery(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_notification_outbox(integer,uuid,timestamptz),public.complete_notification_delivery(uuid,uuid,text,text,text,text,timestamptz) to service_role;

commit;
