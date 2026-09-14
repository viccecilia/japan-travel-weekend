begin;

create table if not exists public.vip_charter_pricing_config(
  id boolean primary key default true check(id),
  alphard_factor integer not null default 6 check(alphard_factor>0),
  hiace_factor integer not null default 8 check(hiace_factor>0),
  pickup_fee_jpy integer not null default 2000 check(pickup_fee_jpy>=0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.vip_charter_pricing_config(id,alphard_factor,hiace_factor,pickup_fee_jpy)
values(true,6,8,2000) on conflict(id) do nothing;

create table if not exists public.vip_charter_requests(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id),
  departure_id uuid not null references public.departures(id),
  trip_id uuid not null references public.trips(id),
  service_date date not null,
  passenger_count integer not null check(passenger_count between 1 and 9),
  vehicle_type text not null check(vehicle_type in ('alphard','hiace')),
  base_seat_price_jpy integer not null check(base_seat_price_jpy>0),
  pricing_factor integer not null check(pricing_factor>0),
  pickup_fee_jpy integer not null check(pickup_fee_jpy>=0),
  total_jpy integer not null check(total_jpy>0),
  pickup_ward text not null,
  pickup_address text not null,
  return_address text,
  special_requests text,
  status text not null default 'pending_operations' check(status in ('pending_operations','reviewing','quoted','declined','cancelled')),
  idempotency_key text not null check(length(idempotency_key) between 8 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id,idempotency_key)
);
create index if not exists vip_charter_requests_account_created_idx on public.vip_charter_requests(account_id,created_at desc);
create index if not exists vip_charter_requests_status_created_idx on public.vip_charter_requests(status,created_at desc);

alter table public.vip_charter_pricing_config enable row level security;
alter table public.vip_charter_requests enable row level security;
revoke all on public.vip_charter_pricing_config,public.vip_charter_requests from public,anon,authenticated;
grant all on public.vip_charter_pricing_config,public.vip_charter_requests to service_role;
grant select on public.vip_charter_requests to authenticated;
drop policy if exists vip_charter_requests_own_read on public.vip_charter_requests;
create policy vip_charter_requests_own_read on public.vip_charter_requests for select to authenticated
using(account_id=auth.uid() or public.is_operations());

create or replace function public.list_vip_charter_route_prices(p_service_date date)
returns table(departure_id uuid,trip_id uuid,trip_slug text,trip_title text,departs_at timestamptz,base_seat_price_jpy integer,hero_image_url text,stops text[])
language sql stable security definer set search_path=public,pg_temp as $$
  select distinct on(t.id)
    d.id,t.id,t.slug,r.title,d.departs_at,d.seat_price_jpy,r.hero_image_url,
    case
      when jsonb_typeof(r.content->'stops')='array' then array(select jsonb_array_elements_text(r.content->'stops'))
      else array(select coalesce(item->>'title',item->>'name') from jsonb_array_elements(coalesce(r.content->'itinerary','[]'::jsonb)) item where coalesce(item->>'title',item->>'name') is not null)
    end
  from public.departures d
  join public.trips t on t.id=d.trip_id
  join public.product_revisions r on r.id=t.current_published_revision_id
  where (d.departs_at at time zone 'Asia/Tokyo')::date=p_service_date
    and public.is_departure_sellable(d.id,now())
  order by t.id,d.departs_at,d.id
$$;

create or replace function public.quote_vip_charter(p_departure uuid,p_passenger_count integer,p_vehicle_type text)
returns table(departure_id uuid,trip_id uuid,service_date date,vehicle_type text,base_seat_price_jpy integer,pricing_factor integer,pickup_fee_jpy integer,total_jpy integer)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare d public.departures%rowtype; c public.vip_charter_pricing_config%rowtype; factor integer;
begin
  if p_passenger_count not between 1 and 9 then raise exception '乘车人数必须为1至9人'; end if;
  if p_vehicle_type not in ('alphard','hiace') then raise exception '不支持的包车车型'; end if;
  if p_vehicle_type='alphard' and p_passenger_count>4 then raise exception '阿尔法最多乘坐4位游客'; end if;
  select * into d from public.departures where id=p_departure;
  if d.id is null or not public.is_departure_sellable(d.id,now()) then raise exception '所选日期当前没有可用的公开路线价格'; end if;
  select * into c from public.vip_charter_pricing_config where id=true;
  if c.id is null then raise exception '包车报价配置尚未完成'; end if;
  factor:=case when p_vehicle_type='alphard' then c.alphard_factor else c.hiace_factor end;
  return query select d.id,d.trip_id,(d.departs_at at time zone 'Asia/Tokyo')::date,p_vehicle_type,d.seat_price_jpy,factor,c.pickup_fee_jpy,d.seat_price_jpy*factor+c.pickup_fee_jpy;
end $$;

create or replace function public.submit_vip_charter_request(
  p_departure uuid,p_passenger_count integer,p_vehicle_type text,p_pickup_ward text,p_pickup_address text,
  p_return_address text default null,p_special_requests text default null,p_idempotency_key text default null
)
returns table(request_id uuid,status text,total_jpy integer,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare q record; existing public.vip_charter_requests%rowtype; new_id uuid; allowed_wards constant text[]:=array['北区','都島区','福島区','此花区','中央区','西区','港区','大正区','天王寺区','浪速区','西淀川区','淀川区','東淀川区','東成区','生野区','旭区','城東区','阿倍野区','住吉区','東住吉区','西成区','鶴見区','住之江区','平野区'];
begin
  if auth.uid() is null then raise exception '请先登录后提交包车需求'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception '提交标识无效'; end if;
  if not(trim(coalesce(p_pickup_ward,''))=any(allowed_wards)) then raise exception '接送地点必须位于大阪市内'; end if;
  if length(trim(coalesce(p_pickup_address,'')))<5 then raise exception '请填写完整的大阪市内接送地址'; end if;
  if length(coalesce(p_return_address,''))>300 or length(coalesce(p_special_requests,''))>1000 then raise exception '填写内容过长'; end if;
  select * into existing from public.vip_charter_requests where account_id=auth.uid() and idempotency_key=trim(p_idempotency_key);
  if existing.id is not null then
    if existing.departure_id<>p_departure or existing.passenger_count<>p_passenger_count or existing.vehicle_type<>p_vehicle_type
      or existing.pickup_ward<>trim(p_pickup_ward) or existing.pickup_address<>trim(p_pickup_address) then
      raise exception '同一提交标识不能用于不同包车需求';
    end if;
    return query select existing.id,existing.status,existing.total_jpy,existing.created_at; return;
  end if;
  select * into q from public.quote_vip_charter(p_departure,p_passenger_count,p_vehicle_type);
  insert into public.vip_charter_requests(account_id,departure_id,trip_id,service_date,passenger_count,vehicle_type,base_seat_price_jpy,pricing_factor,pickup_fee_jpy,total_jpy,pickup_ward,pickup_address,return_address,special_requests,idempotency_key)
  values(auth.uid(),q.departure_id,q.trip_id,q.service_date,p_passenger_count,q.vehicle_type,q.base_seat_price_jpy,q.pricing_factor,q.pickup_fee_jpy,q.total_jpy,trim(p_pickup_ward),trim(p_pickup_address),nullif(trim(coalesce(p_return_address,'')),''),nullif(trim(coalesce(p_special_requests,'')),''),trim(p_idempotency_key))
  returning id into new_id;
  return query select r.id,r.status,r.total_jpy,r.created_at from public.vip_charter_requests r where r.id=new_id;
end $$;

create or replace function public.get_own_vip_charter_requests()
returns table(request_id uuid,departure_id uuid,trip_id uuid,service_date date,passenger_count integer,vehicle_type text,base_seat_price_jpy integer,pricing_factor integer,pickup_fee_jpy integer,total_jpy integer,pickup_ward text,pickup_address text,return_address text,special_requests text,status text,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select r.id,r.departure_id,r.trip_id,r.service_date,r.passenger_count,r.vehicle_type,r.base_seat_price_jpy,r.pricing_factor,r.pickup_fee_jpy,r.total_jpy,r.pickup_ward,r.pickup_address,r.return_address,r.special_requests,r.status,r.created_at
  from public.vip_charter_requests r where r.account_id=auth.uid() order by r.created_at desc
$$;

create or replace function public.get_operations_vip_charter_requests()
returns table(request_id uuid,account_id uuid,departure_id uuid,trip_id uuid,trip_title text,service_date date,passenger_count integer,vehicle_type text,base_seat_price_jpy integer,pricing_factor integer,pickup_fee_jpy integer,total_jpy integer,pickup_ward text,pickup_address text,return_address text,special_requests text,status text,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select r.id,r.account_id,r.departure_id,r.trip_id,t.title,r.service_date,r.passenger_count,r.vehicle_type,r.base_seat_price_jpy,r.pricing_factor,r.pickup_fee_jpy,r.total_jpy,r.pickup_ward,r.pickup_address,r.return_address,r.special_requests,r.status,r.created_at
  from public.vip_charter_requests r join public.trips t on t.id=r.trip_id where public.is_operations() order by r.created_at desc
$$;

revoke all on function public.list_vip_charter_route_prices(date),public.quote_vip_charter(uuid,integer,text),public.submit_vip_charter_request(uuid,integer,text,text,text,text,text,text),public.get_own_vip_charter_requests(),public.get_operations_vip_charter_requests() from public;
grant execute on function public.list_vip_charter_route_prices(date),public.quote_vip_charter(uuid,integer,text) to anon,authenticated,service_role;
grant execute on function public.submit_vip_charter_request(uuid,integer,text,text,text,text,text,text),public.get_own_vip_charter_requests(),public.get_operations_vip_charter_requests() to authenticated,service_role;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  return query select '202609140146'::text,now() where public.is_operations();
end$$;
revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;

commit;
