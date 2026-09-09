begin;

alter table public.orders add column if not exists quoted_unit_price_jpy integer check(quoted_unit_price_jpy is null or quoted_unit_price_jpy>0);
alter table public.orders add column if not exists quoted_gross_amount_jpy integer check(quoted_gross_amount_jpy is null or quoted_gross_amount_jpy>=0);
alter table public.orders add column if not exists quoted_product_revision_id uuid references public.product_revisions(id);
alter table public.orders add column if not exists quoted_departure_version integer check(quoted_departure_version is null or quoted_departure_version>0);
alter table public.orders add column if not exists quoted_at timestamptz;

create or replace function public.capture_order_quote()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.departures%rowtype;revision_id uuid;
begin
  select * into d from public.departures where id=new.departure_id;
  if not found or d.seat_price_jpy is null then raise exception 'sellable departure not found'; end if;
  select current_published_revision_id into revision_id from public.trips where id=d.trip_id;
  new.quoted_unit_price_jpy:=d.seat_price_jpy;
  new.quoted_gross_amount_jpy:=d.seat_price_jpy*new.seat_count;
  new.quoted_product_revision_id:=revision_id;
  new.quoted_departure_version:=d.schedule_version;
  new.quoted_at:=now();
  return new;
end$$;
drop trigger if exists capture_order_quote_trigger on public.orders;
create trigger capture_order_quote_trigger before insert on public.orders for each row execute function public.capture_order_quote();

create or replace function public.capture_paid_order_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    insert into public.order_snapshots(order_id,trip_id,product_revision_id,departure_id,departure_version,title,departs_at,meeting_name,meeting_address,seat_count,unit_price_jpy,gross_amount_jpy,paid_amount_jpy,cancellation_policy)
    select new.id,d.trip_id,new.quoted_product_revision_id,d.id,coalesce(new.quoted_departure_version,d.schedule_version),coalesce(r.title,t.title),d.departs_at,d.meeting_name,d.meeting_address,new.seat_count,coalesce(new.quoted_unit_price_jpy,d.seat_price_jpy),coalesce(new.quoted_gross_amount_jpy,d.seat_price_jpy*new.seat_count),coalesce(new.amount,new.quoted_gross_amount_jpy,d.seat_price_jpy*new.seat_count),coalesce(r.content,t.content)->>'cancellationPolicy'
    from public.departures d join public.trips t on t.id=d.trip_id left join public.product_revisions r on r.id=new.quoted_product_revision_id where d.id=new.departure_id
    on conflict(order_id) do nothing;
  end if;
  return new;
end$$;

revoke all on function public.capture_order_quote(),public.capture_paid_order_snapshot() from public,anon,authenticated,service_role;

commit;
