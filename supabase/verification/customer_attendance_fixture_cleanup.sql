begin;

do $$
declare
  v_trip uuid;
  v_departure uuid;
  v_order uuid;
begin
  select t.id into v_trip from public.trips t where t.slug='kyoto-nara-classic' and t.title='TEST-京都与奈良客户签到验收';
  if v_trip is null then
    raise notice 'fixture not present';
    return;
  end if;

  select d.id into v_departure from public.departures d where d.trip_id=v_trip and d.meeting_name='TEST-UAT 客户签到集合点';
  select o.id into v_order from public.orders o where o.departure_id=v_departure and o.idempotency_key='uat-customer-attendance-v1';

  delete from public.passenger_contact_actions where checkin_id in (select id from public.passenger_checkins where order_id=v_order);
  delete from public.passenger_checkin_events where checkin_id in (select id from public.passenger_checkins where order_id=v_order);
  delete from public.passenger_checkins where order_id=v_order;
  delete from public.trip_room_messages where trip_room_id in (select id from public.trip_rooms where vehicle_group_id in (select id from public.vehicle_groups where departure_id=v_departure));
  delete from public.boarding_verification_attempts where credential_id in (select id from public.boarding_credentials where boarding_id in (select id from public.boardings where order_id=v_order));
  delete from public.boarding_credentials where boarding_id in (select id from public.boardings where order_id=v_order);
  delete from public.boardings where order_id=v_order;
  delete from public.staff_assignments where vehicle_group_id in (select id from public.vehicle_groups where departure_id=v_departure);
  delete from public.vehicle_group_orders where order_id=v_order;
  delete from public.trip_rooms where vehicle_group_id in (select id from public.vehicle_groups where departure_id=v_departure);
  delete from public.vehicle_groups where departure_id=v_departure;
  delete from public.vehicle_assignments where departure_id=v_departure;
  delete from public.inventory_locks where order_id=v_order;
  delete from public.passenger_assistance where order_id=v_order;
  delete from public.passengers where order_id=v_order;
  delete from public.payment_events where order_id=v_order;
  delete from public.orders where id=v_order;
  delete from public.departures where id=v_departure;
  delete from public.trips where id=v_trip;
  raise notice 'PASS customer attendance fixture removed';
end$$;

commit;
