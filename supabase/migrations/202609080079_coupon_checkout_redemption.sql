begin;

alter table public.discount_coupons drop constraint if exists discount_coupons_status_check;
alter table public.discount_coupons add constraint discount_coupons_status_check check(status in ('active','reserved','redeemed','expired','void'));
alter table public.discount_coupons add column if not exists reserved_order_id uuid unique references public.orders(id);
alter table public.orders add column if not exists gross_amount integer check(gross_amount is null or gross_amount>=0);
alter table public.orders add column if not exists discount_amount integer check(discount_amount is null or discount_amount>=0);
alter table public.orders add column if not exists discount_coupon_id uuid unique references public.discount_coupons(id);

create or replace function public.price_order_with_coupon(p_account uuid,p_order uuid,p_coupon uuid,p_expected_gross integer)
returns table(amount integer,gross_amount integer,discount_amount integer,discount_percent integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_coupon public.discount_coupons%rowtype;v_gross bigint;v_discount integer;v_amount integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  select * into v_order from public.orders where id=p_order and account_id=p_account for update;
  if not found or v_order.status<>'pending_payment' then return; end if;
  select d.seat_price_jpy::bigint*v_order.seat_count into v_gross from public.departures d where d.id=v_order.departure_id and d.status='open';
  if v_gross is null or v_gross<>p_expected_gross or v_gross>2147483647 then return; end if;
  if v_order.discount_coupon_id is not null then
    select * into v_coupon from public.discount_coupons where id=v_order.discount_coupon_id;
    if v_coupon.id is null or v_coupon.reserved_order_id<>p_order then return; end if;
  else
    select * into v_coupon from public.discount_coupons where id=p_coupon for update;
    if not found or v_coupon.account_id<>p_account or v_coupon.status<>'active' or v_coupon.expires_at<=now() then return; end if;
  end if;
  v_discount:=round(v_gross*v_coupon.discount_percent/100.0);
  v_amount:=v_gross::integer-v_discount;
  if v_amount<1 then return; end if;
  update public.discount_coupons set status='reserved',reserved_order_id=p_order where id=v_coupon.id and (status='active' or reserved_order_id=p_order);
  update public.orders set gross_amount=v_gross::integer,discount_amount=v_discount,discount_coupon_id=v_coupon.id,amount=v_amount,updated_at=now() where id=p_order;
  return query select v_amount,v_gross::integer,v_discount,v_coupon.discount_percent;
end$$;

create or replace function public.release_or_redeem_order_coupon() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.discount_coupon_id is null then return new; end if;
  if new.status in ('paid','confirmed','payment_review') and old.status is distinct from new.status then
    update public.discount_coupons set status='redeemed',redeemed_at=coalesce(redeemed_at,now()) where id=new.discount_coupon_id and reserved_order_id=new.id and status='reserved';
  elsif new.status in ('cancelled','expired') and old.status is distinct from new.status then
    update public.discount_coupons set status=case when expires_at>now() then 'active' else 'expired' end,reserved_order_id=null where id=new.discount_coupon_id and reserved_order_id=new.id and status='reserved';
    new.discount_coupon_id:=null;new.discount_amount:=null;new.gross_amount:=null;new.amount:=null;
  end if;
  return new;
end$$;
drop trigger if exists release_or_redeem_order_coupon_trigger on public.orders;
create trigger release_or_redeem_order_coupon_trigger before update of status on public.orders for each row execute function public.release_or_redeem_order_coupon();

create or replace function public.record_stripe_payment_intent(p_order uuid,p_payment_intent text,p_amount integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_expected bigint;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_payment_intent!~'^pi_' or p_amount<=0 then raise exception 'invalid payment intent'; end if;
  select coalesce(o.amount,d.seat_price_jpy::bigint*o.seat_count) into v_expected from public.orders o join public.departures d on d.id=o.departure_id where o.id=p_order for update of o;
  if v_expected is null or v_expected<>p_amount then return false; end if;
  update public.orders set payment_intent_id=p_payment_intent,amount=p_amount,updated_at=now() where id=p_order and status='pending_payment' and payment_intent_id is null;
  if found then return true; end if;
  return exists(select 1 from public.orders where id=p_order and status='pending_payment' and payment_intent_id=p_payment_intent and amount=p_amount);
end$$;

create or replace function public.mark_bank_transfer_pending(p_order uuid,p_amount integer)
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_expected bigint;v_departs_at timestamptz;v_due timestamptz;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_amount<=0 then raise exception 'invalid bank transfer amount'; end if;
  select * into v_order from public.orders where id=p_order for update;
  if v_order.id is null then return null; end if;
  select coalesce(v_order.amount,d.seat_price_jpy::bigint*v_order.seat_count),d.departs_at into v_expected,v_departs_at from public.departures d where d.id=v_order.departure_id;
  if v_expected is null or v_expected<>p_amount then return null; end if;
  if v_order.status='pending_manual_review' then if v_order.amount is distinct from p_amount or v_order.manual_payment_due_at<=now() then return null; end if;return v_order.manual_payment_due_at;end if;
  if v_order.status<>'pending_payment' then return null; end if;
  v_due:=least(now()+interval '24 hours',v_departs_at-interval '2 hours');if v_due<=now() then return null;end if;
  update public.orders set status='pending_manual_review',amount=p_amount,manual_payment_due_at=v_due,updated_at=now() where id=p_order;
  update public.inventory_locks set expires_at=v_due where order_id=p_order and status='held' and expires_at>now();if not found then raise exception 'active inventory hold required';end if;
  insert into public.fulfilment_work_items(order_id,departure_id,kind,status,source_event_id) values(p_order,v_order.departure_id,'manual_payment_review','pending','bank-transfer:'||p_order::text) on conflict(order_id,kind,source_event_id) do nothing;
  insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status) values('bank-transfer-pending:'||p_order::text,'bank-transfer-pending',v_order.account_id,p_order,true,jsonb_build_object('orderId',p_order,'paymentDueAt',v_due),'pending') on conflict(event_id) do nothing;
  return v_due;
end$$;

revoke all on function public.price_order_with_coupon(uuid,uuid,uuid,integer),public.record_stripe_payment_intent(uuid,text,integer),public.mark_bank_transfer_pending(uuid,integer) from public,anon,authenticated;
grant execute on function public.price_order_with_coupon(uuid,uuid,uuid,integer),public.record_stripe_payment_intent(uuid,text,integer),public.mark_bank_transfer_pending(uuid,integer) to service_role;

commit;
