begin;

create or replace function public.get_passenger_trip_context(p_vehicle_group uuid)
returns table(trip_title text,itinerary jsonb,return_at timestamptz,staff_name text,staff_role text,vehicle_type text,vehicle_label text)
language sql stable security definer set search_path=public,pg_temp as $$
  select t.title,case when jsonb_typeof(t.content->'itinerary')='array' then t.content->'itinerary' else '[]'::jsonb end,d.ends_at,
    staff.staff_name,staff.staff_role,va.vehicle_type,va.vehicle_label
  from public.vehicle_groups vg join public.departures d on d.id=vg.departure_id join public.trips t on t.id=d.trip_id
  join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  left join lateral (
    select coalesce(nullif(dr.display_name,''),nullif(p.display_name,''),'当班工作人员') staff_name,sa.role::text staff_role
    from public.staff_assignments sa join public.profiles p on p.id=sa.staff_id left join public.driver_resources dr on dr.account_id=sa.staff_id
    where sa.vehicle_group_id=vg.id order by case sa.role when 'guide' then 0 when 'driver' then 1 else 2 end,sa.id limit 1
  ) staff on true
  where vg.id=p_vehicle_group and exists(
    select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id
    where vgo.vehicle_group_id=vg.id and o.account_id=auth.uid() and o.status in ('paid','confirmed')
  );
$$;

create or replace function public.get_trip_room_messages_for_member(p_room uuid)
returns table(id uuid,author_id uuid,author_name text,author_role text,content text,original_content text,source_language text,template_key text,important boolean,created_at timestamptz,trip_room_message_translations jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
  select m.id,m.author_id,
    case when m.author_id=auth.uid() then '我' when sa.role in ('driver','guide') then coalesce(nullif(dr.display_name,''),'本车工作人员') when p.role='operations' then 'Japan Travel' else '本车乘客' end,
    case when sa.role in ('driver','guide') then sa.role::text when p.role='operations' then 'operations' else 'passenger' end,
    m.content,m.original_content,m.source_language,m.template_key,m.important,m.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('target_language',mt.target_language,'translated_content',mt.translated_content,'provider',mt.provider,'quality',mt.quality)) from public.trip_room_message_translations mt where mt.message_id=m.id),'[]'::jsonb)
  from public.trip_room_messages m join public.trip_rooms r on r.id=m.trip_room_id join public.profiles p on p.id=m.author_id
  left join public.staff_assignments sa on sa.vehicle_group_id=r.vehicle_group_id and sa.staff_id=m.author_id
  left join public.driver_resources dr on dr.account_id=m.author_id
  where m.trip_room_id=p_room and public.can_receive_vehicle_group(r.vehicle_group_id)
  order by m.created_at,m.id;
$$;

revoke all on function public.get_passenger_trip_context(uuid),public.get_trip_room_messages_for_member(uuid) from public,anon;
grant execute on function public.get_passenger_trip_context(uuid),public.get_trip_room_messages_for_member(uuid) to authenticated,service_role;

commit;
