begin;

create table if not exists public.order_quotes(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id),
  departure_id uuid not null references public.departures(id),
  departure_version integer not null,
  product_revision_id uuid references public.product_revisions(id),
  seat_count integer not null check(seat_count>0),
  unit_price_jpy integer not null check(unit_price_jpy>0),
  base_fare_jpy integer not null check(base_fare_jpy>0),
  add_on_total_jpy integer not null default 0 check(add_on_total_jpy>=0),
  coupon_id uuid references public.discount_coupons(id),
  coupon_source_type text,
  coupon_rules_version text,
  discount_percent integer not null default 0 check(discount_percent in (0,10,30,50,100)),
  discounted_seats integer not null default 0 check(discounted_seats in (0,1)),
  discount_amount_jpy integer not null default 0 check(discount_amount_jpy>=0),
  amount_due_jpy integer not null check(amount_due_jpy>=0),
  expires_at timestamptz not null,
  confirmed_order_id uuid unique references public.orders(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.order_quotes enable row level security;
revoke all on public.order_quotes from public,anon,authenticated;
grant select on public.order_quotes to authenticated;
grant all on public.order_quotes to service_role;
drop policy if exists order_quotes_owner_ops on public.order_quotes;
create policy order_quotes_owner_ops on public.order_quotes for select to authenticated using(account_id=auth.uid() or public.is_operations());
alter table public.orders add column if not exists quote_id uuid unique references public.order_quotes(id);
alter table public.order_snapshots add column if not exists quote_id uuid;

create or replace function public.create_order_quote(p_account uuid,p_departure uuid,p_seats integer,p_coupon uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.departures%rowtype;t public.trips%rowtype;c public.discount_coupons%rowtype;v_id uuid;v_gross integer;v_discount integer:=0;v_percent integer:=0;v_source text;v_rules text;v_revision uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_account is null or p_seats<1 then raise exception 'invalid quote request'; end if;
  select dep.* into d from public.departures dep where dep.id=p_departure;
  if not found or not public.is_departure_sellable(p_departure,now()) then return null; end if;
  select tr.* into t from public.trips tr where tr.id=d.trip_id;
  v_revision:=t.current_published_revision_id;v_gross:=d.seat_price_jpy*p_seats;
  if p_coupon is not null then
    select dc.* into c from public.discount_coupons dc where dc.id=p_coupon and dc.account_id=p_account;
    if not found or c.status<>'active' or c.expires_at<=now() or c.max_discounted_seats<>1 then return null; end if;
    v_percent:=c.discount_percent;v_source:=c.source_type;v_rules:=c.rules_version;
    v_discount:=floor((d.seat_price_jpy::numeric*v_percent/100)+0.5)::integer;
  end if;
  insert into public.order_quotes(account_id,departure_id,departure_version,product_revision_id,seat_count,unit_price_jpy,base_fare_jpy,coupon_id,coupon_source_type,coupon_rules_version,discount_percent,discounted_seats,discount_amount_jpy,amount_due_jpy,expires_at)
    values(p_account,d.id,d.schedule_version,v_revision,p_seats,d.seat_price_jpy,v_gross,p_coupon,v_source,v_rules,v_percent,case when p_coupon is null then 0 else 1 end,v_discount,v_gross-v_discount,now()+interval '10 minutes') returning id into v_id;
  return jsonb_build_object('quoteId',v_id,'version','single-seat-v1','currency','JPY','seatCount',p_seats,'unitPrice',d.seat_price_jpy,'baseFare',v_gross,'addOnTotal',0,'couponId',p_coupon,'couponSource',v_source,'discountPercent',v_percent,'discountedSeats',case when p_coupon is null then 0 else 1 end,'discountAmount',v_discount,'amountDue',v_gross-v_discount,'expiresAt',now()+interval '10 minutes');
end$$;

create or replace function public.apply_order_quote(p_account uuid,p_order uuid,p_quote uuid)
returns table(amount integer,gross_amount integer,discount_amount integer,discount_percent integer,discounted_seats integer,discounted_unit_price integer,source_type text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;q public.order_quotes%rowtype;c public.discount_coupons%rowtype;d public.departures%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  select ord.* into o from public.orders ord where ord.id=p_order and ord.account_id=p_account for update;
  select oq.* into q from public.order_quotes oq where oq.id=p_quote and oq.account_id=p_account for update;
  if o.id is null or q.id is null or o.status<>'pending_payment' or q.expires_at<=now() or q.confirmed_order_id is not null and q.confirmed_order_id<>p_order or o.departure_id<>q.departure_id or o.seat_count<>q.seat_count then return; end if;
  if q.confirmed_order_id=p_order and o.quote_id=q.id then
    return query select q.amount_due_jpy,q.base_fare_jpy,q.discount_amount_jpy,q.discount_percent,q.discounted_seats,q.unit_price_jpy,q.coupon_source_type;
    return;
  end if;
  select dep.* into d from public.departures dep where dep.id=o.departure_id;
  if d.status<>'open' or d.schedule_version<>q.departure_version or d.seat_price_jpy<>q.unit_price_jpy or not public.is_departure_sellable(d.id,now()) then return; end if;
  if q.coupon_id is not null then
    select dc.* into c from public.discount_coupons dc where dc.id=q.coupon_id for update;
    if c.id is null or c.account_id<>p_account or c.status<>'active' or c.expires_at<=now() then return; end if;
    update public.discount_coupons dc set status='reserved',reserved_order_id=p_order where dc.id=c.id and dc.status='active';
    if not found then return; end if;
  end if;
  update public.order_quotes oq set confirmed_order_id=p_order,confirmed_at=now() where oq.id=q.id and oq.confirmed_order_id is null;
  update public.orders ord set quote_id=q.id,gross_amount=q.base_fare_jpy,discount_amount=q.discount_amount_jpy,discount_coupon_id=q.coupon_id,amount=q.amount_due_jpy,discounted_seats=nullif(q.discounted_seats,0),discounted_unit_price_jpy=case when q.coupon_id is null then null else q.unit_price_jpy end,coupon_source_type=q.coupon_source_type,coupon_rules_version=q.coupon_rules_version,updated_at=now() where ord.id=o.id;
  return query select q.amount_due_jpy,q.base_fare_jpy,q.discount_amount_jpy,q.discount_percent,q.discounted_seats,q.unit_price_jpy,q.coupon_source_type;
end$$;

revoke all on function public.create_order_quote(uuid,uuid,integer,uuid),public.apply_order_quote(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_order_quote(uuid,uuid,integer,uuid),public.apply_order_quote(uuid,uuid,uuid) to service_role;

commit;
