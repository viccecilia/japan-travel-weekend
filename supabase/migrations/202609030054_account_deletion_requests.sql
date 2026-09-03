begin;

create table public.account_deletion_requests(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id),
  status text not null check(status in ('requested','deferred_active_booking','reviewing','rejected','cancelled','completed')),
  reason text,
  operations_note text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check(reason is null or length(reason)<=500),
  check(operations_note is null or length(operations_note)<=500)
);
create unique index account_deletion_one_open_request on public.account_deletion_requests(account_id)
  where status in ('requested','deferred_active_booking','reviewing');
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;
create policy account_deletion_owner_read on public.account_deletion_requests for select to authenticated using(account_id=auth.uid());
create policy account_deletion_operations_read on public.account_deletion_requests for select to authenticated using(public.is_operations());

create function public.request_own_account_deletion(p_confirmation text,p_reason text default null)
returns public.account_deletion_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account uuid:=auth.uid();v_existing public.account_deletion_requests%rowtype;v_result public.account_deletion_requests%rowtype;v_active boolean;
begin
  if v_account is null then raise exception 'authentication required'; end if;
  if p_confirmation<>'删除我的账户' then raise exception 'confirmation mismatch'; end if;
  if length(coalesce(p_reason,''))>500 then raise exception 'reason too long'; end if;
  select * into v_existing from public.account_deletion_requests where account_id=v_account and status in ('requested','deferred_active_booking','reviewing') order by requested_at desc limit 1;
  if v_existing.id is not null then return v_existing; end if;
  select exists(select 1 from public.orders o join public.departures d on d.id=o.departure_id where o.account_id=v_account and o.status in ('paid','confirmed','payment_review') and d.departs_at>now()) into v_active;
  insert into public.account_deletion_requests(account_id,status,reason)
    values(v_account,case when v_active then 'deferred_active_booking' else 'requested' end,nullif(trim(p_reason),'')) returning * into v_result;
  return v_result;
end$$;

create function public.cancel_own_account_deletion(p_request uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.account_deletion_requests set status='cancelled',updated_at=now()
    where id=p_request and account_id=auth.uid() and status in ('requested','deferred_active_booking');
  return found;
end$$;

create function public.operations_review_account_deletion(p_request uuid,p_decision text,p_note text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_decision not in ('reviewing','rejected') or length(trim(coalesce(p_note,''))) not between 3 and 500 then raise exception 'invalid review'; end if;
  update public.account_deletion_requests set status=p_decision,operations_note=trim(p_note),updated_at=now()
    where id=p_request and status in ('requested','deferred_active_booking','reviewing');
  return found;
end$$;

revoke all on function public.request_own_account_deletion(text,text),public.cancel_own_account_deletion(uuid),public.operations_review_account_deletion(uuid,text,text) from public,anon,authenticated;
grant execute on function public.request_own_account_deletion(text,text),public.cancel_own_account_deletion(uuid) to authenticated,service_role;
grant execute on function public.operations_review_account_deletion(uuid,text,text) to authenticated,service_role;

commit;
