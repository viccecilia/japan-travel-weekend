begin;

create or replace function public.process_due_trip_room_openings(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare opened integer:=0;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_now is null or p_now>now()+interval '5 minutes' or p_now<now()-interval '5 minutes' then raise exception 'invalid scheduler time'; end if;
  with changed as (
    update public.trip_rooms tr set status='open'
    from public.vehicle_groups vg join public.departures d on d.id=vg.departure_id
    where tr.vehicle_group_id=vg.id and tr.status='frozen' and tr.opens_at<=p_now
      and d.dispatch_planning_status='confirmed'
    returning tr.id
  ) select count(*)::integer into opened from changed;
  return opened;
end$$;

drop function if exists public.get_own_order_fulfilment(uuid);
create function public.get_own_order_fulfilment(p_order uuid)
returns table(order_id uuid,departure_id uuid,departs_at timestamptz,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_group_id uuid,trip_room_id uuid,boarding_ready boolean,details_publish_at timestamptz,details_published boolean,vehicle_label text,staff_name text)
language sql stable security definer set search_path=public,pg_temp as $$
  select o.id,d.id,d.departs_at,
    case when published then d.meeting_name end,
    case when published then d.meeting_address end,
    case when published then d.map_lat end,
    case when published then d.map_lng end,
    case when published then vgo.vehicle_group_id end,
    case when published then tr.id end,
    (published and o.status in ('paid','confirmed') and tr.status='open' and b.status in ('not_issued','issued')),
    d.chat_opens_at,published,
    case when published then va.vehicle_label end,
    case when published then staff.staff_name end
  from public.orders o join public.departures d on d.id=o.departure_id
  left join public.vehicle_group_orders vgo on vgo.order_id=o.id
  left join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id
  left join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  left join public.trip_rooms tr on tr.vehicle_group_id=vgo.vehicle_group_id
  left join public.boardings b on b.order_id=o.id
  left join lateral (
    select coalesce(nullif(dr.display_name,''),nullif(p.display_name,''),'当班司导') staff_name
    from public.staff_assignments sa left join public.driver_resources dr on dr.account_id=sa.staff_id left join public.profiles p on p.id=sa.staff_id
    where sa.vehicle_group_id=vg.id and sa.role in ('driver','guide') order by case when sa.role='driver' then 0 else 1 end limit 1
  ) staff on true
  cross join lateral (select d.dispatch_planning_status='confirmed' and d.chat_opens_at<=now() published) publication
  where o.id=p_order and o.account_id=auth.uid();
$$;

revoke all on function public.process_due_trip_room_openings(timestamptz) from public,anon,authenticated;
grant execute on function public.process_due_trip_room_openings(timestamptz) to service_role;
revoke all on function public.get_own_order_fulfilment(uuid) from public,anon;
grant execute on function public.get_own_order_fulfilment(uuid) to authenticated,service_role;

commit;
