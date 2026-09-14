-- One web-ready MP4 per versioned itinerary stop. Draft removal only detaches the JSON reference.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('route-media','route-media',true,52428800,array['image/jpeg','image/png','image/webp','video/mp4'])
on conflict(id) do update set
  public=true,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Existing route_media_* policies remain authoritative: public read, operations-only writes.
