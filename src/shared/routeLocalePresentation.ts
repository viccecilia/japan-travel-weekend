import type {PassengerLocale} from './i18n/passengerLocale';
import {legacyRouteContent} from './i18n/routeLegacyContent';
import type {Trip,TripTimelineItem} from './types';

type LocaleContent=Record<string,unknown>;

/**
 * A published route must not silently borrow Chinese route copy for another
 * locale.  Shared attractions and policies are resolved separately.
 */
function meaningful(value:unknown){
  return Array.isArray(value)?value.length>0:typeof value==='string'?Boolean(value.trim()):value!==null&&value!==undefined;
}

function publishedLocaleContent(trip:Trip,locale:PassengerLocale):LocaleContent{
  if(locale==='zh-CN')return trip.localizedContent?.['zh-CN']??{};
  // Traditional Chinese is a presentation variant until dedicated route copy
  // is supplied. It may use the Chinese source, unlike every foreign locale.
  if(locale==='zh-TW')return trip.localizedContent?.['zh-TW']??trip.localizedContent?.['zh-CN']??{};
  return trip.localizedContent?.[locale]??{};
}

function legacyLocaleContent(trip:Trip,locale:PassengerLocale):LocaleContent{
  const legacy=legacyRouteContent(locale,trip.slug);
  if(!legacy)return {};
  return {
    title:legacy.title,
    shortTitle:legacy.title,
    heroTitle:legacy.title,
    summary:legacy.summary,
    heroSubtitle:legacy.summary,
    region:legacy.region,
    duration:legacy.duration,
    stops:legacy.stops,
  };
}

/**
 * Passenger route content has one strict priority order:
 * current-locale published content, then the pre-existing human locale pack,
 * then the caller's localized content-gap state. Empty published fields do
 * not erase a human-authored fallback. Foreign locales never use Chinese.
 */
export function routeLocaleContent(trip:Trip,locale:PassengerLocale):LocaleContent{
  const merged={...legacyLocaleContent(trip,locale)};
  for(const [key,value] of Object.entries(publishedLocaleContent(trip,locale))){
    if(meaningful(value))merged[key]=value;
  }
  return merged;
}

export function isRouteSourceLocale(locale:PassengerLocale){return locale==='zh-CN'||locale==='zh-TW';}

export function localizedRouteText(content:LocaleContent,key:string,fallback:string,allowSourceFallback:boolean){
  const value=content[key];
  return typeof value==='string'&&value.trim()?value.trim():(allowSourceFallback?fallback:'');
}

/** Root Hero copy is the canonical source-language presentation, while every
 * foreign locale must use its own published title/summary without borrowing
 * Chinese. */
export function routeHeroPresentation(trip:Trip,locale:PassengerLocale){
  const content=routeLocaleContent(trip,locale);
  const source=isRouteSourceLocale(locale);
  const localizedTitle=localizedRouteText(content,'title',trip.shortTitle||trip.title,source);
  const localizedSummary=localizedRouteText(content,'summary',trip.summary,source);
  const heroValue=(key:string,fallback:string)=>{
    const value=content[key];
    return typeof value==='string'&&value.trim()?value.trim():fallback;
  };
  return {
    title:heroValue('heroTitle',source?trip.heroTitle||localizedTitle:localizedTitle),
    subtitle:heroValue('heroSubtitle',source?trip.heroSubtitle||localizedSummary:localizedSummary),
    duration:heroValue('duration',source?trip.duration:''),
  };
}

function itineraryTranslations(content:LocaleContent){
  const value=content.itinerary;
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,Record<string,unknown>>:{};
}

/**
 * Route stops retain timing and route-specific metadata. For foreign locales,
 * no legacy RouteStop prose leaks through when a localized record is absent.
 * Linked Attraction text is loaded by the presentation component itself.
 */
export function localizedRouteTimeline(trip:Trip,locale:PassengerLocale):TripTimelineItem[]{
  const translated=itineraryTranslations(routeLocaleContent(trip,locale));
  const legacyStops=legacyRouteContent(locale,trip.slug)?.stops??[];
  const allowSourceFallback=isRouteSourceLocale(locale);
  return trip.timeline.map((item,index)=>{
    const row=item.id?translated[item.id]??{}:{};
    const translatedText=(key:string,source:string|undefined='',legacyFallback='')=>{
      const value=row[key];
      return typeof value==='string'&&value.trim()?value.trim():(legacyFallback|| (allowSourceFallback?source??'':''));
    };
    return {
      ...item,
      title:translatedText('stop_title',item.title,legacyStops[index]??''),
      subtitle:translatedText('subtitle',item.subtitle),
      detail:translatedText('shortDescription',translatedText('description',item.detail)),
      shortDescription:translatedText('shortDescription',item.shortDescription??item.detail),
      longDescription:translatedText('longDescription',item.longDescription),
      videoLabel:translatedText('videoLabel',item.videoLabel),
      tip:translatedText('tip',item.tip),
    };
  });
}

