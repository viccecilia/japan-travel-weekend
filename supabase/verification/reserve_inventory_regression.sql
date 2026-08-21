-- 远程测试专用：需要至少一个虚构 profile；全部写入在事务末尾回滚。
begin;
do $$
declare
  v_account uuid;
  v_trip uuid;
  v_departure uuid;
  v_closed_departure uuid;
  v_expires timestamptz:=date_trunc('second',now()+interval '30 minutes');
  v_prefix text:='inventory-regression-'||txid_current()::text||'-';
  v_first_order_id uuid;
  v_first_hold_id uuid;
  v_retry record;
  v_result record;
  v_rejected boolean;
begin
  select prof.id into v_account from public.profiles as prof order by prof.created_at limit 1;
  if v_account is null then raise exception 'SETUP FAIL: create one fictional profile before running inventory regression'; end if;

  insert into public.trips as tr(slug,title,status) values(v_prefix||'trip','Inventory regression','draft') returning tr.id into v_trip;
  insert into public.departures as dep(trip_id,capacity,status) values(v_trip,6,'open') returning dep.id into v_departure;
  insert into public.departures as dep(trip_id,capacity,status) values(v_trip,6,'closed') returning dep.id into v_closed_departure;

  for i in 1..6 loop
    select r.order_id,r.hold_id into v_result from public.reserve_inventory(v_departure,v_account,1,v_prefix||i::text,v_expires) as r;
    if i=1 then v_first_order_id:=v_result.order_id; v_first_hold_id:=v_result.hold_id; end if;
  end loop;
  if (select coalesce(sum(il.seats),0) from public.inventory_locks as il where il.departure_id=v_departure and il.status='held')<>6 then raise exception 'FAIL exact capacity: expected 6 held seats'; end if;

  v_rejected:=false;
  begin perform * from public.reserve_inventory(v_departure,v_account,1,v_prefix||'7',v_expires); exception when others then if sqlerrm='insufficient inventory' then v_rejected:=true; else raise; end if; end;
  if not v_rejected then raise exception 'FAIL seventh seat was not rejected'; end if;

  select r.order_id,r.hold_id into v_retry from public.reserve_inventory(v_departure,v_account,1,v_prefix||'1',v_expires) as r;
  if v_retry.order_id<>v_first_order_id or v_retry.hold_id<>v_first_hold_id then raise exception 'FAIL idempotent retry returned different IDs'; end if;

  v_rejected:=false;
  begin perform * from public.reserve_inventory(v_departure,v_account,2,v_prefix||'1',v_expires); exception when others then if sqlerrm='idempotency parameter mismatch' then v_rejected:=true; else raise; end if; end;
  if not v_rejected then raise exception 'FAIL mismatched idempotency parameters were accepted'; end if;

  v_rejected:=false;
  begin perform * from public.reserve_inventory(v_departure,v_account,0,v_prefix||'invalid-seats',v_expires); exception when others then if sqlerrm='invalid hold' then v_rejected:=true; else raise; end if; end;
  if not v_rejected then raise exception 'FAIL zero seats were accepted'; end if;

  v_rejected:=false;
  begin perform * from public.reserve_inventory(v_departure,v_account,1,v_prefix||'expired',now()-interval '1 second'); exception when others then if sqlerrm='invalid hold' then v_rejected:=true; else raise; end if; end;
  if not v_rejected then raise exception 'FAIL expired hold was accepted'; end if;

  v_rejected:=false;
  begin perform * from public.reserve_inventory(v_closed_departure,v_account,1,v_prefix||'closed',v_expires); exception when others then if sqlerrm='departure unavailable' then v_rejected:=true; else raise; end if; end;
  if not v_rejected then raise exception 'FAIL closed departure was accepted'; end if;

  raise notice 'PASS reserve_inventory regression: capacity, seventh-seat rejection, idempotency and invalid input boundaries';
end $$;
rollback;
