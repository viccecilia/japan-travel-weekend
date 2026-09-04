begin;

-- One operational itinerary contract is shared by passenger, staff and operations clients.
with route_stops(slug,stops) as (values
('kyoto-nara-classic',$json$[
 {"id":"osaka-departure","name":"大阪日本桥集合出发","arrivalTime":"08:30","meetingTime":"08:40","meetingPointName":"日本桥站2号出口","meetingPointDescription":"2号出口地面团体集合区，请寻找黄色 JT 标识","meetingPointPhoto":"/images/kyoto-nara.jpg","latitude":34.668700,"longitude":135.506200},
 {"id":"kyoto-pickup","name":"京都站集合出发","arrivalTime":"09:40","meetingTime":"09:50","meetingPointName":"京都站八条口观光巴士停车场","meetingPointDescription":"八条口南侧观光巴士乘降区","latitude":34.984600,"longitude":135.758400},
 {"id":"kiyomizu","name":"清水寺与东山历史街区","arrivalTime":"10:00","meetingTime":"12:30","meetingPointName":"清水坂观光停车场团体集合区","meetingPointDescription":"停车场团体巴士乘降区，以司导现场标识为准","latitude":34.994900,"longitude":135.785000},
 {"id":"fushimi-inari","name":"伏见稻荷大社","arrivalTime":"13:00","meetingTime":"14:10","meetingPointName":"伏见稻荷站前团体集合区","meetingPointDescription":"车站与参道入口之间的团体集合区","latitude":34.967100,"longitude":135.772700},
 {"id":"nara-park","name":"奈良公园","arrivalTime":"15:30","meetingTime":"17:00","meetingPointName":"奈良公园巴士停车场","meetingPointDescription":"巴士停车场入口团体集合区","latitude":34.685100,"longitude":135.843000},
 {"id":"osaka-return","name":"预计返回大阪","meetingTime":"18:00","meetingPointName":"日本桥站2号出口","meetingPointDescription":"预计到达时间受当天交通影响","latitude":34.668700,"longitude":135.506200}
]$json$::jsonb),
('amanohashidate-ine',$json$[
 {"id":"osaka-departure","name":"大阪日本桥集合出发","arrivalTime":"08:30","meetingTime":"08:40","meetingPointName":"日本桥站2号出口","meetingPointDescription":"2号出口地面团体集合区","latitude":34.668700,"longitude":135.506200},
 {"id":"kyoto-pickup","name":"京都站集合出发","arrivalTime":"09:40","meetingTime":"09:50","meetingPointName":"京都站八条口观光巴士停车场","meetingPointDescription":"八条口南侧观光巴士乘降区","latitude":34.984600,"longitude":135.758400},
 {"id":"amanohashidate","name":"天桥立","arrivalTime":"11:20","meetingTime":"13:50","meetingPointName":"天桥立智恩寺停车场","meetingPointDescription":"智恩寺入口附近旅游巴士集合区","meetingPointPhoto":"/images/amanohashidate-ine.jpg","latitude":35.557300,"longitude":135.182200},
 {"id":"ine","name":"伊根舟屋","arrivalTime":"14:30","meetingTime":"15:50","meetingPointName":"伊根浦公园巴士停车区","meetingPointDescription":"临海公园旅游巴士乘降区","latitude":35.675000,"longitude":135.289000},
 {"id":"kyoto-return","name":"预计抵达京都站","meetingTime":"18:20","meetingPointName":"京都站八条口","meetingPointDescription":"选择京都下车的乘客请留意司导通知","latitude":34.984600,"longitude":135.758400},
 {"id":"osaka-return","name":"预计返回大阪","meetingTime":"19:20","meetingPointName":"日本桥站2号出口","meetingPointDescription":"预计到达时间受当天交通影响","latitude":34.668700,"longitude":135.506200}
]$json$::jsonb),
('biwako-shirahige',$json$[
 {"id":"osaka-departure","name":"大阪日本桥集合出发","arrivalTime":"07:50","meetingTime":"08:00","meetingPointName":"日本桥站2号出口","meetingPointDescription":"2号出口地面团体集合区","latitude":34.668700,"longitude":135.506200},
 {"id":"kyoto-pickup","name":"京都站集合出发","arrivalTime":"09:10","meetingTime":"09:20","meetingPointName":"京都站八条口观光巴士停车场","meetingPointDescription":"八条口南侧观光巴士乘降区","latitude":34.984600,"longitude":135.758400},
 {"id":"shirahige","name":"白须神社水上鸟居","arrivalTime":"10:20","meetingTime":"10:50","meetingPointName":"白须神社安全观景区","meetingPointDescription":"禁止横穿国道，请在司导指定安全区域集合","latitude":35.273300,"longitude":136.010200},
 {"id":"biwako-valley","name":"琵琶湖观景台","arrivalTime":"11:30","meetingTime":"14:30","meetingPointName":"琵琶湖Valley山麓缆车站","meetingPointDescription":"山麓缆车站团体巴士乘降区","meetingPointPhoto":"/images/lake-biwa.jpg","latitude":35.214500,"longitude":135.885200},
 {"id":"la-collina","name":"La Collina近江八幡","arrivalTime":"15:30","meetingTime":"16:30","meetingPointName":"La Collina团体巴士停车场","meetingPointDescription":"主入口外团体巴士停车区","latitude":35.145100,"longitude":136.070100},
 {"id":"osaka-return","name":"预计返回大阪","meetingTime":"18:50","meetingPointName":"日本桥站2号出口","meetingPointDescription":"预计到达时间受当天交通影响","latitude":34.668700,"longitude":135.506200}
]$json$::jsonb),
('wakayama-family',$json$[
 {"id":"osaka-departure","name":"大阪日本桥集合出发","arrivalTime":"08:50","meetingTime":"09:00","meetingPointName":"日本桥站2号出口","meetingPointDescription":"2号出口地面团体集合区","latitude":34.668700,"longitude":135.506200},
 {"id":"kishi-station","name":"贵志站与特色电车","arrivalTime":"10:30","meetingTime":"11:20","meetingPointName":"贵志站站前集合区","meetingPointDescription":"车站正门外，请勿影响当地乘客通行","latitude":34.209400,"longitude":135.311400},
 {"id":"toretore","name":"白滨Toretore市场","arrivalTime":"12:30","meetingTime":"14:30","meetingPointName":"Toretore市场旅游巴士停车场","meetingPointDescription":"市场主入口外旅游巴士停车区","meetingPointPhoto":"/images/wakayama.jpg","latitude":33.678700,"longitude":135.376200},
 {"id":"senjojiki","name":"千叠敷与三段壁","arrivalTime":"14:50","meetingTime":"16:00","meetingPointName":"千叠敷停车场团体集合区","meetingPointDescription":"停车场靠旅游巴士一侧，远离临崖区域","latitude":33.667200,"longitude":135.335400},
 {"id":"osaka-return","name":"预计返回大阪","meetingTime":"18:40","meetingPointName":"日本桥站2号出口","meetingPointDescription":"预计到达时间受当天交通影响","latitude":34.668700,"longitude":135.506200}
]$json$::jsonb),
('kobe-arima-rokko',$json$[
 {"id":"osaka-departure","name":"大阪日本桥集合出发","arrivalTime":"11:20","meetingTime":"11:30","meetingPointName":"日本桥站2号出口","meetingPointDescription":"2号出口地面团体集合区；冬令时以订单时间为准","latitude":34.668700,"longitude":135.506200},
 {"id":"arima","name":"有马温泉","arrivalTime":"12:30","meetingTime":"15:00","meetingPointName":"有马温泉太阁桥巴士乘降区","meetingPointDescription":"太阁桥附近团体巴士乘降区","latitude":34.797000,"longitude":135.248000},
 {"id":"kitano","name":"北野异人馆街","arrivalTime":"15:30","meetingTime":"16:30","meetingPointName":"北野工房周边团体集合区","meetingPointDescription":"以司导当天确认的巴士停靠位置为准","latitude":34.700600,"longitude":135.190100},
 {"id":"harborland","name":"神户港与马赛克摩天轮","arrivalTime":"16:50","meetingTime":"19:20","meetingPointName":"神户Harborland巴士停车区","meetingPointDescription":"MOSAIC临海区域团体巴士停车区","meetingPointPhoto":"/images/kobe.jpg","latitude":34.679300,"longitude":135.182700},
 {"id":"rokko","name":"六甲山夜景","arrivalTime":"19:20","meetingTime":"21:00","meetingPointName":"六甲花园露台巴士停车场","meetingPointDescription":"夜间温度较低，请按司导指定车辆位置集合","latitude":34.764800,"longitude":135.247200},
 {"id":"osaka-return","name":"预计返回大阪","meetingTime":"22:00","meetingPointName":"日本桥站2号出口","meetingPointDescription":"冬令时及预计到达时间以订单通知为准","latitude":34.668700,"longitude":135.506200}
]$json$::jsonb)
)
update public.trips t set content=jsonb_set(coalesce(t.content,'{}'::jsonb),'{itineraryStops}',r.stops,true)
from route_stops r where t.slug=r.slug;

