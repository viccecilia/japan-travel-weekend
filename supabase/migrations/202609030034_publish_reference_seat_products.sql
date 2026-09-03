begin;

with route(slug,title,price_jpy,depart_time,end_time,itinerary,description) as (
  values
    ('kyoto-nara-classic','邂逅萌鹿：京都奈良一日游',6900,'08:40'::time,'18:00'::time,'["大阪日本桥集合","京都站集合","清水寺与东山历史街区","伏见稻荷大社","奈良公园","返回大阪"]'::jsonb,'从大阪或京都出发，一天串联京都东山、伏见稻荷与奈良公园的关西经典路线。'),
    ('amanohashidate-ine','海之京都：天桥立与伊根舟屋一日游',7290,'08:40'::time,'19:20'::time,'["大阪日本桥集合","京都站集合","天桥立","伊根舟屋","返回京都站与大阪"]'::jsonb,'从大阪或京都出发，游览日本三景天桥立与伊根湾传统舟屋景观。'),
    ('biwako-shirahige','琵琶湖山谷、白须神社与近江八幡一日游',5500,'08:00'::time,'18:50'::time,'["大阪日本桥集合","京都站集合","白须神社","琵琶湖观景区域","La Collina近江八幡","返回大阪"]'::jsonb,'连接白须神社、琵琶湖观景区域与近江八幡自然建筑景观的一日路线。'),
    ('wakayama-family','和歌山猫站长与白滨温泉一日游',8900,'09:00'::time,'18:40'::time,'["大阪日本桥集合","贵志站与特色电车","白滨Toretore市场","千叠敷与三段壁","返回大阪"]'::jsonb,'从大阪前往贵志站和南纪白滨，体验特色电车、海鲜市场与海岸风景。'),
    ('kobe-arima-rokko','神户有马温泉与六甲山夜景一日游',6750,'11:30'::time,'22:00'::time,'["大阪日本桥集合","有马温泉","北野异人馆街","神户港","六甲山夜景","返回大阪"]'::jsonb,'午后从大阪出发，串联有马温泉、神户港与六甲山夜景的城市观光路线。')
), upserted as (
  insert into public.trips(slug,title,status,content,hero_image_url,gallery)
  select slug,title,'published',jsonb_build_object(
    'description',description,
    'itinerary',itinerary,
    'included',jsonb_build_array('往返车辆与司机服务','行程履约支持与本车 Trip Room'),
    'excluded',jsonb_build_array('未在班次确认页明确列出的景点门票','餐食、饮品及个人消费'),
    'childPolicy','儿童与婴儿是否占座及费用以订单确认页为准；未确认前不收取相关附加费用。',
    'luggagePolicy','一日游原则上不安排大型行李；婴儿车、轮椅及大件物品须在下单时申报。',
    'accessibilityInfo','轮椅、无障碍车辆及工作人员协助均须运营确认，无法提供时将在收费前通知。',
    'mealInfo','餐食原则上自理；如班次包含餐食，将在订单确认页单独明确列出。',
    'weatherPolicy','天气或拥堵仅导致顺序和停留时间调整时不当然构成全额退款，依法应退款、解除或补偿的情形除外。',
    'cancellationPolicyVersion','2026-09-03',
    'priceReference',jsonb_build_object('provider','Gogoday public product page','checkedAt','2026-09-03','seatPriceJpy',price_jpy),
    'minimumGuests',1
  ),case slug
    when 'kyoto-nara-classic' then '/images/kyoto-nara.jpg'
    when 'amanohashidate-ine' then '/images/amanohashidate-ine.jpg'
    when 'biwako-shirahige' then '/images/lake-biwa.jpg'
    when 'wakayama-family' then '/images/wakayama.jpg'
    else '/images/kobe.jpg' end,
  jsonb_build_array(case slug
    when 'kyoto-nara-classic' then '/images/kyoto-nara.jpg'
    when 'amanohashidate-ine' then '/images/amanohashidate-ine.jpg'
    when 'biwako-shirahige' then '/images/lake-biwa.jpg'
    when 'wakayama-family' then '/images/wakayama.jpg'
    else '/images/kobe.jpg' end)
  from route
  on conflict(slug) do update set title=excluded.title,status=excluded.status,content=excluded.content,hero_image_url=excluded.hero_image_url,gallery=excluded.gallery,updated_at=now()
  returning id,slug
), service_dates as (
  select ((now() at time zone 'Asia/Tokyo')::date+n)::date service_date from generate_series(1,30) n
), products as (
  select u.id trip_id,r.*,d.service_date,
    ((d.service_date+r.depart_time) at time zone 'Asia/Tokyo') departs_at,
    ((d.service_date+r.end_time) at time zone 'Asia/Tokyo') ends_at
  from route r join upserted u using(slug) cross join service_dates d
)
insert into public.departures(id,trip_id,departs_at,ends_at,capacity,status,meeting_name,meeting_address,map_lat,map_lng,arrival_transit,arrival_walking,arrival_driving,seat_price_jpy,sales_open_at,sales_close_at,minimum_guests,currency,tax_included)
select (substr(md5(slug||service_date::text),1,8)||'-'||substr(md5(slug||service_date::text),9,4)||'-4'||substr(md5(slug||service_date::text),14,3)||'-a'||substr(md5(slug||service_date::text),18,3)||'-'||substr(md5(slug||service_date::text),21,12))::uuid,
  trip_id,departs_at,ends_at,100,'open','大阪Metro日本桥站2号出口','大阪府大阪市中央区日本桥1丁目 日本桥交差点北西侧（2号出口）',34.666944,135.506111,
  '搭乘大阪Metro千日前线或堺筋线至日本桥站，从2号出口出站。','请提前10分钟到达2号出口附近并寻找 Japan Travel Weekend 工作人员。',null,
  price_jpy,now()-interval '1 minute',departs_at-interval '10 hours',1,'JPY',true
from products
on conflict(id) do update set trip_id=excluded.trip_id,departs_at=excluded.departs_at,ends_at=excluded.ends_at,capacity=excluded.capacity,status=excluded.status,meeting_name=excluded.meeting_name,meeting_address=excluded.meeting_address,map_lat=excluded.map_lat,map_lng=excluded.map_lng,arrival_transit=excluded.arrival_transit,arrival_walking=excluded.arrival_walking,seat_price_jpy=excluded.seat_price_jpy,sales_open_at=excluded.sales_open_at,sales_close_at=excluded.sales_close_at,minimum_guests=excluded.minimum_guests,currency=excluded.currency,tax_included=excluded.tax_included,updated_at=now();

commit;
