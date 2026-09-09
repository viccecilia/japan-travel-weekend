begin;

alter table public.discount_coupons drop constraint if exists discount_coupons_discount_percent_check;
alter table public.discount_coupons add constraint discount_coupons_discount_percent_check check(discount_percent in (10,30,50,100));
alter table public.discount_coupons alter column referral_relationship_id drop not null;
alter table public.discount_coupons alter column recipient_kind drop not null;
alter table public.discount_coupons add column if not exists source_type text not null default 'referral' check(source_type in ('referral','link_campaign','manual_service_recovery'));
alter table public.discount_coupons add column if not exists source_id text;
alter table public.discount_coupons add column if not exists rules_version text not null default 'referral-v1';
alter table public.discount_coupons add column if not exists max_discounted_seats integer not null default 1 check(max_discounted_seats=1);
alter table public.discount_coupons add column if not exists issued_at timestamptz not null default now();

alter table public.orders add column if not exists discounted_seats integer check(discounted_seats is null or discounted_seats=1);
alter table public.orders add column if not exists discounted_unit_price_jpy integer check(discounted_unit_price_jpy is null or discounted_unit_price_jpy>=0);
alter table public.orders add column if not exists coupon_source_type text;
alter table public.orders add column if not exists coupon_rules_version text;
alter table public.orders add column if not exists payment_kind text check(payment_kind is null or payment_kind in ('stripe','bank_transfer','coupon_covered'));
alter table public.orders add column if not exists payment_status_text text check(payment_status_text is null or payment_status_text in ('not_required','pending','processing','succeeded','failed'));

alter table public.order_snapshots add column if not exists line_items jsonb;
alter table public.order_snapshots add column if not exists coupon_id uuid;
alter table public.order_snapshots add column if not exists coupon_source_type text;
alter table public.order_snapshots add column if not exists coupon_rules_version text;
alter table public.order_snapshots add column if not exists discount_percent integer;
alter table public.order_snapshots add column if not exists discounted_seats integer;
alter table public.order_snapshots add column if not exists discounted_unit_price_jpy integer;
alter table public.order_snapshots add column if not exists discount_amount_jpy integer;
alter table public.order_snapshots add column if not exists payment_kind text;
alter table public.order_snapshots add column if not exists payment_status_text text;
alter table public.order_snapshots add column if not exists user_confirmed_at timestamptz;

