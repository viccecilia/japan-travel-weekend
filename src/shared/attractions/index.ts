import type {TripTimelineItem} from '../types';
import {attractionGuideTitleAliases,type AttractionGuideLocale} from './guideIndex.generated';

export const attractionGuideLocales=['zh-CN','ja','en','ko','vi','ne','es'] as const;
export type AttractionLocale=typeof attractionGuideLocales[number];

export function isAttractionLocale(value:string):value is AttractionLocale{
  return (attractionGuideLocales as readonly string[]).includes(value);
}

/** A small index only: guide bodies remain in the lazy AttractionGuidePage chunk. */
export function resolveAttractionId(stop:Pick<TripTimelineItem,'title'|'attractionId'>,locale:string):string|null{
  if(stop.attractionId)return stop.attractionId;
  const preferred=isAttractionLocale(locale)?locale:'zh-CN';
  const lookup=(aliases:Record<string,string>)=>aliases[stop.title]??Object.entries(aliases).find(([title])=>normalizeTitle(title)===normalizeTitle(stop.title))?.[1];
  return lookup(attractionGuideTitleAliases[preferred as AttractionGuideLocale]??{})
    ?? lookup(attractionGuideTitleAliases['zh-CN']??{})
    ?? null;
}

// Existing routes used both Japanese and Chinese middle-dot punctuation before
// canonical ids existed. Normalize that presentation-only difference, never a fuzzy title match.
const normalizeTitle=(value:string)=>value.normalize('NFKC').replace(/[・·]/g,'').replace(/\s+/g,'').trim();

export function attractionGuideHref(id:string,returnTo:string){
  return `/app/attractions/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(returnTo)}`;
}
