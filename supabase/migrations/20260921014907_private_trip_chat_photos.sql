insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('trip-chat-media','trip-chat-media',false,5242880,array['image/jpeg','image/png','image/webp','image/gif']);
create table public.trip_room_photos(
 id uuid primary key,
 room_id uuid not null references public.trip_rooms(id),
 author_id uuid not null references public.profiles(id),
 object_path text not null unique,
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
 byte_size integer not null check(byte_size between 1 and 5242880),
 published_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.trip_room_photos enable row level security;
revoke all on public.trip_room_photos from public,anon,authenticated;
grant select on public.trip_room_photos to authenticated;
grant all on public.trip_room_photos to service_role;
create policy photo_member_read on public.trip_room_photos for select to authenticated using(
 (published_at is not null or author_id=auth.uid()) and exists(
  select 1 from public.trip_rooms r where r.id=room_id and public.can_receive_vehicle_group(r.vehicle_group_id)
 )
);

create function public.prepare_trip_room_photo(p_room uuid,p_message uuid,p_mime text,p_bytes integer)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare room public.trip_rooms%rowtype; photo public.trip_room_photos%rowtype; path text;
begin
 select * into room from public.trip_rooms where id=p_room for share;
 if auth.uid() is null or room.status is distinct from 'open' or not public.can_receive_vehicle_group(room.vehicle_group_id)
   or not public.is_vehicle_group_executable(room.vehicle_group_id) then raise exception 'photo upload not allowed'; end if;
 if p_message is null or p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp','image/gif')
   or p_bytes is null or p_bytes not between 1 and 5242880 then raise exception 'invalid image'; end if;
 path:=p_room::text||'/'||p_message::text||'/image';
 insert into public.trip_room_photos(id,room_id,author_id,object_path,mime_type,byte_size)
 values(p_message,p_room,auth.uid(),path,p_mime,p_bytes) on conflict(id) do nothing;
 select * into photo from public.trip_room_photos where id=p_message;
 if photo.author_id<>auth.uid() or photo.room_id<>p_room or photo.mime_type<>p_mime or photo.byte_size<>p_bytes then raise exception 'photo retry conflict'; end if;
 return photo.object_path;
end$$;

create function public.publish_trip_room_photo(p_message uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare photo public.trip_room_photos%rowtype; room public.trip_rooms%rowtype;
begin
 select * into photo from public.trip_room_photos where id=p_message for update;
 select * into room from public.trip_rooms where id=photo.room_id for share;
 if auth.uid() is null or photo.author_id is distinct from auth.uid() or room.status is distinct from 'open'
   or not public.can_receive_vehicle_group(room.vehicle_group_id) or not public.is_vehicle_group_executable(room.vehicle_group_id) then raise exception 'photo publish not allowed'; end if;
 if photo.published_at is not null then return photo.id; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='trip-chat-media' and o.name=photo.object_path
   and o.metadata->>'mimetype'=photo.mime_type and o.metadata->>'size'=photo.byte_size::text) then
   raise exception 'image upload not complete';
 end if;
 insert into public.trip_room_messages(id,trip_room_id,author_id,content,original_content,client_message_id)
 values(photo.id,photo.room_id,auth.uid(),'[Photo]','[Photo]','photo:'||photo.id::text);
 update public.trip_room_photos set published_at=now() where id=photo.id;
 return photo.id;
end$$;
revoke all on function public.prepare_trip_room_photo(uuid,uuid,text,integer),public.publish_trip_room_photo(uuid) from public,anon;
grant execute on function public.prepare_trip_room_photo(uuid,uuid,text,integer),public.publish_trip_room_photo(uuid) to authenticated;

create policy trip_chat_image_insert on storage.objects for insert to authenticated with check(
 bucket_id='trip-chat-media' and exists(
 select 1 from public.trip_room_photos p join public.trip_rooms r on r.id=p.room_id
 where p.object_path=name and p.author_id=auth.uid() and p.published_at is null and r.status='open'
 and public.can_receive_vehicle_group(r.vehicle_group_id) and public.is_vehicle_group_executable(r.vehicle_group_id))
);
create policy trip_chat_image_read on storage.objects for select to authenticated using(
 bucket_id='trip-chat-media' and exists(select 1 from public.trip_room_photos p where p.object_path=name)
);
-- No public URLs, overwrites, object deletion, or broad route-media access.