drop function if exists public.price_order_with_coupon(uuid,uuid,uuid,integer);
create function public.price_order_with_coupon(p_account uuid,p_order uuid,p_coupon uuid,p_expected_gross integer)
returns table(amount integer,gross_amount integer,discount_amount integer,discount_percent integer,discounted_seats integer,discounted_unit_price integer,source_type text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_coupon public.discount_coupons%rowtype;v_gross integer;v_unit integer;v_discount integer;v_amount integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  select o.* into v_order from public.orders o where o.id=p_order and o.account_id=p_account for update;
  if not found or v_order.status<>'pending_payment' then return; end if;
  v_unit:=v_order.quoted_unit_price_jpy;
  v_gross:=v_order.quoted_gross_amount_jpy;
  if v_unit is null or v_gross is null or v_gross<>p_expected_gross or v_gross<>v_unit*v_order.seat_count then return; end if;
  if v_order.discount_coupon_id is not null then
    select c.* into v_coupon from public.discount_coupons c where c.id=v_order.discount_coupon_id for update;
    if v_coupon.id is null or v_coupon.reserved_order_id<>p_order then return; end if;
  else
    select c.* into v_coupon from public.discount_coupons c where c.id=p_coupon for update;
    if not found or v_coupon.account_id<>p_account or v_coupon.status<>'active' or v_coupon.expires_at<=now() or v_coupon.max_discounted_seats<>1 then return; end if;
  end if;
  v_discount:=floor((v_unit::numeric*v_coupon.discount_percent/100)+0.5)::integer;
  v_amount:=v_gross-v_discount;
  if v_amount<0 then return; end if;
  update public.discount_coupons c set status='reserved',reserved_order_id=p_order where c.id=v_coupon.id and (c.status='active' or c.reserved_order_id=p_order);
  if not found then return; end if;
  update public.orders o set gross_amount=v_gross,discount_amount=v_discount,discount_coupon_id=v_coupon.id,amount=v_amount,discounted_seats=1,discounted_unit_price_jpy=v_unit,coupon_source_type=v_coupon.source_type,coupon_rules_version=v_coupon.rules_version,updated_at=now() where o.id=p_order;
  return query select v_amount,v_gross,v_discount,v_coupon.discount_percent,1,v_unit,v_coupon.source_type;
end$$;

create or replace function public.confirm_coupon_covered_order(p_account uuid,p_order uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  select o.* into v_order from public.orders o where o.id=p_order and o.account_id=p_account for update;
  if not found then return false; end if;
  if v_order.status='confirmed' and v_order.payment_kind='coupon_covered' and v_order.amount=0 then return true; end if;
  if v_order.status<>'pending_payment' or v_order.amount<>0 or v_order.discount_coupon_id is null then return false; end if;
  if not exists(select 1 from public.discount_coupons c where c.id=v_order.discount_coupon_id and c.account_id=p_account and c.status='reserved' and c.reserved_order_id=p_order) then return false; end if;
  update public.inventory_locks il set status='committed' where il.order_id=p_order and il.status='held' and il.expires_at>now();
  if not found then return false; end if;
  update public.orders o set status='confirmed',payment_kind='coupon_covered',payment_status_text='not_required',updated_at=now() where o.id=p_order;
  return true;
end$$;

create or replace function public.capture_paid_order_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    insert into public.order_snapshots(order_id,trip_id,product_revision_id,departure_id,departure_version,title,departs_at,meeting_name,meeting_address,seat_count,unit_price_jpy,gross_amount_jpy,paid_amount_jpy,cancellation_policy,line_items,coupon_id,coupon_source_type,coupon_rules_version,discount_percent,discounted_seats,discounted_unit_price_jpy,discount_amount_jpy,payment_kind,payment_status_text,user_confirmed_at)
    select new.id,d.trip_id,new.quoted_product_revision_id,d.id,coalesce(new.quoted_departure_version,d.schedule_version),coalesce(r.title,t.title),d.departs_at,d.meeting_name,d.meeting_address,new.seat_count,coalesce(new.quoted_unit_price_jpy,d.seat_price_jpy),coalesce(new.quoted_gross_amount_jpy,d.seat_price_jpy*new.seat_count),coalesce(new.amount,new.quoted_gross_amount_jpy,d.seat_price_jpy*new.seat_count),coalesce(r.content,t.content)->>'cancellationPolicy',
      jsonb_build_array(jsonb_build_object('kind','base_fare','label',coalesce(r.title,t.title)||'座位费','quantity',new.seat_count,'unitPriceJpy',coalesce(new.quoted_unit_price_jpy,d.seat_price_jpy),'amountJpy',coalesce(new.quoted_gross_amount_jpy,d.seat_price_jpy*new.seat_count)),jsonb_build_object('kind','coupon','label',case when new.discount_coupon_id is null then '无优惠券' else '单席优惠券' end,'quantity',coalesce(new.discounted_seats,0),'unitPriceJpy',coalesce(new.discounted_unit_price_jpy,0),'amountJpy',-coalesce(new.discount_amount,0))),
      new.discount_coupon_id,new.coupon_source_type,new.coupon_rules_version,c.discount_percent,new.discounted_seats,new.discounted_unit_price_jpy,coalesce(new.discount_amount,0),new.payment_kind,new.payment_status_text,now()
    from public.departures d join public.trips t on t.id=d.trip_id left join public.product_revisions r on r.id=new.quoted_product_revision_id left join public.discount_coupons c on c.id=new.discount_coupon_id where d.id=new.departure_id
    on conflict(order_id) do nothing;
  end if;
  return new;
end$$;

revoke all on function public.price_order_with_coupon(uuid,uuid,uuid,integer),public.confirm_coupon_covered_order(uuid,uuid),public.capture_paid_order_snapshot() from public,anon,authenticated;
grant execute on function public.price_order_with_coupon(uuid,uuid,uuid,integer),public.confirm_coupon_covered_order(uuid,uuid) to service_role;

commit;
