begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('route-media','route-media',true,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists route_media_public_read on storage.objects;create policy route_media_public_read on storage.objects for select to public using(bucket_id='route-media');
drop policy if exists route_media_operations_insert on storage.objects;create policy route_media_operations_insert on storage.objects for insert to authenticated with check(bucket_id='route-media' and public.is_operations());
drop policy if exists route_media_operations_update on storage.objects;create policy route_media_operations_update on storage.objects for update to authenticated using(bucket_id='route-media' and public.is_operations()) with check(bucket_id='route-media' and public.is_operations());
drop policy if exists route_media_operations_delete on storage.objects;create policy route_media_operations_delete on storage.objects for delete to authenticated using(bucket_id='route-media' and public.is_operations());
commit;
