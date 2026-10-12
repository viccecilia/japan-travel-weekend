import {describe,expect,it} from 'vitest';import {reconciledPublishedTripTimeline,replacePublishedTripCatalog,travelRepository} from '../src/shared/data/repository';import {trips} from '../src/shared/data/trips';
describe('published catalog projection',()=>{it('replaces visible product copy while retaining safe baseline fields',()=>{const original=structuredClone(trips);replacePublishedTripCatalog([{id:'db-1',slug:'arashiyama-train-hozugawa',title:'后台发布标题',content:{summary:'后台发布摘要',stops:['新景点']},heroImageUrl:'/new.webp',gallery:['/new.webp','/second.webp'],revisionNumber:2,updatedAt:'2026-09-09T00:00:00Z'}]);expect(travelRepository.getTrip('arashiyama-train-hozugawa')).toMatchObject({id:'db-1',title:'后台发布标题',summary:'后台发布摘要',stops:['新景点'],heroImage:'/new.webp',gallery:['/new.webp','/second.webp']});trips.splice(0,trips.length,...original)});});
describe('published catalog isolation',()=>{it('does not copy another route when operations publishes a new slug',()=>{const original=structuredClone(trips);replacePublishedTripCatalog([{id:'db-new',slug:'new-route',title:'新路线',content:{summary:'独立摘要',region:'神户',duration:'8小时',stops:['港口'],locales:{ja:{title:'新しい旅',stops:['港']}}},heroImageUrl:'/new-route.webp',gallery:[],revisionNumber:1,updatedAt:'2026-09-09T00:00:00Z'}]);expect(travelRepository.getTrip('new-route')).toMatchObject({title:'新路线',summary:'独立摘要',region:'神户',duration:'8小时',stops:['港口'],heroImage:'/new-route.webp',catalogSource:'published',localizedContent:{ja:{title:'新しい旅',stops:['港']}}});expect(travelRepository.getTrip('new-route')?.description).toBe('');trips.splice(0,trips.length,...original)});});
describe('rich itinerary projection',()=>{it('accepts legacy name and canonical title without restoring stale static content',()=>{const original=structuredClone(trips);replacePublishedTripCatalog([{id:'db-rich',slug:'kyoto-nara-classic',title:'公开标题',content:{itinerary:[{name:'旧字段景点',description:'旧字段仍能显示',stayMinutes:45},{title:'新字段景点',description:'后台发布的具体介绍',location:'京都',imageUrl:'/spot.webp',highlights:['亮点']}],stops:[],summary:''},heroImageUrl:'/hero.webp',gallery:[],revisionNumber:3,updatedAt:'2026-09-09T00:00:00Z'}]);expect(travelRepository.getTrip('kyoto-nara-classic')).toMatchObject({summary:'',stops:[],timeline:[{title:'旧字段景点',detail:'旧字段仍能显示',stayMinutes:45},{title:'新字段景点',detail:'后台发布的具体介绍',location:'京都',imageUrl:'/spot.webp',highlights:['亮点']}]});trips.splice(0,trips.length,...original)});});

describe('published operational timeline compatibility',()=>{
  it('keeps meeting and return nodes while adding real legacy arrival times to linked attractions',()=>{
    const timeline=reconciledPublishedTripTimeline([
      {id:'legacy-stop-1',attractionId:'amanohashidate',title:'天桥立',stayMinutes:100},
      {id:'legacy-stop-2',attractionId:'chion-ji-monju-do',title:'智恩寺文殊堂',stayMinutes:40},
      {id:'legacy-stop-3',attractionId:'ine-funaya',title:'伊根舟屋',stayMinutes:100},
    ],[
      {id:'osaka-departure',name:'大阪日本桥集合出发',arrivalTime:'08:30'},
      {id:'kyoto-pickup',name:'京都站集合出发',arrivalTime:'09:40'},
      {id:'amanohashidate',name:'天桥立',arrivalTime:'11:20'},
      {id:'ine',name:'伊根舟屋',arrivalTime:'14:30'},
      {id:'osaka-return',name:'预计返回大阪'},
    ],[]);
    expect(timeline.map(item=>[item.title,item.time])).toEqual([
      ['大阪日本桥集合出发','08:30'],
      ['京都站集合出发','09:40'],
      ['天桥立','11:20'],
      ['智恩寺文殊堂',null],
      ['伊根舟屋','14:30'],
      ['预计返回大阪',null],
    ]);
    expect(timeline[2]).toMatchObject({id:'legacy-stop-1',attractionId:'amanohashidate',stayMinutes:100});
  });

  it('matches a reviewed operational title without replacing newer attraction copy',()=>{
    const timeline=reconciledPublishedTripTimeline([
      {id:'legacy-stop-1',attractionId:'kiyomizu-dera',title:'清水寺',detail:'正式景点简介'},
    ],[
      {id:'osaka-departure',name:'大阪日本桥集合出发',arrivalTime:'08:30'},
      {id:'kiyomizu',name:'清水寺与东山历史街区',arrivalTime:'10:00'},
    ],[]);
    expect(timeline[1]).toMatchObject({id:'legacy-stop-1',attractionId:'kiyomizu-dera',title:'清水寺',detail:'正式景点简介',time:'10:00'});
  });

  it('retains uploaded route photos when the linked attraction row has empty media fields',()=>{
    const timeline=reconciledPublishedTripTimeline([
      {id:'shirarahama',attractionId:'shirarahama',title:'白良滨',gallery:[],selectedImageIds:[]},
      {id:'senjojiki-sandanbeki',attractionId:'senjojiki-sandanbeki',title:'千叠敷与三段壁',gallery:[],selectedImageIds:[]},
    ],[
      {id:'osaka-departure',name:'大阪日本桥集合出发',arrivalTime:'08:30'},
      {id:'shirarahama',name:'白良滨',arrivalTime:'12:00'},
      {id:'senjojiki-sandanbeki',name:'千叠敷与三段壁',arrivalTime:'14:00',imageUrl:'/route/senjojiki.webp',gallery:['/route/senjojiki.webp','/route/sandanbeki.webp'],selectedImageIds:['senjojiki','sandanbeki']},
    ],[]);
    expect(timeline[2]).toMatchObject({
      id:'senjojiki-sandanbeki',
      attractionId:'senjojiki-sandanbeki',
      imageUrl:'/route/senjojiki.webp',
      gallery:['/route/senjojiki.webp','/route/sandanbeki.webp'],
      selectedImageIds:['senjojiki','sandanbeki'],
    });
  });
});
