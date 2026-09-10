begin;

create table if not exists public.checkout_attempts(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id),
  idempotency_key text not null,
  draft_id uuid references public.booking_drafts(id),
  departure_id uuid not null references public.departures(id),
  seat_count integer not null check(seat_count>0),
  payment_method text not null check(payment_method in ('card','bank_transfer','coupon_covered')),
  quote_id uuid references public.order_quotes(id),
  order_id uuid references public.orders(id),
  status text not null default 'started' check(status in ('started','reserved','requires_payment_action','pending_manual_review','confirmed_no_payment','paid','failed','superseded')),
  response_payload jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id,idempotency_key)
);
alter table public.checkout_attempts enable row level security;
revoke all on public.checkout_attempts from public,anon,authenticated;
grant all on public.checkout_attempts to service_role;

alter table public.order_quotes add column if not exists trip_id uuid references public.trips(id);
alter table public.order_quotes add column if not exists title text;
alter table public.order_quotes add column if not exists departs_at timestamptz;
alter table public.order_quotes add column if not exists meeting_name text;
alter table public.order_quotes add column if not exists meeting_address text;
alter table public.order_quotes add column if not exists cancellation_policy text;
alter table public.order_quotes add column if not exists cancellation_policy_version text;
alter table public.order_quotes add column if not exists commercial_terms jsonb;
alter table public.order_quotes add column if not exists line_items jsonb;
alter table public.orders add column if not exists quote_confirmed_at timestamptz;
alter table public.refund_operations add column if not exists actual_refund_amount integer check(actual_refund_amount is null or actual_refund_amount>=0);
alter table public.refund_operations add column if not exists completed_at timestamptz;

create or replace function public.begin_checkout_attempt(
  p_account uuid,p_key text,p_draft uuid,p_departure uuid,p_seats integer,p_method text,p_quote uuid
) returns table(attempt_id uuid,attempt_status text,attempt_order_id uuid,response_payload jsonb)
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.checkout_attempts%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_account is null or length(trim(coalesce(p_key,'')))<8 or p_departure is null or p_seats<1 or p_method not in ('card','bank_transfer','coupon_covered') then raise exception 'invalid checkout attempt'; end if;
  select x.* into a from public.checkout_attempts x where x.account_id=p_account and x.idempotency_key=trim(p_key) for update;
  if found then
    if a.draft_id is distinct from p_draft or a.departure_id<>p_departure or a.seat_count<>p_seats or a.payment_method<>p_method or a.quote_id is distinct from p_quote then raise exception 'checkout idempotency mismatch'; end if;
    return query select a.id,a.status,a.order_id,a.response_payload;return;
  end if;
  insert into public.checkout_attempts(account_id,idempotency_key,draft_id,departure_id,seat_count,payment_method,quote_id)
  values(p_account,trim(p_key),p_draft,p_departure,p_seats,p_method,p_quote) returning * into a;
  return query select a.id,a.status,a.order_id,a.response_payload;
end$$;

