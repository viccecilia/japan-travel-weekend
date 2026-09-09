begin;

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
  perform 1 from public.departures d where d.id=p_departure for update;
  if not found then raise exception 'departure not found'; end if;
  if exists(select 1 from public.vehicle_assignments va where va.departure_id=p_departure) then raise exception 'allocation already exists'; end if;
  select coalesce(sum(o.seat_count),0)::integer into total_seats from public.orders o
    where o.departure_id=p_departure and o.status in ('paid','confirmed');
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

  for order_row in select o.id,o.seat_count from public.orders o where o.departure_id=p_departure and o.status in ('paid','confirmed') order by o.created_at,o.id loop
    select vg.id,va.capacity-coalesce((select sum(o2.seat_count) from public.vehicle_group_orders vgo join public.orders o2 on o2.id=vgo.order_id where vgo.vehicle_group_id=vg.id),0)
      into target_group,target_remaining
      from public.vehicle_groups vg join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
      where vg.departure_id=p_departure
        and va.capacity-coalesce((select sum(o3.seat_count) from public.vehicle_group_orders vgo2 join public.orders o3 on o3.id=vgo2.order_id where vgo2.vehicle_group_id=vg.id),0)>=order_row.seat_count
      order by va.sequence limit 1;
    if target_group is null then raise exception 'order cannot fit without splitting: %',order_row.id; end if;
    insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(target_group,order_row.id);
  end loop;

  update public.vehicle_assignments va set booked_seats=coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=(select vg2.id from public.vehicle_groups vg2 where vg2.vehicle_assignment_id=va.id)),0)
    where va.departure_id=p_departure;
  return query select va.id,vg.id,va.sequence,va.vehicle_type,va.capacity,va.booked_seats
    from public.vehicle_assignments va join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id
    where va.departure_id=p_departure order by va.sequence;
end$$;

create or replace function public.reserve_inventory_from_draft(p_draft uuid,p_account uuid,p_departure uuid,p_seats integer,p_key text,p_expires timestamptz)
returns table(order_id uuid,hold_id uuid) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_draft public.booking_drafts%rowtype;v_order uuid;v_hold uuid;v_existing public.orders%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_account is null or length(coalesce(p_key,''))<8 or p_expires<=now() then raise exception 'invalid draft checkout'; end if;
  select bd.* into v_draft from public.booking_drafts bd where bd.id=p_draft and bd.account_id=p_account for update;
  if not found then raise exception 'draft not found'; end if;
  if v_draft.departure_id<>p_departure or v_draft.seat_impact<>p_seats then raise exception 'draft checkout parameter mismatch'; end if;
  if not v_draft.accepted_cancellation or not v_draft.accepted_terms or v_draft.expires_at<=now() then raise exception 'draft not eligible'; end if;
  if v_draft.operational_review_status='unavailable' then raise exception 'assistance unavailable'; end if;
  if v_draft.converted_order_id is not null then
    select o.* into v_existing from public.orders o where o.id=v_draft.converted_order_id;
    select il.id into v_hold from public.inventory_locks il where il.order_id=v_existing.id and il.idempotency_key=v_existing.idempotency_key;
    if v_existing.idempotency_key<>p_key or v_hold is null then raise exception 'draft conversion idempotency mismatch'; end if;
    return query select v_existing.id,v_hold;return;
  end if;
  if v_draft.status<>'payment_not_started' then raise exception 'draft not eligible'; end if;
  select r.order_id,r.hold_id into v_order,v_hold from public.reserve_inventory(v_draft.departure_id,p_account,v_draft.seat_impact,p_key,p_expires) r;
  if v_order is null or v_hold is null then raise exception 'inventory reservation failed'; end if;
  update public.booking_drafts bd set status='converted',converted_order_id=v_order,converted_at=now(),updated_at=now() where bd.id=v_draft.id;
  return query select v_order,v_hold;
end$$;

revoke all on function public.allocate_departure_sequential(uuid,text[],text[],integer[],timestamptz) from public,anon,authenticated;
grant execute on function public.allocate_departure_sequential(uuid,text[],text[],integer[],timestamptz) to service_role;
revoke all on function public.reserve_inventory_from_draft(uuid,uuid,uuid,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_inventory_from_draft(uuid,uuid,uuid,integer,text,timestamptz) to service_role;

commit;
