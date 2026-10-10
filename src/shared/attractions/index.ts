import type {TripTimelineItem} from '../types';
import {attractionGuideTitleAliases,type AttractionGuideLocale} from './guideIndex.generated';

export const attractionGuideLocales=['zh-CN','ja','en','ko','vi','ne','es'] as const;
export type AttractionLocale=typeof attractionGuideLocales[number];
const reviewedRouteStopAliases:Record<string,string>={
  '大原三千院':'sanzen-in',
  '三千院':'sanzen-in',
  '二年坂·三年坂':'ninenzaka-sannenzaka',
  '岚山·渡月桥':'arashiyama-togetsukyo',
  '岚山自由活动':'arashiyama-togetsukyo',
  '岚山竹林与渡月桥':'arashiyama-togetsukyo',
  '岚山竹林':'arashiyama-bamboo-tenryu-ji',
  '岚山地区自由活动':'arashiyama-bamboo-tenryu-ji',
  '琵琶湖观景台':'biwako-valley-lake-biwa',
  '宇治平等院':'byodoin-phoenix-hall',
  '神户港与马赛克摩天轮':'kobe-harbor-harborland',
  'La Collina近江八幡':'la-collina-omihachiman',
  '千叠敷':'senjojiki',
  '源氏物语博物馆':'tale-of-genji-uji-chapters',
  '白滨Toretore市场':'toretore-market',
  'Toretore温泉':'toretore-onsen',
};

export function isAttractionLocale(value:string):value is AttractionLocale{
  return (attractionGuideLocales as readonly string[]).includes(value);
}

/** A small index only: guide bodies remain in the lazy AttractionGuidePage chunk. */
export function resolveAttractionId(stop:Pick<TripTimelineItem,'title'|'attractionId'>,locale:string):string|null{
  if(stop.attractionId)return stop.attractionId;
  if(reviewedRouteStopAliases[stop.title])return reviewedRouteStopAliases[stop.title];
  const preferred=isAttractionLocale(locale)?locale:'zh-CN';
  const lookup=(aliases:Record<string,string>)=>aliases[stop.title];
  return lookup(attractionGuideTitleAliases[preferred as AttractionGuideLocale]??{})
    ?? lookup(attractionGuideTitleAliases['zh-CN']??{})
    ?? null;
}

export function attractionGuideHref(id:string,returnTo:string){
  return `/app/attractions/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(returnTo)}`;
}
