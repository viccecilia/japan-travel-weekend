begin;

alter table public.vehicle_assignments
  add column if not exists vehicle_label text,
  add column if not exists booked_seats integer not null default 0 check(booked_seats>=0 and booked_seats<=capacity);

alter table public.trip_room_messages
  add column if not exists important boolean not null default false,
  add column if not exists kind text not null default 'text' check(kind in ('text','photo_placeholder'));

create or replace function public.allocate_departure_sequential(
  p_departure uuid,
  p_vehicle_types text[],
  p_vehicle_labels text[],
  p_capacities integer[],
  p_opens_at timestamptz
) returns table(vehicle_assignment_id uuid,vehicle_group_id uuid,sequence integer,vehicle_type text,capacity integer,booked_seats integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  total_seats integer;
  remaining integer;
  vehicle_index integer;
  take_seats integer;
  assignment_id uuid;
  group_id uuid;
  target_group uuid;
  target_remaining integer;
  order_row record;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_departure is null or p_opens_at is null or cardinality(p_capacities)=0
    or cardinality(p_vehicle_types)<>cardinality(p_capacities)
    or cardinality(p_vehicle_labels)<>cardinality(p_capacities)
    or exists(select 1 from unnest(p_capacities) value where value<=0)
  then raise exception 'invalid allocation configuration'; end if;
  perform 1 from public.departures where id=p_departure for update;
  if not found then raise exception 'departure not found'; end if;
  if exists(select 1 from public.vehicle_assignments where departure_id=p_departure) then raise exception 'allocation already exists'; end if;
  select coalesce(sum(seat_count),0)::integer into total_seats from public.orders
    where departure_id=p_departure and status in ('paid','confirmed');
  remaining:=total_seats;
  for vehicle_index in 1..cardinality(p_capacities) loop
    exit when remaining=0;
    take_seats:=least(remaining,p_capacities[vehicle_index]);
    insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,vehicle_label,capacity,booked_seats)
      values(p_departure,vehicle_index,p_vehicle_types[vehicle_index],p_vehicle_labels[vehicle_index],p_capacities[vehicle_index],take_seats)
      returning id into assignment_id;
    insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(p_departure,assignment_id) returning id into group_id;
    insert into public.trip_rooms(vehicle_group_id,opens_at,status) values(group_id,p_opens_at,case when p_opens_at<=now() then 'open' else 'frozen' end);
    remaining:=remaining-take_seats;
  end loop;
  if remaining>0 then raise exception 'insufficient configured vehicle capacity'; end if;

  for order_row in select id,seat_count from public.orders where departure_id=p_departure and status in ('paid','confirmed') order by created_at,id loop
    select vg.id,va.capacity-coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=vg.id),0)
      into target_group,target_remaining
      from public.vehicle_groups vg join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
      where vg.departure_id=p_departure
        and va.capacity-coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=vg.id),0)>=order_row.seat_count
      order by va.sequence limit 1;
    if target_group is null then raise exception 'order cannot fit without splitting: %',order_row.id; end if;
    insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(target_group,order_row.id);
  end loop;

  update public.vehicle_assignments va set booked_seats=coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=(select id from public.vehicle_groups where vehicle_assignment_id=va.id)),0)
    where va.departure_id=p_departure;
  return query select va.id,vg.id,va.sequence,va.vehicle_type,va.capacity,va.booked_seats
    from public.vehicle_assignments va join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id
    where va.departure_id=p_departure order by va.sequence;
end$$;

create or replace function public.get_accessible_trip_room()
returns table(room_id uuid,vehicle_group_id uuid,room_status text,opens_at timestamptz,departure_id uuid,departs_at timestamptz,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_sequence integer,vehicle_type text,vehicle_label text,vehicle_capacity integer,booked_seats integer,boarded_orders integer,total_orders integer)
language sql stable security definer set search_path=public,pg_temp as $$
  select r.id,vg.id,r.status,r.opens_at,d.id,d.departs_at,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,
    va.sequence,va.vehicle_type,va.vehicle_label,va.capacity,va.booked_seats,
    count(*) filter(where b.status='boarded')::integer,count(vgo.order_id)::integer
  from public.trip_rooms r
  join public.vehicle_groups vg on vg.id=r.vehicle_group_id
  join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  join public.departures d on d.id=vg.departure_id
  left join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id
  left join public.orders o on o.id=vgo.order_id
  left join public.boardings b on b.order_id=o.id
  where public.is_operations() or public.is_group_staff(vg.id) or exists(select 1 from public.vehicle_group_orders own_vgo join public.orders own_o on own_o.id=own_vgo.order_id where own_vgo.vehicle_group_id=vg.id and own_o.account_id=auth.uid())
  group by r.id,vg.id,d.id,va.id
  order by d.departs_at nulls last,va.sequence limit 1;
$$;

create or replace function public.start_own_location_share(p_vehicle_group uuid,p_minutes integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare share_id uuid;
begin
  if auth.uid() is null or p_minutes not in (15,30) then raise exception 'invalid location share'; end if;
  if not exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=p_vehicle_group and o.account_id=auth.uid()) then raise exception 'not a vehicle group passenger'; end if;
  update public.location_shares set stopped_at=now() where vehicle_group_id=p_vehicle_group and subject_id=auth.uid() and stopped_at is null and expires_at>now();
  insert into public.location_shares(vehicle_group_id,subject_id,scope,started_at,expires_at,encrypted_location)
    values(p_vehicle_group,auth.uid(),'assigned_staff_only',now(),now()+make_interval(mins=>p_minutes),null) returning id into share_id;
  return share_id;
end$$;

create or replace function public.stop_own_location_share(p_vehicle_group uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare stopped integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.location_shares set stopped_at=now() where vehicle_group_id=p_vehicle_group and subject_id=auth.uid() and stopped_at is null and expires_at>now();
  get diagnostics stopped=row_count;return stopped;
end$$;

revoke all on function public.allocate_departure_sequential(uuid,text[],text[],integer[],timestamptz) from public,anon,authenticated;
grant execute on function public.allocate_departure_sequential(uuid,text[],text[],integer[],timestamptz) to service_role;
revoke all on function public.get_accessible_trip_room() from public,anon;
grant execute on function public.get_accessible_trip_room() to authenticated,service_role;
revoke all on function public.start_own_location_share(uuid,integer),public.stop_own_location_share(uuid) from public,anon;
grant execute on function public.start_own_location_share(uuid,integer),public.stop_own_location_share(uuid) to authenticated,service_role;

commit;
