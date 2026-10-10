import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {draftContent,draftFromProduct,localizedDraft,persistedItinerary,reviewedRouteStopAttractionIds} from '../src/app/operations/productDraft';
import {discoverText,discoverTranslationGaps,initialDiscoverHeroes} from '../src/shared/discover';
import {formatDepartureReadinessError,type OperationsProduct} from '../src/shared/integrations/supabaseOperations';
import {isRouteStudioProduct,ROUTE_STUDIO_V1_SLUGS} from '../src/app/operations/routeStudioScope';
import {policyLocalizationText} from '../src/app/operations/policyLocalization';
import {publishedTripTimeline} from '../src/shared/data/repository';

const product:OperationsProduct={id:'route-1',slug:'amanohashidate-ine',status:'published',catalogVersion:4,publishedRevision:3,draftRevision:null,title:'天桥立与伊根',heroImageUrl:'/hero.webp',gallery:[],updatedAt:'2026-10-07T00:00:00Z',content:{summary:'路线简介',description:'足够完整的路线介绍文字，用于产品发布与班次销售验证。',included:['车辆'],excluded:[],heroVideo:{url:'/hero.mp4',storagePath:'route-1/hero.mp4',posterUrl:'/poster.webp',mimeType:'video/mp4',sizeBytes:1024},itinerary:[{id:'meet',title:'京都站集合',time:'08:00',stayMinutes:10,type:'meeting'},{id:'ama',title:'天桥立',time:'10:30',stayMinutes:90,gallery:['/a.webp','/b.webp'],video:{url:'/legacy.mp4',storagePath:'legacy.mp4',mimeType:'video/mp4',sizeBytes:10}}],locales:{en:{title:'Amanohashidate & Ine',summary:'A coast day trip',itinerary:{meet:{stop_title:'Meet at Kyoto Station'}}},ja:{title:'天橋立と伊根',summary:'海の一日旅'}}}};

describe('Route Studio V1 data contract',()=>{
  it('keeps the exact eight maintained routes and marks new routes for the studio after publish',()=>{
    expect(ROUTE_STUDIO_V1_SLUGS).toHaveLength(8);
    expect(ROUTE_STUDIO_V1_SLUGS).not.toContain('arashiyama-train-hozugawa');
    expect(isRouteStudioProduct({...product,id:'new-route',slug:'new-route',status:'published',content:{routeStudioV1:true}})).toBe(true);
    expect(isRouteStudioProduct({...product,id:'excluded',slug:'arashiyama-train-hozugawa',content:{routeStudioV1:true}})).toBe(false);
  });
  it('loads an existing route, Hero video, timing, duration and photo gallery',()=>{
    const draft=draftFromProduct(product);
    expect(draft.heroVideo?.url).toBe('/hero.mp4');
    expect(draft.itinerary[1]).toMatchObject({attractionId:undefined,suggestedAttractionId:'amanohashidate',time:'10:30',stayMinutes:90,gallery:['/a.webp','/b.webp']});
  });
  it('uses reviewed exact attraction mappings and never maps combined ordinary nodes',()=>{
    const expected={'天桥立':'amanohashidate','智恩寺文殊堂':'chion-ji-monju-do','伊根舟屋':'ine-funaya','清水寺':'kiyomizu-dera','伏见稻荷大社':'fushimi-inari-taisha','奈良公园':'nara-park','白须神社':'shirahige-shrine','琵琶湖观景区域':'biwako-valley-lake-biwa','La Collina近江八幡':'la-collina-omihachiman','贵志站与特色电车':'kishi-station-cat-theme-trains','Toretore市场':'toretore-market','有马温泉':'arima-onsen','北野异人馆街':'kitano-ijinkan','神户港':'kobe-harbor-harborland','六甲山夜景':'mount-rokko-night-view','宇治平等院':'byodoin-phoenix-hall','源氏物语博物馆':'tale-of-genji-uji-chapters','宇治源氏之汤':'uji-genji-no-yu','胜尾寺':'katsuo-ji','爱宕念佛寺':'otagi-nenbutsu-ji','大原三千院':'sanzen-in','贵船神社':'kifune-shrine'};
    for(const [label,slug] of Object.entries(expected))expect(reviewedRouteStopAttractionIds[label]).toBe(slug);
    expect(reviewedRouteStopAttractionIds['千叠敷与三段壁']).toBeUndefined();
  });
  it('retains normal nodes while add, replace, remove and reorder remain plain array operations',()=>{
    const draft=draftFromProduct(product);const normal=draft.itinerary[0];const attraction=draft.itinerary[1];
    const added={id:'ine',editorId:'stop-ine',attractionId:'ine-funaya',time:'14:00',stayMinutes:60,gallery:[]} as const;
    const reordered=[added,normal,{...attraction,attractionId:'chion-ji-monju-do'}];
    const removed=reordered.filter(item=>item.editorId!==normal.editorId);
    expect(normal).toMatchObject({title:'京都站集合',type:'meeting'});
    expect(reordered[2].attractionId).toBe('chion-ji-monju-do');
    expect(removed.map(item=>item.id)).toEqual(['ine','ama']);
  });
  it('persists gallery and route metadata but removes all per-attraction video fields',()=>{
    const saved=persistedItinerary(draftFromProduct(product).itinerary);
    expect(saved[1]).toMatchObject({id:'ama',time:'10:30',stayMinutes:90,gallery:['/a.webp','/b.webp']});
    expect(saved[1]).not.toHaveProperty('video');expect(saved[1]).not.toHaveProperty('selectedVideoIds');expect(saved[1]).not.toHaveProperty('suggestedAttractionId');expect(saved[1].attractionId).toBeUndefined();
  });
  it('merges legacy string itinerary labels with stable operational stop data without inventing links',()=>{
    const legacy={...product,content:{...product.content,itinerary:['白须神社','琵琶湖自由活动'],itineraryStops:[{id:'shirahige',arrivalTime:'09:30',stayMinutes:60,location:'高岛市'},{id:'free',arrivalTime:'11:00',stayMinutes:90,type:'free'}]}};
    const draft=draftFromProduct(legacy);
    expect(draft.itinerary[0]).toMatchObject({id:'shirahige',title:'白须神社',time:'09:30',stayMinutes:60,suggestedAttractionId:'shirahige-shrine',attractionId:undefined});
    expect(draft.itinerary[1]).toMatchObject({id:'free',title:'琵琶湖自由活动',type:'free',attractionId:undefined,suggestedAttractionId:undefined});
  });
  it('keeps Hero video in the revision and switches route title and summary by locale',()=>{
    const draft=draftFromProduct(product);const content=draftContent(product,draft);const en=localizedDraft(draft,'en');
    expect(content.heroVideo).toMatchObject({url:'/hero.mp4',posterUrl:'/poster.webp'});
    expect(en).toMatchObject({title:'Amanohashidate & Ine',summary:'A coast day trip'});
    expect(en).toMatchObject({heroTitle:'Amanohashidate & Ine',heroSubtitle:'A coast day trip'});
    expect(en.itinerary[0].title).toBe('Meet at Kyoto Station');
  });
});

