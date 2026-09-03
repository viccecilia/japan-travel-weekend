begin;

with base_price(slug,price_jpy) as (
  values
    ('kyoto-nara-classic',6900),
    ('amanohashidate-ine',7290),
    ('biwako-shirahige',5500),
    ('wakayama-family',8900),
    ('kobe-arima-rokko',6750)
)
update public.departures d
set seat_price_jpy=case
      when extract(isodow from d.departs_at at time zone 'Asia/Tokyo') in (6,7)
        then round(b.price_jpy*1.10/100.0)*100
      else b.price_jpy
    end,
    updated_at=now()
from public.trips t join base_price b on b.slug=t.slug
where d.trip_id=t.id
  and d.departs_at>now()
  and d.status='open'
  and d.sales_open_at is not null
  and d.sales_close_at is not null
  and d.minimum_guests=1
  and d.ends_at>d.departs_at
  and d.map_lat is not null
  and d.map_lng is not null;

commit;