export type RouteLocaleAvailability={
  title:boolean;tagline:boolean;summary:boolean;description:boolean;highlights:boolean;routeReminders:boolean;
};

export function routeLocaleAvailability(trip:Trip,locale:PassengerLocale):RouteLocaleAvailability{
  const content=routeLocaleContent(trip,locale);
  const present=(key:string)=>{
    const value=content[key];
    return Array.isArray(value)?value.length>0:typeof value==='string'?value.trim().length>0:Boolean(value);
  };
  return {title:present('title'),tagline:present('tagline'),summary:present('summary'),description:present('description'),highlights:present('highlights'),routeReminders:present('routeReminders')};
}

/**
 * A stable identity is deliberately not a translation.  It lets a passenger
 * distinguish unpublished locale content without presenting the Chinese route
 * title as if it were approved foreign-language copy.
 */
export function routeIdentityCode(slug:string){
  return slug.trim().replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase()||'UNAVAILABLE';
}

const unavailableCopy:Record<PassengerLocale,{route:string;content:string;stop:string;meeting:string}>={
  'zh-CN':{route:'路线',content:'当前语言的路线内容尚未提供',stop:'行程站点',meeting:'集合信息尚未提供'},
  'zh-TW':{route:'路線',content:'目前語言的路線內容尚未提供',stop:'行程站點',meeting:'集合資訊尚未提供'},
  ja:{route:'ツアー',content:'この言語のツアー内容はまだありません',stop:'行程スポット',meeting:'集合情報はまだありません'},
  en:{route:'Route',content:'Route content is not yet available in this language',stop:'Route stop',meeting:'Meeting information is not yet available in this language'},
  es:{route:'Ruta',content:'El contenido de esta ruta todavía no está disponible en este idioma',stop:'Parada de ruta',meeting:'La información de encuentro todavía no está disponible en este idioma'},
  vi:{route:'Tuyến',content:'Nội dung tuyến hiện chưa có bằng ngôn ngữ này',stop:'Điểm dừng',meeting:'Thông tin tập trung hiện chưa có bằng ngôn ngữ này'},
  ne:{route:'मार्ग',content:'यस भाषामा मार्गको सामग्री उपलब्ध छैन',stop:'मार्ग रोक',meeting:'भेट्ने जानकारी उपलब्ध छैन'},
  ko:{route:'노선',content:'현재 언어의 노선 정보가 없습니다',stop:'경유지',meeting:'현재 언어의 집합 정보가 없습니다'},
};

export type RoutePresentation={title:string;tagline:string;summary:string;available:boolean;identity:string;availabilityMessage:string};

/** Single presentation contract used by route cards, orders and Trip Room. */
export function presentRoute(trip:Trip,locale:PassengerLocale):RoutePresentation{
  const content=routeLocaleContent(trip,locale);
  const source=isRouteSourceLocale(locale);
  const title=localizedRouteText(content,'title',trip.shortTitle||trip.title,source);
  const tagline=localizedRouteText(content,'tagline',trip.tagline??trip.subtitle,source);
  const summary=localizedRouteText(content,'summary',trip.summary,source);
  const copy=unavailableCopy[locale];
  const identity=`${copy.route} · ${routeIdentityCode(trip.slug)}`;
  return {title:title||identity,tagline,summary,available:Boolean(title),identity,availabilityMessage:copy.content};
}

export function unavailableMeetingPresentation(locale:PassengerLocale){return unavailableCopy[locale].meeting;}

/** Operational meeting copy has the same no-silent-source-fallback contract. */
export function presentMeetingText(locale:PassengerLocale,value:string|null|undefined){
  return isRouteSourceLocale(locale)?value?.trim()||unavailableMeetingPresentation(locale):unavailableMeetingPresentation(locale);
}

export function routeStopIdentity(locale:PassengerLocale,index:number,stableId?:string){
  const copy=unavailableCopy[locale];
  const code=stableId?routeIdentityCode(stableId):String(index+1).padStart(2,'0');
  return `${copy.stop} · ${code}`;
}
