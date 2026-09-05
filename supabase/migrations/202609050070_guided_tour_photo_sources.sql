alter table public.guided_tour_nodes
  add column if not exists owned_photo jsonb,
  add column if not exists google_photo jsonb,
  add column if not exists fallback_photo_url text not null default '/images/kyoto-nara.jpg';

comment on column public.guided_tour_nodes.owned_photo is 'Platform-owned photo metadata. Operational nodes prefer this source.';
comment on column public.guided_tour_nodes.google_photo is 'Google Places lookup metadata only; never persist, cache, or rehost returned Google photos.';

update public.guided_tour_nodes set google_photo=jsonb_build_object('textQuery',case node_key
  when 'starbucks-ninenzaka' then 'Starbucks Coffee Kyoto Ninenzaka Yasaka Chaya Japan'
  when 'sannenzaka' then 'Sannenzaka Kyoto Japan'
  when 'kiyomizu-niomon' then 'Kiyomizu-dera Niomon Kyoto Japan'
  when 'arabica-fukuda' then 'Arabica Kyoto Arashiyama Japan'
  when 'tenryuji' then 'Tenryu-ji Kyoto Japan'
  when 'bamboo-grove' then 'Arashiyama Bamboo Forest Kyoto Japan' end)
where node_key in ('starbucks-ninenzaka','sannenzaka','kiyomizu-niomon','arabica-fukuda','tenryuji','bamboo-grove');
