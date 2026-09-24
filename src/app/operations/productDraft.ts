import type {OperationsProduct} from '../../shared/integrations/supabaseOperations';
import {localizedRouteList, reconcileRouteListItems, type RouteListItems} from '../../shared/contentPackages';
import {productSpotStableId, type ProductSpotVideo} from './productSpotVideo';

export type ProductEditorLocale = Record<string, unknown> & {
  title?: string;
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
  imageUrl?: string;
  gallery?: string[];
  tip?: string;
  video?: ProductSpotVideo;
};

export type ProductDraft = {
  title: string;
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

export function draftFromProduct(product: OperationsProduct): ProductDraft {
  const content = product.content ?? {};
  const rawLocales = object(content.locales);
  return {
    title: product.title,
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
    itinerary: Array.isArray(content.itinerary)
      ? content.itinerary.flatMap((item, index) => item && typeof item === 'object' && !Array.isArray(item)
        ? (() => { const value = item as Record<string, unknown>; const id = productSpotStableId(value, index); return [{...value, id, editorId: `stop-${id}`} as ProductEditorStop]; })()
        : [])
      : [],
    locales: Object.fromEntries(Object.entries(rawLocales).map(([key, value]) => [key, object(value) as ProductEditorLocale])),
  };
}

export function persistedItinerary(items: ProductEditorStop[]) {
  return items.map(({editorId: _editorId, ...item}) => item);
}

export function draftContent(product: OperationsProduct, draft: ProductDraft) {
  const itinerary = persistedItinerary(draft.itinerary);
  const translationListItems = reconcileRouteListItems(draft.translationListItems, {highlights: draft.highlights, included: draft.included, excluded: draft.excluded, preparation: draft.preparation, notices: draft.notices});
  return {
    ...product.content,
    summary: draft.summary,
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

export function localizedDraft(draft: ProductDraft, locale: string) {
  if (locale === 'zh-CN') return draft;
  const localized = draft.locales[locale] ?? {};
  const localizedStops = object(localized.itinerary);
  return {
    ...draft,
    title: text(localized.title) || draft.title,
    summary: text(localized.summary) || draft.summary,
    description: text(localized.description) || draft.description,
    heroTitle: text(localized.heroTitle) || draft.heroTitle,
    heroSubtitle: text(localized.heroSubtitle) || draft.heroSubtitle,
    heroHighlightPhrase: text(localized.heroHighlightPhrase) || draft.heroHighlightPhrase,
    region: text(localized.region) || draft.region,
    duration: text(localized.duration) || draft.duration,
    highlights: localizedRouteList(localized, draft.translationListItems.highlights ?? [], 'highlights', draft.highlights),
    included: localizedRouteList(localized, draft.translationListItems.included ?? [], 'included', draft.included),
    excluded: localizedRouteList(localized, draft.translationListItems.excluded ?? [], 'excluded', draft.excluded),
    preparation: localizedRouteList(localized, draft.translationListItems.preparation ?? [], 'preparation', draft.preparation),
    notices: localizedRouteList(localized, draft.translationListItems.notices ?? [], 'notices', draft.notices),
    bookingNotice: text(localized.bookingNotice) || draft.bookingNotice,
    cancellationPolicy: text(localized.cancellationPolicy) || draft.cancellationPolicy,
    participantRules: text(localized.participantRules) || draft.participantRules,
    weatherNotice: text(localized.weatherNotice) || draft.weatherNotice,
    baggageNotice: text(localized.baggageNotice) || draft.baggageNotice,
    safetyNotice: text(localized.safetyNotice) || draft.safetyNotice,
    itinerary: draft.itinerary.map((item) => {
      const stopId = String(item.id ?? item.stopId ?? item.placeId ?? ''); const translation = object(localizedStops[stopId]);
      return {...item, title: text(translation.stop_title) || text(translation.title) || item.title, subtitle: text(translation.subtitle) || item.subtitle, shortDescription: text(translation.shortDescription) || item.shortDescription, longDescription: text(translation.longDescription) || item.longDescription, description: text(translation.shortDescription) || text(translation.description) || item.description, tip: text(translation.tip) || item.tip};
    }),
  };
}
