import {describe,expect,it} from 'vitest';
import {presentMeetingText,presentRoute,routeIdentityCode,routeStopIdentity} from './routeLocalePresentation';
import type {Trip} from './types';

const trip={id:'route-1',slug:'sanzenin-kibune-arashiyama-autumn',title:'三千院・贵船・岚山',shortTitle:'三千院・贵船・岚山',subtitle:'',summary:'中文简介',description:'',tagline:'',localizedContent:{'zh-CN':{title:'三千院・贵船・岚山',summary:'中文简介'},en:{title:'Sanzen-in, Kibune & Arashiyama',summary:'Approved English summary'}},timeline:[],stops:[],categories:[],heroImage:'',gallery:[],highlights:[],region:'',duration:'',walkingLevel:'',meetingPoint:null,departureTime:null,returnTime:null,price:null,priceStatus:'待公布',minimumGuests:null,maximumGuests:null,availableSeats:null,seatStatus:'未开放',included:[],excluded:[],languages:[],mealOptions:'',childPolicy:'',luggagePolicy:'',suitableFor:[],notices:[],packingList:[],clothingAdvice:'',friendlyReminders:[],assistanceStatus:'',cancellationPolicy:'',weatherPolicy:'',sourceUrl:'',imageCredits:[],status:'标准路线'} as Trip;

describe('route locale presentation',()=>{
  it('uses approved locale content when present',()=>expect(presentRoute(trip,'en')).toMatchObject({title:'Sanzen-in, Kibune & Arashiyama',available:true}));
  it('uses a stable non-marketing identity instead of Chinese source copy when absent',()=>{
    const presentation=presentRoute(trip,'vi');
    expect(presentation.available).toBe(false);
    expect(presentation.title).toBe('Tuyến · SANZENIN-KIBUNE-ARASHIYAMA-AUTUMN');
    expect(presentation.title).not.toContain('三千院');
  });
  it('keeps multiple incomplete products distinguishable instead of a generic Routes placeholder',()=>{
    expect(routeIdentityCode('kyoto-sunset')).toBe('KYOTO-SUNSET');
    expect(routeIdentityCode('nara-autumn')).toBe('NARA-AUTUMN');
    expect(routeIdentityCode('kyoto-sunset')).not.toBe(routeIdentityCode('nara-autumn'));
  });
  it('keeps route identities and unmapped stop identities distinguishable',()=>{
    expect(routeIdentityCode('a--b')).toBe('A-B');
    expect(routeStopIdentity('en',2,'fushimi-inari')).toBe('Route stop · FUSHIMI-INARI');
  });
  it('does not compose an untranslated source-locale meeting point into a foreign screen',()=>{
    expect(presentMeetingText('zh-CN','京都站八条口')).toBe('京都站八条口');
    expect(presentMeetingText('en','京都站八条口')).toContain('not yet available in this language');
    expect(presentMeetingText('en','京都站八条口')).not.toContain('京都站');
  });
});
