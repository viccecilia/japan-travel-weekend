begin;

create table if not exists public.order_cancellation_requests(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  account_id uuid not null references public.profiles(id) on delete restrict,
  reason_code text not null check(reason_code in ('plans_changed','health','transport','duplicate','other')),
  customer_note text not null default '' check(length(customer_note)<=500),
  status text not null default 'requested' check(status in ('requested','reviewing','rejected','refund_processing','refunded','closed')),
  refund_percent integer not null check(refund_percent between 0 and 100),
  estimated_refund_amount integer not null check(estimated_refund_amount>=0),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  operations_note text check(length(operations_note)<=500)
);
create unique index if not exists order_cancellation_one_active
  on public.order_cancellation_requests(order_id)
  where status in ('requested','reviewing','refund_processing');

alter table public.order_cancellation_requests enable row level security;
revoke all on public.order_cancellation_requests from public,anon,authenticated;
grant select on public.order_cancellation_requests to authenticated;
grant all on public.order_cancellation_requests to service_role;
create policy cancellation_owner_read on public.order_cancellation_requests for select to authenticated using(account_id=auth.uid());
create policy cancellation_operations_read on public.order_cancellation_requests for select to authenticated using(public.is_operations());

create or replace function public.request_own_order_cancellation(p_order uuid,p_reason_code text,p_customer_note text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_departs timestamptz;v_days integer;v_percent integer;v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_reason_code not in ('plans_changed','health','transport','duplicate','other') or length(trim(coalesce(p_customer_note,'')))>500 then raise exception 'invalid request'; end if;
  select o.* into v_order from public.orders o where o.id=p_order and o.account_id=auth.uid() for update;
  if v_order.id is null or v_order.status not in ('paid','confirmed') then raise exception 'order is not cancellation eligible'; end if;
  select d.departs_at into v_departs from public.departures d where d.id=v_order.departure_id;
  if v_departs<=now() then raise exception 'departure already started'; end if;
  v_days:=((v_departs at time zone 'Asia/Tokyo')::date-(now() at time zone 'Asia/Tokyo')::date);
  v_percent:=case when v_days>3 then 100 when v_days>=2 then 50 else 0 end;
  insert into public.order_cancellation_requests(order_id,account_id,reason_code,customer_note,refund_percent,estimated_refund_amount)
  values(v_order.id,auth.uid(),p_reason_code,trim(coalesce(p_customer_note,'')),v_percent,round(coalesce(v_order.amount,0)*v_percent/100.0)) returning id into v_id;
  return v_id;
end$$;

create or replace function public.cancel_own_order_cancellation_request(p_request uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.order_cancellation_requests set status='closed',updated_at=now()
  where id=p_request and account_id=auth.uid() and status='requested';
  return found;
end$$;

revoke all on function public.request_own_order_cancellation(uuid,text,text),public.cancel_own_order_cancellation_request(uuid) from public,anon;
grant execute on function public.request_own_order_cancellation(uuid,text,text),public.cancel_own_order_cancellation_request(uuid) to authenticated,service_role;

commit;
