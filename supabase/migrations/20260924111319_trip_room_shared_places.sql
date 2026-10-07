begin;

create table public.trip_room_shared_places (
  id uuid primary key default gen_random_uuid(),
  trip_room_id uuid not null references public.trip_rooms(id) on delete cascade,
  vehicle_group_id uuid not null references public.vehicle_groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  client_key text not null check (length(client_key) between 8 and 200),
  label text not null check (length(trim(label)) between 1 and 120),
  address text,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  unique (trip_room_id, author_id, client_key)
);
create index trip_room_shared_places_group_created_idx on public.trip_room_shared_places(vehicle_group_id, created_at desc);
alter table public.trip_room_shared_places enable row level security;
revoke all on public.trip_room_shared_places from public, anon, authenticated;

create or replace function public.create_trip_room_shared_place(
  p_room uuid,
  p_label text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_client_key text
) returns table(id uuid, vehicle_group_id uuid, label text, address text, latitude numeric, longitude numeric, created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_group uuid; v_existing public.trip_room_shared_places%rowtype; v_place public.trip_room_shared_places%rowtype;
begin
  if auth.uid() is null or length(trim(coalesce(p_client_key,''))) not between 8 and 200
    or length(trim(coalesce(p_label,''))) not between 1 and 120
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid shared place request';
  end if;
  select r.vehicle_group_id into v_group from public.trip_rooms r where r.id=p_room and r.status='open' for share;
  if v_group is null or not public.is_group_staff(v_group) then raise exception 'assigned staff in an open room only' using errcode='42501'; end if;
  select * into v_existing from public.trip_room_shared_places where trip_room_id=p_room and author_id=auth.uid() and client_key=p_client_key;
  if found then
    return query select v_existing.id,v_existing.vehicle_group_id,v_existing.label,v_existing.address,v_existing.latitude,v_existing.longitude,v_existing.created_at;
    return;
  end if;
  insert into public.trip_room_shared_places(trip_room_id,vehicle_group_id,author_id,client_key,label,address,latitude,longitude)
  values(p_room,v_group,auth.uid(),p_client_key,trim(p_label),nullif(trim(coalesce(p_address,'')),''),p_latitude,p_longitude)
  returning * into v_place;
  insert into public.trip_room_messages(trip_room_id,author_id,content,client_message_id)
  values(p_room,auth.uid(),format('[[jtw:shared_place:%s]] %s',v_place.id,v_place.label),'place:'||p_client_key);
  return query select v_place.id,v_place.vehicle_group_id,v_place.label,v_place.address,v_place.latitude,v_place.longitude,v_place.created_at;
end$$;

create or replace function public.get_trip_room_shared_places(p_vehicle_group uuid)
returns table(id uuid, trip_room_id uuid, vehicle_group_id uuid, label text, address text, latitude numeric, longitude numeric, author_name text, created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select s.id,s.trip_room_id,s.vehicle_group_id,s.label,s.address,s.latitude,s.longitude,p.display_name,s.created_at
  from public.trip_room_shared_places s
  left join public.profiles p on p.id=s.author_id
  where s.vehicle_group_id=p_vehicle_group
    and auth.uid() is not null
    and public.can_receive_vehicle_group(p_vehicle_group)
  order by s.created_at asc
$$;

revoke all on function public.create_trip_room_shared_place(uuid,text,text,numeric,numeric,text),public.get_trip_room_shared_places(uuid) from public,anon;
grant execute on function public.create_trip_room_shared_place(uuid,text,text,numeric,numeric,text),public.get_trip_room_shared_places(uuid) to authenticated;

commit;
