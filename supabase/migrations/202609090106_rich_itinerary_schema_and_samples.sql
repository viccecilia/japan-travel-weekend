begin;

-- Historical revisions stay immutable. Readers accept legacy `name`; every
-- revision created below writes the canonical `title` field.

do $$
declare item record;v_content jsonb;v_revision integer;v_revision_id uuid;
begin
  for item in select * from (values
    ('kyoto-nara-classic',jsonb_build_object(
      'walkingLevel','中等','languages',jsonb_build_array('中文','日本語','English'),
      'highlights',jsonb_build_array('古都名寺、朱红鸟居与奈良鹿群，一天体验三种代表性风景','由司导串联交通与集合，减少自行换乘压力','费用、班次与余位在预订前清楚确认'),
      'itinerary',jsonb_build_array(
        jsonb_build_object('title','清水寺','location','京都 · 东山','description','从清水舞台眺望京都市区，并沿音羽山参拜路线观察悬造木结构、山林与古街如何相连。','stayMinutes',90,'imageUrl','/images/routes/kiyomizu/kiyomizu-01.webp','gallery',jsonb_build_array('/images/routes/kiyomizu/kiyomizu-01.webp','/images/routes/kiyomizu/kiyomizu-02.webp'),'highlights',jsonb_build_array('清水舞台与京都全景','音羽瀑布与参拜文化','东山坡道和传统街区'),'tip','坡道和台阶较多，建议穿防滑步行鞋。'),
        jsonb_build_object('title','伏见稻荷大社','location','京都 · 伏见','description','从楼门和本殿进入稻荷山参道，在连续朱红鸟居之间感受仍在使用的信仰空间。','stayMinutes',75,'imageUrl','/images/routes/fushimi/fushimi-01.webp','gallery',jsonb_build_array('/images/routes/fushimi/fushimi-01.webp','/images/routes/fushimi/fushimi-02.webp'),'highlights',jsonb_build_array('千本鸟居纵深构图','稻荷信仰与奉纳文化','林间参道'),'tip','时间有限时走前段鸟居，并按集合时间折返。'),
        jsonb_build_object('title','奈良公园','location','奈良 · 奈良市','description','在草地、古寺屋顶、若草山与鹿群之间散步，理解鹿群与奈良古都历史共同形成的开放景观。','stayMinutes',120,'imageUrl','/images/routes/nara/nara-01.webp','gallery',jsonb_build_array('/images/routes/nara/nara-01.webp'),'highlights',jsonb_build_array('鹿群与若草山','可按体力连接东大寺周边','古都与自然交织'),'tip','鹿是野生动物，请看护儿童并收好纸张与随身物品。')))),
    ('amanohashidate-ine',jsonb_build_object(
      'walkingLevel','中等','languages',jsonb_build_array('中文','日本語','English'),
      'highlights',jsonb_build_array('从高处看天桥立沙洲，再走进伊根临海舟屋','山海景观与渔村生活在一天内形成鲜明对比','长距离交通由司导衔接，适合从大阪轻松往返'),
      'itinerary',jsonb_build_array(
        jsonb_build_object('title','天桥立','location','京都府 · 宫津市','description','登上观景区俯瞰沙洲、松林与宫津湾，天气通透时能清楚看见“天桥”横跨海面的完整轮廓。','stayMinutes',100,'imageUrl','/images/routes/amanohashidate/amanohashidate-01.webp','gallery',jsonb_build_array('/images/routes/amanohashidate/amanohashidate-01.webp','/images/routes/amanohashidate/amanohashidate-02.webp'),'highlights',jsonb_build_array('经典俯瞰视角','沙洲与双侧海湾','松林散步'),'tip','索道及登山设施可能受强风影响，以当天运营为准。'),
        jsonb_build_object('title','智恩寺文殊堂','location','京都府 · 宫津市','description','在天桥立入口参拜以智慧信仰闻名的文殊堂，观察山门、古松与海边参道构成的宁静空间。','stayMinutes',40,'highlights',jsonb_build_array('日本三文殊之一','山门与海边参道','扇子签等地方文化'),'tip','这里仍是宗教场所，请安静参拜并留意集合时间。'),
        jsonb_build_object('title','伊根舟屋','location','京都府 · 伊根町','description','沿伊根湾观察一层船库、二层住居的舟屋紧贴水面排列，感受渔业、海湾地形与居民日常共同形成的村落景观。','stayMinutes',100,'imageUrl','/images/routes/ine/ine-01.webp','gallery',jsonb_build_array('/images/routes/ine/ine-01.webp','/images/routes/ine/ine-02.webp'),'highlights',jsonb_build_array('临海舟屋连续景观','伊根湾与渔村生活','岸边散步或按现场安排观景'),'tip','舟屋多为私人住宅，请勿擅自进入或近距离拍摄居民。')))),
    ('sanzenin-kibune-arashiyama-autumn',jsonb_build_object(
      'walkingLevel','中等至较高','languages',jsonb_build_array('中文','日本語','English'),
      'highlights',jsonb_build_array('苔庭、山谷灯笼与岚山河景组成层次丰富的京都秋日','三处景点各有不同色彩与步行体验','红叶状态随天气变化，页面不承诺固定日期达到最盛'),
      'itinerary',jsonb_build_array(
        jsonb_build_object('title','贵船神社','location','京都 · 贵船','description','朱红灯笼沿杉林石阶向山谷深处延伸，贵船川水声与水神信仰让参拜更有沉浸感。','stayMinutes',70,'highlights',jsonb_build_array('灯笼石阶纵深','水占卜与水神信仰','贵船川山谷景色'),'tip','道路狭窄且台阶较多，旺季停靠点可能调整。'),
        jsonb_build_object('title','大原三千院','location','京都 · 大原','description','杉木、苔庭与枫叶包围往生极乐院，童地藏藏在青苔之间，呈现区别于市中心的安静秋色。','stayMinutes',90,'highlights',jsonb_build_array('有清园苔庭','童地藏与杉木','大原山村参道'),'tip','石阶和苔边雨后湿滑，红叶颜色受气温影响。'),
        jsonb_build_object('title','岚山·渡月桥','location','京都 · 岚山','description','沿桂川眺望渡月桥和山体秋色，并按时间组合竹林、河岸或嵯峨野街区自由散步。','stayMinutes',110,'highlights',jsonb_build_array('渡月桥与桂川','山体秋色倒影','竹林或河岸自由散步'),'tip','秋季日落早且人流密集，请优先保证返程集合时间。'))))
  ) s(slug,patch) loop
    select t.content||item.patch||jsonb_build_object('stops',(select jsonb_agg(x->>'title' order by ord) from jsonb_array_elements(item.patch->'itinerary') with ordinality q(x,ord)))
      into v_content from public.trips t where t.slug=item.slug;
    if v_content is null then continue; end if;
    select coalesce(max(r.revision_number),0)+1 into v_revision from public.product_revisions r join public.trips t on t.id=r.trip_id where t.slug=item.slug;
    update public.product_revisions r set state='superseded' where r.id=(select t.current_published_revision_id from public.trips t where t.slug=item.slug) and r.state='published';
    insert into public.product_revisions(trip_id,revision_number,state,title,content,hero_image_url,gallery,published_at)
      select t.id,v_revision,'published',t.title,v_content,t.hero_image_url,t.gallery,now() from public.trips t where t.slug=item.slug returning id into v_revision_id;
    update public.trips t set content=v_content,current_published_revision_id=v_revision_id,catalog_version=t.catalog_version+1,updated_at=now() where t.slug=item.slug;
  end loop;
end$$;

commit;
