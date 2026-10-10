import type {OperationsProduct} from '../../shared/integrations/supabaseOperations';
import {localizedRouteList, reconcileRouteListItems, type RouteListItems} from '../../shared/contentPackages';
import {productSpotStableId, type ProductSpotVideo} from './productSpotVideo';

export type ProductEditorLocale = Record<string, unknown> & {
  title?: string;
  tagline?: string;
  summary?: string;
  description?: string;
  region?: string;
  duration?: string;
};

export type ProductEditorStop = Record<string, unknown> & {
  editorId: string;
  title?: string;
  name?: string;
  description?: string;
  location?: string;
  time?: string;
  stayMinutes?: number;
  attractionId?: string;
  suggestedAttractionId?: string;
  selectedImageIds?: string[];
  selectedVideoIds?: string[];
  imageUrl?: string;
  gallery?: string[];
  tip?: string;
};

export type ProductDraft = {
  title: string;
  tagline: string;
  summary: string;
  description: string;
  heroTitle: string;
  heroSubtitle: string;
  heroHighlightPhrase: string;
  heroVideo?: ProductSpotVideo;
  heroAspectRatio: string;
  departureCity: string;
  region: string;
  duration: string;
  walkingLevel: string;
  languages: string[];
  highlights: string[];
  included: string[];
  excluded: string[];
  preparation: string[];
  notices: string[];
  bookingNotice: string;
  cancellationPolicy: string;
  participantRules: string;
  weatherNotice: string;
  baggageNotice: string;
  safetyNotice: string;
  translationListItems: RouteListItems;
  heroImageUrl: string;
  gallery: string[];
  itinerary: ProductEditorStop[];
  routeReminders: Array<{id:string;type:string;sortOrder:number;enabled:boolean;locales:Record<string,{title:string;body:string}>}>;
  locales: Record<string, ProductEditorLocale>;
};

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const text = (value: unknown) => typeof value === 'string' ? value : '';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const video = (value: unknown): ProductSpotVideo | undefined => {
  const row = object(value);
  return typeof row.url === 'string' && typeof row.storagePath === 'string' && row.mimeType === 'video/mp4' && Number.isFinite(row.sizeBytes)
    ? row as ProductSpotVideo
    : undefined;
};
// Reviewed, exact legacy labels only.  This is deliberately not a normalized or
// fuzzy matcher: anything not listed remains an explicit mapping gap.
// Reviewed one-to-one labels only. Keep this deliberately exact: combined
// activities, meeting points and free-time nodes remain ordinary route nodes.
export const reviewedRouteStopAttractionIds:Record<string,string>={
  '天桥立':'amanohashidate','天橋立':'amanohashidate',
  '智恩寺文殊堂':'chion-ji-monju-do','智恩寺 文殊堂':'chion-ji-monju-do',
  '伊根舟屋':'ine-funaya','伊根の舟屋':'ine-funaya',
  '清水寺':'kiyomizu-dera','伏见稻荷大社':'fushimi-inari-taisha','伏見稲荷大社':'fushimi-inari-taisha',
  '奈良公园':'nara-park','奈良公園':'nara-park','白须神社':'shirahige-shrine','白须神社水上鸟居':'shirahige-shrine','白鬚神社':'shirahige-shrine',
  '琵琶湖观景区域':'biwako-valley-lake-biwa','琵琶湖观景台':'biwako-valley-lake-biwa',
  'La Collina近江八幡':'la-collina-omihachiman','La Collina 近江八幡':'la-collina-omihachiman',
  '贵志站与特色电车':'kishi-station-cat-theme-trains','貴志駅と特色電車':'kishi-station-cat-theme-trains',
  'Toretore市场':'toretore-market','白滨Toretore市场':'toretore-market','とれとれ市場':'toretore-market',
  '有马温泉':'arima-onsen','有馬温泉':'arima-onsen','北野异人馆街':'kitano-ijinkan','北野異人館街':'kitano-ijinkan',
  '神户港':'kobe-harbor-harborland','神户港与马赛克摩天轮':'kobe-harbor-harborland','神戸港':'kobe-harbor-harborland','六甲山夜景':'mount-rokko-night-view',
  '宇治平等院':'byodoin-phoenix-hall','平等院鳳凰堂':'byodoin-phoenix-hall',
  '源氏物语博物馆':'tale-of-genji-uji-chapters','源氏物語ミュージアム':'tale-of-genji-uji-chapters',
  '宇治源氏之汤':'uji-genji-no-yu','宇治源氏の湯':'uji-genji-no-yu',
  '胜尾寺':'katsuo-ji','勝尾寺':'katsuo-ji','爱宕念佛寺':'otagi-nenbutsu-ji','愛宕念仏寺':'otagi-nenbutsu-ji',
  '大原三千院':'sanzen-in','三千院':'sanzen-in','贵船神社':'kifune-shrine','貴船神社':'kifune-shrine',
};
const reviewedAttractionSuggestion=(value:Record<string,unknown>)=>{
  const title=text(value.title)||text(value.name);
  return reviewedRouteStopAttractionIds[title]||undefined;
};

