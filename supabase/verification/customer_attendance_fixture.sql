begin;

do $$
declare
  v_owner uuid;
  v_driver uuid;
  v_trip uuid;
  v_departure uuid;
  v_order uuid;
  v_assignment uuid;
  v_group uuid;
  v_room uuid;
begin
  select p.id into v_owner
  from public.profiles p
  where p.role='passenger'
  order by exists(select 1 from public.orders o where o.account_id=p.id),p.created_at,p.id
  limit 1;

  select p.id into v_driver
  from public.profiles p
  where p.role='driver'
  order by p.created_at,p.id
  limit 1;

  if v_owner is null or v_driver is null then
    raise exception 'fixture requires one passenger and one driver profile';
  end if;

  insert into public.trips(slug,title,status)
  values('kyoto-nara-classic','TEST-京都与奈良客户签到验收','published')
  on conflict(slug) do update
    set title=excluded.title,status='published',updated_at=now()
  returning id into v_trip;

  select d.id into v_departure
  from public.departures d
  where d.trip_id=v_trip and d.meeting_name='TEST-UAT 客户签到集合点'
  limit 1;

  if v_departure is null then
    insert into public.departures(
      trip_id,departs_at,capacity,status,meeting_name,meeting_address,map_lat,map_lng,seat_price_jpy
    ) values(
      v_trip,now()+interval '7 days',9,'open','TEST-UAT 客户签到集合点',
      'TEST-虚构地址，仅用于验收',null,null,100
    ) returning id into v_departure;
  else
    update public.departures d
    set departs_at=case when d.departs_at is null or d.departs_at<=now() then now()+interval '7 days' else d.departs_at end,
        capacity=9,status='open',meeting_address='TEST-虚构地址，仅用于验收',
        map_lat=null,map_lng=null,seat_price_jpy=100,updated_at=now()
    where d.id=v_departure;
  end if;

  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,currency,amount)
  values(v_owner,v_departure,'uat-customer-attendance-v1',2,'confirmed','JPY',200)
  on conflict(account_id,idempotency_key) do update
    set departure_id=excluded.departure_id,seat_count=2,status='confirmed',currency='JPY',amount=200,updated_at=now()
  returning id into v_order;

  insert into public.order_contact_private(order_id,contact_name,phone)
  values(v_order,'TEST-订单联系人','000-0000-0000')
  on conflict(order_id) do update set contact_name=excluded.contact_name,phone=excluded.phone,updated_at=now();

  insert into public.inventory_locks(departure_id,order_id,idempotency_key,seats,status,expires_at)
  values(v_departure,v_order,'uat-customer-attendance-hold-v1',2,'committed',now()+interval '30 days')
  on conflict(idempotency_key) do update
    set departure_id=excluded.departure_id,order_id=excluded.order_id,seats=2,status='committed',expires_at=excluded.expires_at;

  if not exists(select 1 from public.passengers p where p.order_id=v_order and p.display_name='TEST-同行乘客甲') then
    insert into public.passengers(order_id,display_name,passenger_type)
    values(v_order,'TEST-同行乘客甲','adult');
  end if;
  if not exists(select 1 from public.passengers p where p.order_id=v_order and p.display_name='TEST-同行乘客乙') then
    insert into public.passengers(order_id,display_name,passenger_type)
    values(v_order,'TEST-同行乘客乙','adult');
  end if;

  select vg.id,vg.vehicle_assignment_id into v_group,v_assignment
  from public.vehicle_groups vg
  where vg.departure_id=v_departure
  order by vg.created_at,vg.id
  limit 1;

  if v_group is null then
    insert into public.vehicle_assignments(
      departure_id,sequence,vehicle_type,vehicle_label,capacity,booked_seats
    ) values(v_departure,1,'hiace-9','TEST-Hiace 客户签到验收车',9,2)
    returning id into v_assignment;

    insert into public.vehicle_groups(departure_id,vehicle_assignment_id)
    values(v_departure,v_assignment)
    returning id into v_group;
  else
    update public.vehicle_assignments va
    set vehicle_type='hiace-9',vehicle_label='TEST-Hiace 客户签到验收车',capacity=9,booked_seats=2
    where va.id=v_assignment;
  end if;

  insert into public.vehicle_group_orders(vehicle_group_id,order_id)
  values(v_group,v_order)
  on conflict(order_id) do update set vehicle_group_id=excluded.vehicle_group_id;

  insert into public.staff_assignments(vehicle_group_id,staff_id,role)
  values(v_group,v_driver,'driver')
  on conflict(vehicle_group_id,staff_id) do update set role='driver';

  insert into public.trip_rooms(vehicle_group_id,opens_at,status)
  values(v_group,now()-interval '1 minute','open')
  on conflict(vehicle_group_id) do update
    set opens_at=excluded.opens_at,status='open'
  returning id into v_room;

  insert into public.boardings(order_id,status)
  values(v_order,'not_issued')
  on conflict(order_id) do update set status='not_issued',boarded_at=null,updated_at=now();

  delete from public.passenger_contact_actions a
  using public.passenger_checkins pc,public.passengers p
  where a.checkin_id=pc.id and pc.passenger_id=p.id and p.order_id=v_order;
  delete from public.passenger_checkin_events e
  using public.passenger_checkins pc,public.passengers p
  where e.checkin_id=pc.id and pc.passenger_id=p.id and p.order_id=v_order;
  delete from public.passenger_checkins pc
  using public.passengers p
  where pc.passenger_id=p.id and p.order_id=v_order;

  raise notice 'PASS customer attendance fixture ready: 1 order, 2 passengers, open room';
end$$;

commit;
