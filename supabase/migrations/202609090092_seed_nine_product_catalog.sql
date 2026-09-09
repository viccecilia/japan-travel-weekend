begin;

with raw_seed(slug,title,hero,content) as (values
('kyoto-nara-classic','邂逅萌鹿：京都奈良一日游','/images/kyoto-nara.jpg','{"shortTitle":"京都与奈良","summary":"从大阪或京都出发，一天游览清水寺、伏见稻荷大社与奈良公园。","region":"京都与奈良","duration":"约 9–10 小时","walkingLevel":"中等","stops":["清水寺","伏见稻荷大社","奈良公园"]}'::jsonb),
('amanohashidate-ine','海之京都：天桥立与伊根舟屋一日游','/images/amanohashidate-ine.jpg','{"shortTitle":"天桥立与伊根","summary":"充实探访天桥立与伊根舟屋两处海岸景观。","region":"京都北部","duration":"约 10–11 小时","walkingLevel":"中等","stops":["天桥立","智恩寺文殊堂","伊根舟屋"]}'::jsonb),
('biwako-shirahige','琵琶湖山谷、白须神社与近江八幡一日游','/images/lake-biwa.jpg','{"shortTitle":"琵琶湖M线","summary":"连接白须神社水上鸟居、琵琶湖观景台与La Collina近江八幡。","region":"滋贺","duration":"约 10–11 小时","walkingLevel":"中等","stops":["白须神社","琵琶湖观景台","La Collina近江八幡"]}'::jsonb),
('wakayama-family','和歌山猫站长与白滨温泉一日游','/images/wakayama.jpg','{"shortTitle":"和歌山猫站长白滨","summary":"从贵志站猫站长出发，前往白滨海鲜市场、温泉与海岸名胜。","region":"和歌山","duration":"约 9–10 小时","walkingLevel":"轻松至中等","stops":["贵志站","白滨Toretore市场","千叠敷","三段壁"]}'::jsonb),
('kobe-arima-rokko','神户有马温泉与六甲山夜景一日游','/images/kobe.jpg','{"shortTitle":"神户夜景B线","summary":"从有马温泉出发，经过北野异人馆与神户港，以六甲山夜景收尾。","region":"兵库","duration":"约 10–11 小时","walkingLevel":"中等","stops":["有马温泉","北野异人馆街","神户港","六甲山"]}'::jsonb),
('uji-nara-onsen','奈良萌鹿、宇治古寺与温泉一日游','/images/uji-nara.jpg','{"shortTitle":"奈良与宇治温泉","summary":"从奈良鹿群走进宇治世界遗产与抹茶街区，以温泉放松收尾。","region":"奈良与京都宇治","duration":"约 10–11 小时","walkingLevel":"中等","stops":["奈良公园","宇治平等院","源氏物语博物馆","宇治源氏之汤"]}'::jsonb),
('miyama-katsuoji-arashiyama','胜尾寺、爱宕念佛寺与岚山一日游','/images/miyama-katsuoji.jpg','{"shortTitle":"胜尾寺与岚山","summary":"红色达摩、表情各异的石像和向上生长的竹林串进同一天。","region":"大阪北部与京都岚山","duration":"约 10–11 小时","walkingLevel":"中等","stops":["胜尾寺","爱宕念佛寺","岚山竹林"]}'::jsonb),
('arashiyama-train-hozugawa','京都经典一日游','/images/routes/kinkaku/kinkaku-01.webp','{"shortTitle":"京都经典","summary":"古寺、町家和朱红鸟居，把京都最令人向往的画面放进同一天。","region":"京都","duration":"约 9–10 小时","walkingLevel":"中等","stops":["金阁寺","清水寺","二年坂·三年坂","伏见稻荷大社"]}'::jsonb),
('sanzenin-kibune-arashiyama-autumn','红叶季限定：贵船、三千院与岚山一日游','/images/kyoto-autumn.jpg','{"shortTitle":"京都红叶三景","summary":"沿山间石阶走进贵船，在三千院看苔庭红叶，再到岚山欣赏河流与山色。","region":"京都","duration":"约 10–11 小时","walkingLevel":"中等至较高","stops":["贵船神社","大原三千院","岚山·渡月桥"],"season":{"start":"2026-10-15","end":"2026-12-10"}}'::jsonb)
),seed as (
  select slug,title,hero,content||jsonb_build_object(
    'description',coalesce(content->>'summary','')||'。行程由运营根据当日交通、天气和景点开放情况安排，并在出发前提供集合与注意事项。',
    'itinerary',(select jsonb_agg(jsonb_build_object('name',stop,'description','在司导安排下游览并预留合理自由活动时间。') order by ord) from jsonb_array_elements_text(content->'stops') with ordinality s(stop,ord)),
    'included',jsonb_build_array('往返车辆与司导服务','行程内运营通知与集合支持'),
    'excluded',jsonb_build_array('餐饮及个人消费','景点临时收费或自选项目'),
    'childPolicy','儿童价格与座位规则以所选班次和结账页显示为准。',
    'luggagePolicy','每位游客请携带便于一日行程装载的随身行李，大件行李须提前联系确认。',
    'accessibilityInfo','路线可能包含台阶、坡道和较长步行，需要无障碍协助时请在下单前联系确认。',
    'mealInfo','餐食默认不包含，司导会根据当天运行情况说明可用餐时间和地点。',
    'weatherPolicy','遇恶劣天气、道路管制或景点关闭时，运营会评估替代安排并通知已购游客。',
    'cancellationPolicyVersion','2026-09-v1'
  ) content from raw_seed
)
insert into public.trips(slug,title,status,content,hero_image_url,gallery)
select slug,title,'published',content,hero,jsonb_build_array(hero) from seed
on conflict(slug) do nothing;

insert into public.product_revisions(trip_id,revision_number,state,title,content,hero_image_url,gallery,published_at)
select t.id,1,'published',t.title,t.content,t.hero_image_url,t.gallery,now()
from public.trips t where t.slug in ('kyoto-nara-classic','amanohashidate-ine','biwako-shirahige','wakayama-family','kobe-arima-rokko','uji-nara-onsen','miyama-katsuoji-arashiyama','arashiyama-train-hozugawa','sanzenin-kibune-arashiyama-autumn')
and not exists(select 1 from public.product_revisions r where r.trip_id=t.id)
on conflict(trip_id,revision_number) do nothing;

update public.trips t set current_published_revision_id=r.id
from public.product_revisions r where r.trip_id=t.id and r.state='published' and t.current_published_revision_id is null;

commit;
