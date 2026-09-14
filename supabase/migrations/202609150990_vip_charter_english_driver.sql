begin;

alter table public.vip_charter_requests
  add column english_driver boolean not null default false,
  add column english_driver_fee_jpy integer not null default 0 check (english_driver_fee_jpy in (0,5000));

-- Existing quotations and historical snapshots retain their original values.
create function public.quote_vip_charter_with_driver(
  p_departure uuid,p_passenger_count integer,p_vehicle_type text,p_english_driver boolean
) returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare q record; fee integer;
begin
  if p_english_driver is null then raise exception '请选择司机语言服务'; end if;
  fee:=case when p_english_driver then 5000 else 0 end;
  select * into strict q from public.quote_vip_charter(p_departure,p_passenger_count,p_vehicle_type);
  return next to_jsonb(q)||jsonb_build_object('english_driver',p_english_driver,
    'english_driver_fee_jpy',fee,'total_jpy',q.total_jpy+fee);
end $$;

create function public.submit_vip_charter_request_with_driver(
  p_departure uuid,p_passenger_count integer,p_vehicle_type text,p_pickup_ward text,p_pickup_address text,
  p_english_driver boolean,p_return_address text default null,p_special_requests text default null,p_idempotency_key text default null
) returns table(request_id uuid,status text,total_jpy integer,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.vip_charter_requests%rowtype; saved record; fee integer;
begin
  if auth.uid() is null then raise exception '请先登录后提交包车需求'; end if;
  if p_english_driver is null then raise exception '请选择司机语言服务'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception '提交标识无效'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||trim(p_idempotency_key),0));
  select * into previous from public.vip_charter_requests r
    where r.account_id=auth.uid() and r.idempotency_key=trim(p_idempotency_key);
  if previous.id is not null and previous.english_driver<>p_english_driver then
    raise exception '同一提交标识不能用于不同司机语言要求';
  end if;
  -- Reuse established authentication, date, capacity, address and snapshot validation.
  select * into strict saved from public.submit_vip_charter_request(
    p_departure,p_passenger_count,p_vehicle_type,p_pickup_ward,p_pickup_address,
    p_return_address,p_special_requests,p_idempotency_key);
  if previous.id is null then
    fee:=case when p_english_driver then 5000 else 0 end;
    update public.vip_charter_requests r set english_driver=p_english_driver,
      english_driver_fee_jpy=fee,total_jpy=r.total_jpy+fee where r.id=saved.request_id;
  end if;
  return query select r.id,r.status,r.total_jpy,r.created_at
    from public.vip_charter_requests r where r.id=saved.request_id;
end $$;

create function public.get_own_vip_charter_requests_with_driver()
returns setof jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select to_jsonb(q)||jsonb_build_object('english_driver',r.english_driver,'english_driver_fee_jpy',r.english_driver_fee_jpy)
  from public.get_own_vip_charter_requests() q join public.vip_charter_requests r on r.id=q.request_id
  where r.account_id=auth.uid() order by r.created_at desc
$$;

create function public.get_operations_vip_charter_requests_with_driver()
returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  return query select to_jsonb(q)||jsonb_build_object('english_driver',r.english_driver,'english_driver_fee_jpy',r.english_driver_fee_jpy)
    from public.get_operations_vip_charter_requests() q join public.vip_charter_requests r on r.id=q.request_id
    order by r.created_at desc;
end $$;

revoke all on function public.quote_vip_charter_with_driver(uuid,integer,text,boolean),
  public.submit_vip_charter_request_with_driver(uuid,integer,text,text,text,boolean,text,text,text),
  public.get_own_vip_charter_requests_with_driver(),public.get_operations_vip_charter_requests_with_driver() from public,anon,authenticated;
grant execute on function public.quote_vip_charter_with_driver(uuid,integer,text,boolean) to anon,authenticated,service_role;
grant execute on function public.submit_vip_charter_request_with_driver(uuid,integer,text,text,text,boolean,text,text,text),
  public.get_own_vip_charter_requests_with_driver(),public.get_operations_vip_charter_requests_with_driver() to authenticated,service_role;
notify pgrst,'reload schema';
commit;
