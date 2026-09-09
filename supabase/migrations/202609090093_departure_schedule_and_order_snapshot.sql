begin;

alter table public.departures add column if not exists schedule_version integer not null default 1 check(schedule_version>0);
alter table public.departures add column if not exists service_date date generated always as ((departs_at at time zone 'Asia/Tokyo')::date) stored;

create table if not exists public.departure_batch_operations(
  operation_id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  request_digest text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.departure_batch_operations enable row level security;
revoke all on public.departure_batch_operations from public,anon,authenticated;
grant select on public.departure_batch_operations to authenticated;
grant all on public.departure_batch_operations to service_role;
create policy departure_batch_operations_ops on public.departure_batch_operations for select to authenticated using(public.is_operations());

create table if not exists public.order_snapshots(
  order_id uuid primary key references public.orders(id) on delete restrict,
  trip_id uuid not null references public.trips(id),
  product_revision_id uuid references public.product_revisions(id),
  departure_id uuid not null references public.departures(id),
  departure_version integer not null,
  title text not null,
  departs_at timestamptz not null,
  meeting_name text,
  meeting_address text,
  seat_count integer not null,
  unit_price_jpy integer not null,
  gross_amount_jpy integer not null,
  paid_amount_jpy integer not null,
  cancellation_policy text,
  captured_at timestamptz not null default now()
);
alter table public.order_snapshots enable row level security;
revoke all on public.order_snapshots from public,anon,authenticated;
grant select on public.order_snapshots to authenticated;
grant all on public.order_snapshots to service_role;
create policy order_snapshot_owner_ops on public.order_snapshots for select to authenticated using(public.is_operations() or exists(select 1 from public.orders o where o.id=order_id and o.account_id=auth.uid()));

create or replace function public.capture_paid_order_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    insert into public.order_snapshots(order_id,trip_id,product_revision_id,departure_id,departure_version,title,departs_at,meeting_name,meeting_address,seat_count,unit_price_jpy,gross_amount_jpy,paid_amount_jpy,cancellation_policy)
    select new.id,d.trip_id,t.current_published_revision_id,d.id,d.schedule_version,t.title,d.departs_at,d.meeting_name,d.meeting_address,new.seat_count,d.seat_price_jpy,d.seat_price_jpy*new.seat_count,coalesce(new.amount,d.seat_price_jpy*new.seat_count),t.content->>'cancellationPolicy'
    from public.departures d join public.trips t on t.id=d.trip_id where d.id=new.departure_id
    on conflict(order_id) do nothing;
  end if;
  return new;
end$$;
drop trigger if exists capture_paid_order_snapshot_trigger on public.orders;
create trigger capture_paid_order_snapshot_trigger after update of status on public.orders for each row execute function public.capture_paid_order_snapshot();

create or replace function public.operations_preview_departure_batch(p_trip uuid,p_start date,p_end date,p_weekdays integer[],p_departure_time time,p_duration_minutes integer,p_price integer,p_capacity integer,p_sales_open timestamptz,p_close_hours integer,p_meeting_name text,p_meeting_address text,p_map_lat numeric,p_map_lng numeric)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if p_start>p_end or p_end-p_start>93 or p_duration_minutes not between 60 and 1440 or p_price<1 or p_capacity<1 or p_close_hours<1 or length(trim(coalesce(p_meeting_name,'')))<2 or length(trim(coalesce(p_meeting_address,'')))<5 or p_map_lat not between -90 and 90 or p_map_lng not between -180 and 180 then raise exception 'departure product incomplete'; end if;
  select jsonb_agg(jsonb_build_object('serviceDate',day::date,'departsAt',(((day::date)+p_departure_time) at time zone 'Asia/Tokyo'),'endsAt',(((day::date)+p_departure_time+make_interval(mins=>p_duration_minutes)) at time zone 'Asia/Tokyo'),'price',p_price,'capacity',p_capacity,'duplicate',exists(select 1 from public.departures d where d.trip_id=p_trip and d.departs_at=(((day::date)+p_departure_time) at time zone 'Asia/Tokyo')) ) order by day)
  into result from generate_series(p_start,p_end,interval '1 day') day where extract(isodow from day)::integer=any(p_weekdays);
  return coalesce(result,'[]'::jsonb);
end$$;

create or replace function public.operations_create_departure_batch(p_operation uuid,p_trip uuid,p_start date,p_end date,p_weekdays integer[],p_departure_time time,p_duration_minutes integer,p_price integer,p_capacity integer,p_sales_open timestamptz,p_close_hours integer,p_meeting_name text,p_meeting_address text,p_map_lat numeric,p_map_lng numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare digest text;existing jsonb;created integer:=0;skipped integer:=0;day date;depart_at timestamptz;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  digest:=md5(concat_ws('|',p_trip,p_start,p_end,p_weekdays,p_departure_time,p_duration_minutes,p_price,p_capacity,p_sales_open,p_close_hours,p_meeting_name,p_meeting_address,p_map_lat,p_map_lng));
  select result into existing from public.departure_batch_operations where operation_id=p_operation and actor_id=auth.uid() and request_digest=digest;
  if found then return existing; end if;
  if exists(select 1 from public.departure_batch_operations where operation_id=p_operation) then raise exception 'operation id mismatch'; end if;
  perform public.operations_preview_departure_batch(p_trip,p_start,p_end,p_weekdays,p_departure_time,p_duration_minutes,p_price,p_capacity,p_sales_open,p_close_hours,p_meeting_name,p_meeting_address,p_map_lat,p_map_lng);
  for day in select value::date from generate_series(p_start,p_end,interval '1 day') value where extract(isodow from value)::integer=any(p_weekdays) loop
    depart_at:=((day+p_departure_time) at time zone 'Asia/Tokyo');
    if exists(select 1 from public.departures d where d.trip_id=p_trip and d.departs_at=depart_at) then skipped:=skipped+1;continue;end if;
    insert into public.departures(trip_id,departs_at,ends_at,capacity,status,seat_price_jpy,sales_open_at,sales_close_at,booking_closes_at,chat_opens_at,minimum_guests,currency,tax_included,meeting_name,meeting_address,map_lat,map_lng)
    values(p_trip,depart_at,depart_at+make_interval(mins=>p_duration_minutes),p_capacity,'open',p_price,p_sales_open,depart_at-make_interval(hours=>p_close_hours),depart_at-make_interval(hours=>p_close_hours),depart_at-interval '21 hours',1,'JPY',true,trim(p_meeting_name),trim(p_meeting_address),p_map_lat,p_map_lng);created:=created+1;
  end loop;
  existing:=jsonb_build_object('created',created,'skippedDuplicates',skipped);
  insert into public.departure_batch_operations(operation_id,actor_id,request_digest,result) values(p_operation,auth.uid(),digest,existing);
  return existing;
end$$;

create or replace function public.operations_update_departure(p_departure uuid,p_expected_version integer,p_price integer,p_capacity integer,p_sales_open timestamptz,p_sales_close timestamptz,p_status text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.departures%rowtype;committed integer;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into item from public.departures where id=p_departure for update;
  if not found or item.schedule_version<>p_expected_version then raise exception 'departure version conflict'; end if;
  select coalesce(sum(seats),0)::integer into committed from public.inventory_locks where departure_id=item.id and (status='committed' or (status='held' and expires_at>now()));
  if p_capacity<committed then raise exception 'capacity below committed inventory'; end if;
  if p_price<1 or p_sales_open>=p_sales_close or p_sales_close>=item.departs_at or p_status not in ('draft','open','closed','cancelled') then raise exception 'invalid departure update'; end if;
  update public.departures set seat_price_jpy=p_price,capacity=p_capacity,sales_open_at=p_sales_open,sales_close_at=p_sales_close,status=p_status,schedule_version=schedule_version+1,updated_at=now() where id=item.id;
  return item.schedule_version+1;
end$$;

revoke all on function public.capture_paid_order_snapshot(),public.operations_preview_departure_batch(uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,text,text,numeric,numeric),public.operations_create_departure_batch(uuid,uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,text,text,numeric,numeric),public.operations_update_departure(uuid,integer,integer,integer,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.operations_preview_departure_batch(uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,text,text,numeric,numeric),public.operations_create_departure_batch(uuid,uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,text,text,numeric,numeric),public.operations_update_departure(uuid,integer,integer,integer,timestamptz,timestamptz,text) to authenticated,service_role;

commit;