function itinerarySource(content:Record<string,unknown>) {
  if (!Array.isArray(content.itinerary)) return [];
  const operational = Array.isArray(content.itineraryStops) ? content.itineraryStops : [];
  return content.itinerary.flatMap((item,index) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) return [item as Record<string,unknown>];
    if (typeof item !== 'string') return [];
    const operationalStop=object(operational[index]);
    return [{...operationalStop,title:item,time:text(operationalStop.time)||text(operationalStop.arrivalTime)}];
  });
}

export function draftFromProduct(product: OperationsProduct): ProductDraft {
  const content = product.content ?? {};
  const rawLocales = object(content.locales);
  return {
    title: product.title,
    tagline: text(content.tagline),
    summary: text(content.summary),
    description: text(content.description),
    heroTitle: text(content.heroTitle),
    heroSubtitle: text(content.heroSubtitle),
    heroHighlightPhrase: text(content.heroHighlightPhrase),
    heroVideo: video(content.heroVideo),
    heroAspectRatio: text(content.heroAspectRatio) || '16:9',
    departureCity: text(content.departureCity),
    region: text(content.region),
    duration: text(content.duration),
    walkingLevel: text(content.walkingLevel),
    languages: strings(content.languages),
    highlights: strings(content.highlights),
    included: strings(content.included),
    excluded: strings(content.excluded),
    preparation: strings(content.preparation),
    notices: strings(content.notices),
    bookingNotice: text(content.bookingNotice),
    cancellationPolicy: text(content.cancellationPolicy),
    participantRules: text(content.participantRules),
    weatherNotice: text(content.weatherNotice),
    baggageNotice: text(content.baggageNotice),
    safetyNotice: text(content.safetyNotice),
    translationListItems: reconcileRouteListItems(content.translationListItems, {highlights: strings(content.highlights), included: strings(content.included), excluded: strings(content.excluded), preparation: strings(content.preparation), notices: strings(content.notices)}),
    heroImageUrl: product.heroImageUrl ?? '',
    gallery: [...product.gallery],
    itinerary: itinerarySource(content).map((value,index) => {
      const id=productSpotStableId(value,index);const attractionId=text(value.attractionId)||undefined;
      const suggestedAttractionId=attractionId?undefined:reviewedAttractionSuggestion(value);
      return {...value,attractionId,suggestedAttractionId,id,editorId:`stop-${id}`} as ProductEditorStop;
    }),
    routeReminders: Array.isArray(content.routeReminders) ? content.routeReminders.flatMap((item,index) => {
      const value=object(item); const id=text(value.id)||`reminder-${index + 1}`; const rawLocales=object(value.locales); const locales=Object.fromEntries(Object.entries(rawLocales).flatMap(([locale,row])=>{const localized=object(row);const body=text(localized.body);return body?[[locale,{title:text(localized.title),body}]]:[]})); return Object.keys(locales).length ? [{id,type:text(value.type)||'other',sortOrder:Number(value.sortOrder??index),enabled:value.enabled!==false,locales}] : [];
    }) : [],
    locales: Object.fromEntries(Object.entries(rawLocales).map(([key, value]) => [key, object(value) as ProductEditorLocale])),
  };
}

export function persistedItinerary(items: ProductEditorStop[]) {
  return items.map(({editorId: _editorId, suggestedAttractionId: _suggestedAttractionId, video: _legacyVideo, selectedVideoIds: _legacyVideoIds, ...item}) => item);
}