create or replace function public.record_checkout_attempt_result(
  p_attempt uuid,p_account uuid,p_order uuid,p_status text,p_response jsonb,p_error text default null
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.checkout_attempts%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  select x.* into a from public.checkout_attempts x where x.id=p_attempt and x.account_id=p_account for update;
  if not found then return false; end if;
  if a.order_id is not null and p_order is distinct from a.order_id then raise exception 'checkout order mismatch'; end if;
  if a.status in ('confirmed_no_payment','paid') and p_status not in (a.status,'paid') then return true; end if;
  update public.checkout_attempts set order_id=coalesce(order_id,p_order),status=p_status,response_payload=coalesce(p_response,response_payload),error_code=p_error,updated_at=now() where id=a.id;
  return true;
end$$;

create or replace function public.reserve_inventory_from_draft(p_draft uuid,p_account uuid,p_departure uuid,p_seats integer,p_key text,p_expires timestamptz)
returns table(order_id uuid,hold_id uuid) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_draft public.booking_drafts%rowtype;v_order uuid;v_hold uuid;v_existing public.orders%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_account is null or length(coalesce(p_key,''))<8 or p_expires<=now() then raise exception 'invalid draft checkout'; end if;
  select bd.* into v_draft from public.booking_drafts bd where bd.id=p_draft and bd.account_id=p_account for update;
  if not found then raise exception 'draft not found'; end if;
  if v_draft.departure_id<>p_departure or v_draft.seat_impact<>p_seats then raise exception 'draft checkout parameter mismatch'; end if;
  if not v_draft.accepted_cancellation or not v_draft.accepted_terms or v_draft.expires_at<=now() then raise exception 'draft not eligible'; end if;
  if v_draft.operational_review_status='unavailable' then raise exception 'assistance unavailable'; end if;
  if v_draft.converted_order_id is not null then
    select o.* into v_existing from public.orders o where o.id=v_draft.converted_order_id for update;
    if v_existing.status in ('cancelled','expired') and v_existing.payment_intent_id is null then
      update public.booking_drafts set status='payment_not_started',converted_order_id=null,converted_at=null,updated_at=now() where id=v_draft.id;
      v_draft.converted_order_id:=null;v_draft.status:='payment_not_started';
    else
      select il.id into v_hold from public.inventory_locks il where il.order_id=v_existing.id and il.idempotency_key=v_existing.idempotency_key;
      if v_existing.idempotency_key<>p_key or v_hold is null then raise exception 'draft conversion idempotency mismatch'; end if;
      return query select v_existing.id,v_hold;return;
    end if;
  end if;
  if v_draft.status<>'payment_not_started' then raise exception 'draft not eligible'; end if;
  select r.order_id,r.hold_id into v_order,v_hold from public.reserve_inventory(v_draft.departure_id,p_account,v_draft.seat_impact,p_key,p_expires) r;
  if v_order is null or v_hold is null then raise exception 'inventory reservation failed'; end if;
  update public.booking_drafts set status='converted',converted_order_id=v_order,converted_at=now(),updated_at=now() where id=v_draft.id;
  return query select v_order,v_hold;
end$$;

create or replace function public.create_order_quote(p_account uuid,p_departure uuid,p_seats integer,p_coupon uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.departures%rowtype;t public.trips%rowtype;r public.product_revisions%rowtype;c public.discount_coupons%rowtype;v_id uuid;v_gross integer;v_discount integer:=0;v_percent integer:=0;v_source text;v_rules text;v_revision uuid;v_terms jsonb;v_items jsonb;v_expires timestamptz:=now()+interval '10 minutes';
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_account is null or p_seats<1 then raise exception 'invalid quote request'; end if;
  select dep.* into d from public.departures dep where dep.id=p_departure;
  if not found or not public.is_departure_sellable(p_departure,now()) then return null; end if;
  select tr.* into t from public.trips tr where tr.id=d.trip_id;v_revision:=t.current_published_revision_id;
  if v_revision is not null then select pr.* into r from public.product_revisions pr where pr.id=v_revision and pr.state='published'; end if;
  v_gross:=d.seat_price_jpy*p_seats;
  if p_coupon is not null then
    select dc.* into c from public.discount_coupons dc where dc.id=p_coupon and dc.account_id=p_account;
    if not found or c.status<>'active' or c.expires_at<=now() or c.max_discounted_seats<>1 then return null; end if;
    v_percent:=c.discount_percent;v_source:=c.source_type;v_rules:=c.rules_version;v_discount:=floor((d.seat_price_jpy::numeric*v_percent/100)+0.5)::integer;
  end if;
  v_terms:=jsonb_build_object('currency',d.currency,'taxIncluded',d.tax_included,'included',coalesce(r.content,t.content)->'included','excluded',coalesce(r.content,t.content)->'excluded','childPolicy',coalesce(r.content,t.content)->>'childPolicy','luggagePolicy',coalesce(r.content,t.content)->>'luggagePolicy','weatherPolicy',coalesce(r.content,t.content)->>'weatherPolicy','mealInfo',coalesce(r.content,t.content)->>'mealInfo');
  v_items:=jsonb_build_array(jsonb_build_object('kind','base_fare','label',coalesce(r.title,t.title)||'座位费','quantity',p_seats,'unitPriceJpy',d.seat_price_jpy,'amountJpy',v_gross),jsonb_build_object('kind','coupon','label',case when p_coupon is null then '无优惠券' else '单席优惠券' end,'quantity',case when p_coupon is null then 0 else 1 end,'unitPriceJpy',d.seat_price_jpy,'amountJpy',-v_discount));
  insert into public.order_quotes(account_id,departure_id,departure_version,product_revision_id,seat_count,unit_price_jpy,base_fare_jpy,coupon_id,coupon_source_type,coupon_rules_version,discount_percent,discounted_seats,discount_amount_jpy,amount_due_jpy,expires_at,trip_id,title,departs_at,meeting_name,meeting_address,cancellation_policy,cancellation_policy_version,commercial_terms,line_items)
  values(p_account,d.id,d.schedule_version,v_revision,p_seats,d.seat_price_jpy,v_gross,p_coupon,v_source,v_rules,v_percent,case when p_coupon is null then 0 else 1 end,v_discount,v_gross-v_discount,v_expires,t.id,coalesce(r.title,t.title),d.departs_at,d.meeting_name,d.meeting_address,coalesce(r.content,t.content)->>'cancellationPolicy',coalesce(r.content,t.content)->>'cancellationPolicyVersion',v_terms,v_items) returning id into v_id;
  return jsonb_build_object('quoteId',v_id,'version','immutable-billing-v2','currency','JPY','seatCount',p_seats,'unitPrice',d.seat_price_jpy,'baseFare',v_gross,'addOnTotal',0,'couponId',p_coupon,'couponSource',v_source,'discountPercent',v_percent,'discountedSeats',case when p_coupon is null then 0 else 1 end,'discountAmount',v_discount,'amountDue',v_gross-v_discount,'expiresAt',v_expires);
end$$;

create or replace function public.apply_order_quote(p_account uuid,p_order uuid,p_quote uuid)
returns table(amount integer,gross_amount integer,discount_amount integer,discount_percent integer,discounted_seats integer,discounted_unit_price integer,source_type text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;q public.order_quotes%rowtype;c public.discount_coupons%rowtype;d public.departures%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  select ord.* into o from public.orders ord where ord.id=p_order and ord.account_id=p_account for update;
  select oq.* into q from public.order_quotes oq where oq.id=p_quote and oq.account_id=p_account for update;
  if o.id is null or q.id is null or o.status<>'pending_payment' or q.expires_at<=now() or (q.confirmed_order_id is not null and q.confirmed_order_id<>p_order) or o.departure_id<>q.departure_id or o.seat_count<>q.seat_count then return; end if;
  if q.confirmed_order_id=p_order and o.quote_id=q.id then return query select q.amount_due_jpy,q.base_fare_jpy,q.discount_amount_jpy,q.discount_percent,q.discounted_seats,q.unit_price_jpy,q.coupon_source_type;return; end if;
  select dep.* into d from public.departures dep where dep.id=o.departure_id;
  if d.status<>'open' or d.schedule_version<>q.departure_version or d.seat_price_jpy<>q.unit_price_jpy or not public.is_departure_sellable(d.id,now()) then return; end if;
  if q.product_revision_id is distinct from (select current_published_revision_id from public.trips where id=d.trip_id) then return; end if;
  if q.coupon_id is not null then
    select dc.* into c from public.discount_coupons dc where dc.id=q.coupon_id for update;
    if c.id is null or c.account_id<>p_account or c.status<>'active' or c.expires_at<=now() then return; end if;
    update public.discount_coupons set status='reserved',reserved_order_id=p_order where id=c.id and status='active';if not found then return;end if;
  end if;
  update public.order_quotes set confirmed_order_id=p_order,confirmed_at=now() where id=q.id and confirmed_order_id is null;
  update public.orders set quote_id=q.id,quote_confirmed_at=now(),quoted_product_revision_id=q.product_revision_id,quoted_departure_version=q.departure_version,quoted_unit_price_jpy=q.unit_price_jpy,quoted_gross_amount_jpy=q.base_fare_jpy,gross_amount=q.base_fare_jpy,discount_amount=q.discount_amount_jpy,discount_coupon_id=q.coupon_id,amount=q.amount_due_jpy,discounted_seats=nullif(q.discounted_seats,0),discounted_unit_price_jpy=case when q.coupon_id is null then null else q.unit_price_jpy end,coupon_source_type=q.coupon_source_type,coupon_rules_version=q.coupon_rules_version,updated_at=now() where id=o.id;
  return query select q.amount_due_jpy,q.base_fare_jpy,q.discount_amount_jpy,q.discount_percent,q.discounted_seats,q.unit_price_jpy,q.coupon_source_type;
end$$;

create or replace function public.capture_paid_order_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    insert into public.order_snapshots(order_id,trip_id,product_revision_id,departure_id,departure_version,title,departs_at,meeting_name,meeting_address,seat_count,unit_price_jpy,gross_amount_jpy,paid_amount_jpy,cancellation_policy,cancellation_policy_version,commercial_terms,source_kind,line_items,coupon_id,coupon_source_type,coupon_rules_version,discount_percent,discounted_seats,discounted_unit_price_jpy,discount_amount_jpy,payment_kind,payment_status_text,user_confirmed_at,quote_id)
    select new.id,q.trip_id,q.product_revision_id,q.departure_id,q.departure_version,q.title,q.departs_at,q.meeting_name,q.meeting_address,q.seat_count,q.unit_price_jpy,q.base_fare_jpy,new.amount,q.cancellation_policy,q.cancellation_policy_version,q.commercial_terms,'captured',q.line_items,q.coupon_id,q.coupon_source_type,q.coupon_rules_version,q.discount_percent,nullif(q.discounted_seats,0),case when q.coupon_id is null then null else q.unit_price_jpy end,q.discount_amount_jpy,new.payment_kind,new.payment_status_text,coalesce(new.quote_confirmed_at,q.confirmed_at),q.id
    from public.order_quotes q where q.id=new.quote_id
    on conflict(order_id) do nothing;
  end if;return new;
end$$;

create or replace function public.get_own_order_billing(p_order uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.order_snapshots%rowtype;o public.orders%rowtype;v_refunds jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select x.* into o from public.orders x where x.id=p_order and (x.account_id=auth.uid() or public.is_operations());if not found then raise exception 'order unavailable';end if;
  select x.* into s from public.order_snapshots x where x.order_id=p_order;
  select coalesce(jsonb_agg(jsonb_build_object('status',r.status,'amountJpy',r.actual_refund_amount,'completedAt',r.completed_at,'channel',r.channel) order by r.created_at),'[]'::jsonb) into v_refunds from public.refund_operations r where r.order_id=p_order;
  return jsonb_build_object('orderId',o.id,'status',o.status,'currency',o.currency,'amountPaidJpy',coalesce(s.paid_amount_jpy,o.amount),'grossAmountJpy',coalesce(s.gross_amount_jpy,o.gross_amount),'discountAmountJpy',coalesce(s.discount_amount_jpy,o.discount_amount,0),'lineItems',coalesce(s.line_items,'[]'::jsonb),'paymentKind',coalesce(s.payment_kind,o.payment_kind),'paymentStatus',coalesce(s.payment_status_text,o.payment_status_text),'userConfirmedAt',s.user_confirmed_at,'title',s.title,'departsAt',s.departs_at,'meetingName',s.meeting_name,'meetingAddress',s.meeting_address,'cancellationPolicy',s.cancellation_policy,'cancellationPolicyVersion',s.cancellation_policy_version,'refunds',v_refunds,'snapshotAvailable',s.order_id is not null);
end$$;

revoke all on function public.begin_checkout_attempt(uuid,text,uuid,uuid,integer,text,uuid),public.record_checkout_attempt_result(uuid,uuid,uuid,text,jsonb,text),public.get_own_order_billing(uuid) from public,anon;
grant execute on function public.begin_checkout_attempt(uuid,text,uuid,uuid,integer,text,uuid),public.record_checkout_attempt_result(uuid,uuid,uuid,text,jsonb,text) to service_role;
grant execute on function public.get_own_order_billing(uuid) to authenticated,service_role;

commit;