create or replace function public.get_vehicle_group_itinerary(p_vehicle_group uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(t.content->'itineraryStops','[]'::jsonb)
  from public.vehicle_groups vg join public.departures d on d.id=vg.departure_id join public.trips t on t.id=d.trip_id
  where vg.id=p_vehicle_group and (public.is_operations() or public.is_group_staff(vg.id) or exists(
    select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id
    where vgo.vehicle_group_id=vg.id and o.account_id=auth.uid() and o.status in ('paid','confirmed')
  ));
$$;

create or replace function public.advance_vehicle_group_to_itinerary_stop(p_vehicle_group uuid,p_stop_id text,p_reason text,p_idempotency_key text)
returns table(status text,current_stop_name text,revision integer,room_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stop jsonb;v_departure_at timestamptz;v_meeting_at timestamptz;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if length(trim(p_stop_id))<2 or length(trim(p_reason)) not between 3 and 300 or length(trim(p_idempotency_key))<8 then raise exception 'invalid itinerary transition'; end if;
  select stop,d.departs_at into v_stop,v_departure_at from public.vehicle_groups vg join public.departures d on d.id=vg.departure_id join public.trips t on t.id=d.trip_id cross join lateral jsonb_array_elements(coalesce(t.content->'itineraryStops','[]'::jsonb)) stop where vg.id=p_vehicle_group and stop->>'id'=p_stop_id;
  if v_stop is null then raise exception 'itinerary stop not found'; end if;
  v_meeting_at:=(((v_departure_at at time zone 'Asia/Tokyo')::date+(v_stop->>'meetingTime')::time) at time zone 'Asia/Tokyo');
  perform public.update_vehicle_group_meeting(p_vehicle_group,v_meeting_at,v_stop->>'meetingPointName',coalesce(v_stop->>'meetingPointDescription',v_stop->>'meetingPointName'),(v_stop->>'latitude')::numeric,(v_stop->>'longitude')::numeric,coalesce(v_stop->>'meetingPointDescription',''),p_reason,p_idempotency_key||':meeting');
  return query select * from public.advance_vehicle_group_journey(p_vehicle_group,'stop_arrived',v_stop->>'name',p_reason,p_idempotency_key||':journey');
end$$;

revoke all on function public.get_vehicle_group_itinerary(uuid),public.advance_vehicle_group_to_itinerary_stop(uuid,text,text,text) from public,anon;
grant execute on function public.get_vehicle_group_itinerary(uuid),public.advance_vehicle_group_to_itinerary_stop(uuid,text,text,text) to authenticated,service_role;

commit;