export function draftContent(product: OperationsProduct, draft: ProductDraft) {
  const itinerary = persistedItinerary(draft.itinerary);
  const translationListItems = reconcileRouteListItems(draft.translationListItems, {highlights: draft.highlights, included: draft.included, excluded: draft.excluded, preparation: draft.preparation, notices: draft.notices});
  return {
    ...product.content,
    summary: draft.summary,
    tagline: draft.tagline,
    description: draft.description,
    heroTitle: draft.heroTitle,
    heroSubtitle: draft.heroSubtitle,
    heroHighlightPhrase: draft.heroHighlightPhrase,
    heroVideo: draft.heroVideo,
    heroAspectRatio: draft.heroAspectRatio,
    departureCity: draft.departureCity,
    region: draft.region,
    duration: draft.duration,
    walkingLevel: draft.walkingLevel,
    languages: draft.languages,
    stops: itinerary.map((item) => String(item.title ?? item.name ?? '')).filter(Boolean),
    itinerary,
    routeReminders: draft.routeReminders.map((item,index)=>({id:item.id,type:item.type,sortOrder:index,enabled:item.enabled,locales:item.locales})),
    highlights: draft.highlights,
    included: draft.included,
    excluded: draft.excluded,
    preparation: draft.preparation,
    notices: draft.notices,
    bookingNotice: draft.bookingNotice,
    cancellationPolicy: draft.cancellationPolicy,
    participantRules: draft.participantRules,
    weatherNotice: draft.weatherNotice,
    baggageNotice: draft.baggageNotice,
    safetyNotice: draft.safetyNotice,
    translationListItems,
    locales: draft.locales,
  };
}

export function localizedDraft(draft: ProductDraft, locale: string, options: {sourceFallback?: boolean} = {}) {
  if (locale === 'zh-CN') return draft;
  const localized = draft.locales[locale] ?? {};
  const localizedStops = object(localized.itinerary);
  const sourceFallback = options.sourceFallback !== false;
  return {
    ...draft,
    title: text(localized.title) || (sourceFallback ? draft.title : ''),
    tagline: text(localized.tagline) || (sourceFallback ? draft.tagline : ''),
    summary: text(localized.summary) || (sourceFallback ? draft.summary : ''),
    description: text(localized.description) || (sourceFallback ? draft.description : ''),
    heroTitle: text(localized.heroTitle) || text(localized.title) || (sourceFallback ? draft.heroTitle : ''),
    heroSubtitle: text(localized.heroSubtitle) || text(localized.summary) || (sourceFallback ? draft.heroSubtitle : ''),
    heroHighlightPhrase: text(localized.heroHighlightPhrase) || (sourceFallback ? draft.heroHighlightPhrase : ''),
    region: text(localized.region) || (sourceFallback ? draft.region : ''),
    duration: text(localized.duration) || (sourceFallback ? draft.duration : ''),
    highlights: localizedRouteList(localized, draft.translationListItems.highlights ?? [], 'highlights', draft.highlights, {sourceFallback}).filter(Boolean),
    included: localizedRouteList(localized, draft.translationListItems.included ?? [], 'included', draft.included, {sourceFallback}).filter(Boolean),
    excluded: localizedRouteList(localized, draft.translationListItems.excluded ?? [], 'excluded', draft.excluded, {sourceFallback}).filter(Boolean),
    preparation: localizedRouteList(localized, draft.translationListItems.preparation ?? [], 'preparation', draft.preparation, {sourceFallback}).filter(Boolean),
    notices: localizedRouteList(localized, draft.translationListItems.notices ?? [], 'notices', draft.notices, {sourceFallback}).filter(Boolean),
    bookingNotice: text(localized.bookingNotice) || (sourceFallback ? draft.bookingNotice : ''),
    cancellationPolicy: text(localized.cancellationPolicy) || (sourceFallback ? draft.cancellationPolicy : ''),
    participantRules: text(localized.participantRules) || (sourceFallback ? draft.participantRules : ''),
    weatherNotice: text(localized.weatherNotice) || (sourceFallback ? draft.weatherNotice : ''),
    baggageNotice: text(localized.baggageNotice) || (sourceFallback ? draft.baggageNotice : ''),
    safetyNotice: text(localized.safetyNotice) || (sourceFallback ? draft.safetyNotice : ''),
    routeReminders: draft.routeReminders.flatMap((item) => {
      if(item.enabled===false)return [];
      const localizedValue=object(item.locales[locale]); const value=text(localizedValue.body)||!sourceFallback?localizedValue:object(item.locales['zh-CN']);
      return text(value.body) ? [{...item, locales:{[locale]:{title:text(value.title),body:text(value.body)}}}] : [];
    }),
    itinerary: draft.itinerary.map((item) => {
      const stopId = String(item.id ?? item.stopId ?? item.placeId ?? ''); const translation = object(localizedStops[stopId]);
      return {...item, title: text(translation.stop_title) || text(translation.title) || (sourceFallback ? item.title : ''), subtitle: text(translation.subtitle) || (sourceFallback ? item.subtitle : ''), shortDescription: text(translation.shortDescription) || (sourceFallback ? item.shortDescription : ''), longDescription: text(translation.longDescription) || (sourceFallback ? item.longDescription : ''), description: text(translation.shortDescription) || text(translation.description) || (sourceFallback ? item.description : ''), tip: text(translation.tip) || (sourceFallback ? item.tip : '')};
    }),
  };
}