describe('Route Studio V1 readiness and locale safety',()=>{
  it('keeps linked attraction itinerary rows even when their route-specific title is intentionally empty',()=>{
    expect(publishedTripTimeline([{id:'ama',attractionId:'amanohashidate',time:'10:30'}],[])).toEqual([
      expect.objectContaining({id:'ama',attractionId:'amanohashidate',title:'',time:'10:30'}),
    ]);
    expect(publishedTripTimeline([{id:'empty'}],[])).toEqual([]);
  });
  it('turns the database readiness codes into concrete missing fields',()=>{
    expect(formatDepartureReadinessError('DEPARTURE_READINESS_MISSING:["product_not_published","meeting_address","price"]')).toBe('无法创建班次：\n✕ 产品尚未发布\n✕ 集合地址至少 5 个字符\n✕ 价格必须大于 0');
  });
  it('migration preserves validators and exposes an operations-only readiness function',()=>{
    const sql=readFileSync('supabase/migrations/20261007060521_route_studio_v1_departure_readiness.sql','utf8');
    expect(sql).toContain('operations_departure_readiness');expect(sql).toContain('route_catalog_complete');expect(sql).toContain('DEPARTURE_READINESS_MISSING');
    expect(sql).toContain('revoke all on function public.operations_departure_readiness');
  });
  it('creates new route drafts with all three required standard policy references',()=>{
    const sql=readFileSync('supabase/migrations/20261007064000_route_studio_product_policy_defaults.sql','utf8');
    expect(sql).toContain("template_key='jtw-day-trip-standard'");
    expect(sql).toContain("template_key='standard-10h-v1'");
    expect(sql).toContain("template_key='standard-24h-v1'");
    expect(sql).toContain('policy_template_id,service_time_policy_template_id,cancellation_policy_template_id');
  });
  it('does not leak Chinese Soul copy into Spanish when formal translation is missing',()=>{
    expect(discoverText(initialDiscoverHeroes[0],'es')).toEqual({title:'',subtitle:''});
    expect(discoverTranslationGaps(initialDiscoverHeroes[0])).toContain('es');
  });
  it('renders legacy structured policy sections without passing objects to React',()=>{
    expect(policyLocalizationText({title:'集合时间',body:'请提前十五分钟到达。'})).toBe('集合时间：请提前十五分钟到达。');
    expect(policyLocalizationText(['车辆费用','工作人员服务'])).toBe('车辆费用 / 工作人员服务');
  });
});
