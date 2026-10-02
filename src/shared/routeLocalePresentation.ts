import type {PassengerLocale} from './i18n/passengerLocale';
import type {Trip,TripTimelineItem} from './types';

type LocaleContent=Record<string,unknown>;

/**
 * A published route must not silently borrow Chinese route copy for another
 * locale.  Shared attractions and policies are resolved separately.
 */
export function routeLocaleContent(trip:Trip,locale:PassengerLocale):LocaleContent{
  if(locale==='zh-CN')return trip.localizedContent?.['zh-CN']??{};
  // Traditional Chinese is a presentation variant until dedicated route copy
  // is supplied. It may use the Chinese source, unlike every foreign locale.
  if(locale==='zh-TW')return trip.localizedContent?.['zh-TW']??trip.localizedContent?.['zh-CN']??{};
  return trip.localizedContent?.[locale]??{};
}

export function isRouteSourceLocale(locale:PassengerLocale){return locale==='zh-CN'||locale==='zh-TW';}

export function localizedRouteText(content:LocaleContent,key:string,fallback:string,allowSourceFallback:boolean){
  const value=content[key];
  return typeof value==='string'&&value.trim()?value.trim():(allowSourceFallback?fallback:'');
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
  const allowSourceFallback=isRouteSourceLocale(locale);
  return trip.timeline.map(item=>{
    const row=item.id?translated[item.id]??{}:{};
    const translatedText=(key:string,source:string|undefined='')=>{
      const value=row[key];
      return typeof value==='string'&&value.trim()?value.trim():(allowSourceFallback?source??'':'');
    };
    return {
      ...item,
      title:translatedText('stop_title',item.title),
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
