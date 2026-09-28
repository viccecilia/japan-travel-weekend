import type {Trip} from '../types';

export const routeVisibleFields=['title','tagline','subtitle','summary','description','highlights','meetingPoint','notices','itinerary','cta'] as const;
export type RouteVisibleField=typeof routeVisibleFields[number];
export type RouteLocalizationAudit={field:RouteVisibleField;total:number;fullyLocalized:number;partiallyLocalized:number;missing:number;hardCoded:number};
const requiredLocales=['zh-CN','ja','en','ko','vi','ne','es'];
const valueFor=(trip:Trip,field:RouteVisibleField,locale:string):unknown=>{
  if(locale==='zh-CN')return field==='itinerary'?trip.timeline:field==='meetingPoint'||field==='cta'?null:trip[field as keyof Trip];
  const local=trip.localizedContent?.[locale]??{};
  if(field==='itinerary')return local.itinerary;
  return local[field]??(field==='title'?local.title:undefined);
};
const present=(value:unknown)=>Array.isArray(value)?value.length>0:typeof value==='string'?value.trim().length>0:Boolean(value);
export function auditRouteLocalization(trips:Trip[]):{rows:RouteLocalizationAudit[];missingTitles:Array<{routeId:string;title:string;sourceLocale:string}>}{
  const rows=routeVisibleFields.map(field=>{let fullyLocalized=0,partiallyLocalized=0,missing=0,hardCoded=0;for(const trip of trips){const translated=requiredLocales.filter(locale=>present(valueFor(trip,field,locale))).length;if(translated===requiredLocales.length)fullyLocalized++;else if(translated>1)partiallyLocalized++;else missing++;if(field!=='meetingPoint'&&field!=='cta'&&localeOnlyChinese(trip,field))hardCoded++;}return {field,total:trips.length,fullyLocalized,partiallyLocalized,missing,hardCoded};});
  return {rows,missingTitles:trips.filter(trip=>!requiredLocales.slice(1).every(locale=>present(valueFor(trip,'title',locale)))).map(trip=>({routeId:trip.slug,title:trip.title,sourceLocale:'zh-CN'}))};
}
function localeOnlyChinese(trip:Trip,field:RouteVisibleField){return present(valueFor(trip,field,'zh-CN'))&&!requiredLocales.slice(1).some(locale=>present(valueFor(trip,field,locale)));}
