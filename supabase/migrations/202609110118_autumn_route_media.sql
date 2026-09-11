begin;

-- Publish reviewed, attraction-specific autumn media as a new revision. Older
-- revisions and order snapshots stay immutable and can still be audited.
do $$
declare
  v_trip public.trips%rowtype;
  v_content jsonb;
  v_revision integer;
  v_revision_id uuid;
begin
  select * into v_trip from public.trips
    where slug='sanzenin-kibune-arashiyama-autumn' for update;
  if not found then return; end if;

  v_content:=jsonb_set(v_trip.content,'{itinerary}',(
    select jsonb_agg(
      case item->>'title'
        when '贵船神社' then item||jsonb_build_object('imageUrl','/images/routes/kifune/kifune-autumn-01.jpg','gallery',jsonb_build_array('/images/routes/kifune/kifune-autumn-01.jpg'))
        when '大原三千院' then item||jsonb_build_object('imageUrl','/images/routes/sanzenin/sanzenin-autumn-01.jpg','gallery',jsonb_build_array('/images/routes/sanzenin/sanzenin-autumn-01.jpg'))
        when '岚山·渡月桥' then item||jsonb_build_object('imageUrl','/images/routes/arashiyama-autumn/togetsukyo-autumn-01.jpg','gallery',jsonb_build_array('/images/routes/arashiyama-autumn/togetsukyo-autumn-01.jpg'))
        else item
      end order by ord
    ) from jsonb_array_elements(coalesce(v_trip.content->'itinerary','[]'::jsonb)) with ordinality q(item,ord)
  ),true);

  select coalesce(max(revision_number),0)+1 into v_revision
    from public.product_revisions where trip_id=v_trip.id;
  update public.product_revisions set state='superseded'
    where id=v_trip.current_published_revision_id and state='published';
  insert into public.product_revisions(trip_id,revision_number,state,title,content,hero_image_url,gallery,published_at)
    values(v_trip.id,v_revision,'published',v_trip.title,v_content,
      '/images/routes/sanzenin/sanzenin-autumn-01.jpg',
      jsonb_build_array('/images/routes/kifune/kifune-autumn-01.jpg','/images/routes/sanzenin/sanzenin-autumn-01.jpg','/images/routes/arashiyama-autumn/togetsukyo-autumn-01.jpg'),now())
    returning id into v_revision_id;
  update public.trips set content=v_content,
    hero_image_url='/images/routes/sanzenin/sanzenin-autumn-01.jpg',
    gallery=jsonb_build_array('/images/routes/kifune/kifune-autumn-01.jpg','/images/routes/sanzenin/sanzenin-autumn-01.jpg','/images/routes/arashiyama-autumn/togetsukyo-autumn-01.jpg'),
    current_published_revision_id=v_revision_id,catalog_version=catalog_version+1,updated_at=now()
    where id=v_trip.id;
end$$;

commit;
