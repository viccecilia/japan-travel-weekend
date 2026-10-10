import {describe,expect,it} from 'vitest';
import {legacyRouteSlugs} from '../src/shared/i18n/routeLegacyContent';
import {localizedRouteTimeline,routeHeroPresentation,routeLocaleContent} from '../src/shared/routeLocalePresentation';
import type {Trip} from '../src/shared/types';

const trip={
  id:'route-1',slug:'route-1',title:'中文路线',shortTitle:'中文路线',summary:'中文摘要',description:'中文介绍',
  timeline:[{id:'sanzen-in',title:'大原三千院',detail:'旧中文景点说明',attractionId:'sanzen-in'},{id:'free-time',title:'岚山自由活动',detail:'旧中文活动说明'}],
  localizedContent:{'zh-CN':{title:'中文路线',itinerary:{'sanzen-in':{stop_title:'大原三千院'}}},ja:{title:'京都の日帰り旅',itinerary:{'sanzen-in':{stop_title:'三千院'}}}},
} as unknown as Trip;

describe('route locale presentation',()=>{
  it('restores an existing human locale pack before declaring a content gap',()=>{
    const legacy={...trip,slug:'sanzenin-kibune-arashiyama-autumn'};
    expect(routeLocaleContent(legacy,'vi')).toMatchObject({title:'Mùa thu Kyoto: Sanzenin, Kibune & Arashiyama'});
    const timeline=localizedRouteTimeline(legacy,'vi');
    expect(timeline[0].title).toBe('Chùa Sanzenin, Ohara');
    expect(timeline[0].detail).toBe('');
  });

  it('never borrows Chinese route text for a foreign locale with neither published nor human content',()=>{
    const missing={...trip,slug:'route-with-no-human-locale'};
    expect(routeLocaleContent(missing,'vi')).toEqual({});
    const timeline=localizedRouteTimeline(missing,'vi');
    expect(timeline[0].title).toBe('');
    expect(timeline[0].detail).toBe('');
  });

  it('keeps the current-locale published record ahead of an existing human locale pack',()=>{
    const published={...trip,slug:'sanzenin-kibune-arashiyama-autumn',localizedContent:{...trip.localizedContent,en:{title:'Current published English title',summary:'Current published English summary'}}};
    expect(routeLocaleContent(published,'en')).toMatchObject({title:'Current published English title',summary:'Current published English summary'});
  });

  it('keeps all nine human route packs available in every supported foreign locale',()=>{
    const foreignLocales=['ja','en','es','vi','ne','ko'] as const;
    expect(legacyRouteSlugs().size).toBe(9);
    for(const slug of legacyRouteSlugs()){
      for(const locale of foreignLocales){
        const content=routeLocaleContent({...trip,slug},locale);
        expect(content.title,`${slug} ${locale}`).toEqual(expect.any(String));
        expect((content.title as string).trim(),`${slug} ${locale}`).not.toBe('');
      }
    }
  });

  it('keeps official localized route text and leaves linked attraction loading to the attraction library',()=>{
    const timeline=localizedRouteTimeline(trip,'ja');
    expect(timeline[0]).toMatchObject({title:'三千院',attractionId:'sanzen-in'});
    expect(timeline[1]).toMatchObject({title:'',detail:''});
  });

  it('retains source-language compatibility for an unresolved legacy route',()=>{
    expect(localizedRouteTimeline(trip,'zh-CN')[1]).toMatchObject({title:'岚山自由活动',detail:'旧中文活动说明'});
  });

  it('matches legacy attraction names by attraction order without consuming positions for ordinary nodes',()=>{
    const route={...trip,slug:'biwako-shirahige',localizedContent:{},timeline:[
      {id:'meeting-osaka',title:'大阪日本桥集合'},
      {id:'meeting-kyoto',title:'京都站集合'},
      {id:'shirahige',title:'白须神社',attractionId:'shirahige-shrine'},
      {id:'biwako',title:'琵琶湖观景区域',attractionId:'biwako-valley-lake-biwa'},
      {id:'collina',title:'La Collina近江八幡',attractionId:'la-collina-omihachiman'},
      {id:'return',title:'返回大阪'},
    ]} as unknown as Trip;
    const timeline=localizedRouteTimeline(route,'zh-TW');
    expect(timeline.map(item=>item.title)).toEqual([
      '大阪日本桥集合','京都站集合','白鬚神社','琵琶湖觀景處','La Collina 近江八幡','返回大阪',
    ]);
  });

  it('uses canonical source Hero copy instead of an internal route title and keeps foreign Hero localized',()=>{
    const heroTrip={...trip,heroTitle:'Route Studio V1 Test Route',heroSubtitle:'公开中文 Hero 副标题',localizedContent:{...trip.localizedContent,'zh-CN':{title:'ROUTE-STUDIO-V1-QA · Test Only'},en:{title:'English public route',summary:'English public summary'}}} as unknown as Trip;
    expect(routeHeroPresentation(heroTrip,'zh-CN')).toEqual({title:'Route Studio V1 Test Route',subtitle:'公开中文 Hero 副标题',duration:heroTrip.duration});
    expect(routeHeroPresentation(heroTrip,'en')).toEqual({title:'English public route',subtitle:'English public summary',duration:''});
    expect(routeHeroPresentation(heroTrip,'vi')).toEqual({title:'',subtitle:'',duration:''});
  });
});
