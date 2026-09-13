import type {OperationsProduct} from '../../shared/integrations/supabaseOperations';

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
};

export type ProductDraft = {
  title: string;
  summary: string;
  description: string;
  region: string;
  duration: string;
  walkingLevel: string;
  languages: string[];
  highlights: string[];
  included: string[];
  excluded: string[];
  notices: string[];
  heroImageUrl: string;
  gallery: string[];
  itinerary: ProductEditorStop[];
  locales: Record<string, ProductEditorLocale>;
};

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const text = (value: unknown) => typeof value === 'string' ? value : '';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function editorId(value: Record<string, unknown>, index: number) {
  const stable = value.id ?? value.stopId ?? value.placeId;
  return stable ? `stop-${String(stable)}` : `stop-${index}-${crypto.randomUUID()}`;
}

export function draftFromProduct(product: OperationsProduct): ProductDraft {
  const content = product.content ?? {};
  const rawLocales = object(content.locales);
  return {
    title: product.title,
    summary: text(content.summary),
    description: text(content.description),
    region: text(content.region),
    duration: text(content.duration),
    walkingLevel: text(content.walkingLevel),
    languages: strings(content.languages),
    highlights: strings(content.highlights),
    included: strings(content.included),
    excluded: strings(content.excluded),
    notices: strings(content.notices),
    heroImageUrl: product.heroImageUrl ?? '',
    gallery: [...product.gallery],
    itinerary: Array.isArray(content.itinerary)
      ? content.itinerary.flatMap((item, index) => item && typeof item === 'object' && !Array.isArray(item)
        ? [{...(item as Record<string, unknown>), editorId: editorId(item as Record<string, unknown>, index)} as ProductEditorStop]
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
  return {
    ...product.content,
    summary: draft.summary,
    description: draft.description,
    region: draft.region,
    duration: draft.duration,
    walkingLevel: draft.walkingLevel,
    languages: draft.languages,
    stops: itinerary.map((item) => String(item.title ?? item.name ?? '')).filter(Boolean),
    itinerary,
    highlights: draft.highlights,
    included: draft.included,
    excluded: draft.excluded,
    notices: draft.notices,
    locales: draft.locales,
  };
}

export function localizedDraft(draft: ProductDraft, locale: string) {
  if (locale === 'zh-CN') return draft;
  const localized = draft.locales[locale] ?? {};
  return {
    ...draft,
    title: text(localized.title) || draft.title,
    summary: text(localized.summary) || draft.summary,
    description: text(localized.description) || draft.description,
    region: text(localized.region) || draft.region,
    duration: text(localized.duration) || draft.duration,
  };
}
