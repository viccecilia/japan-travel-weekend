import type {DiscoverHero, DiscoverHeroTranslation} from './discover';
import type {OperationsProduct} from './integrations/supabaseOperations';

export const CONTENT_PACKAGE_SCHEMA = 'jtw-content-package/v1';
export const TRANSLATION_PACKAGE_SCHEMA = 'jtw-translation-package/v1';
export const SOURCE_LOCALE = 'zh-CN' as const;
export const TARGET_LOCALES = ['zh-TW', 'ja', 'en', 'ko', 'es', 'vi', 'ne'] as const;
export type TargetLocale = typeof TARGET_LOCALES[number];
export type TranslationStatus = 'missing' | 'draft' | 'reviewed' | 'published' | 'stale';
export const ROUTE_LIST_KEYS = ['highlights', 'included', 'excluded', 'preparation', 'notices'] as const;
export type RouteListKey = typeof ROUTE_LIST_KEYS[number];
export type RouteListItem = {id: string; source: string};
export type RouteListItems = Partial<Record<RouteListKey, RouteListItem[]>>;
export type TranslationProfile = 'hero_title' | 'hero_subtitle' | 'highlight_phrase' | 'theme_chip' | 'route_title' | 'route_summary' | 'spot_name' | 'spot_short_description' | 'spot_long_description' | 'itinerary_step' | 'meeting_instruction' | 'included_item' | 'excluded_item' | 'preparation' | 'cta' | 'policy' | 'safety_notice' | 'nav_short_label' | 'generic_body';

type Json = string | number | boolean | null | Json[] | {[key: string]: Json};
type JsonRecord = Record<string, Json>;
export type PackageIssue = {severity: 'error' | 'warning'; code: string; path: string; message: string};
export type PackageField = {
  id: string;
  entity_type: 'route' | 'discover_hero';
  entity_id: string;
  item_id?: string;
  field_key: string;
  path: string;
  source_text: string;
  source_hash: string;
  translation_profile: TranslationProfile;
  context: string;
  ui_hint?: string;
  max_length?: number;
  single_line?: boolean;
  preserve_numbers?: boolean;
  locked_tokens?: string[];
  translations: Partial<Record<TargetLocale, {text: string; status: TranslationStatus; source_hash: string}>>;
};
export type TranslationPackage = {
  schema_version: typeof TRANSLATION_PACKAGE_SCHEMA;
  package_id: string;
  source_locale: typeof SOURCE_LOCALE;
  target_locales: TargetLocale[];
  entity: {entity_type: 'route' | 'discover_hero'; entity_id: string; entity_slug?: string; source_version: number};
  task_instructions: string[];
  translator_instructions: string[];
  translation_profiles: Record<TranslationProfile, string[]>;
  glossary: Array<{source: string; preferred: string; note?: string}>;
  locked: Record<string, Json>;
  fields: PackageField[];
};

export type RouteContentPackage = {
  schema_version: typeof CONTENT_PACKAGE_SCHEMA;
  package_id: string;
  entity: {entity_type: 'route'; entity_id?: string; slug: string; mode: 'create' | 'update'};
  source_locale: typeof SOURCE_LOCALE;
  authoring_instructions?: string[];
  review_notes?: string[];
  route: {title: string; content: Record<string, unknown>; hero_image_url?: string | null; gallery?: string[]};
};
export type DiscoverContentPackage = {
  schema_version: typeof CONTENT_PACKAGE_SCHEMA;
  package_id: string;
  entity: {entity_type: 'discover_hero'; entity_id?: string; mode: 'create' | 'update'};
  source_locale: typeof SOURCE_LOCALE;
  authoring_instructions?: string[];
  review_notes?: string[];
  hero: Pick<DiscoverHero, 'video_url' | 'poster_url' | 'product_id' | 'product_slug' | 'enabled' | 'sort_order'> & {title: string; subtitle: string; highlight_phrase?: string};
};
export type ContentPackage = RouteContentPackage | DiscoverContentPackage;
export const isRouteContentPackage = (value: ContentPackage): value is RouteContentPackage => value.entity.entity_type === 'route';
export const isDiscoverContentPackage = (value: ContentPackage): value is DiscoverContentPackage => value.entity.entity_type === 'discover_hero';

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const id = (prefix: string, ...parts: string[]) => `${prefix}:${parts.map(part => encodeURIComponent(part)).join(':')}`;
const routeListKey = (value: string): value is RouteListKey => (ROUTE_LIST_KEYS as readonly string[]).includes(value);
const asListItems = (value: unknown): RouteListItem[] => Array.isArray(value) ? value.flatMap(item => {
  const row = asRecord(item); const itemId = string(row.id).trim(); const source = string(row.source);
  return itemId && source ? [{id: itemId, source}] : [];
}) : [];

const normalizeListSource = (value: string) => value.trim().replace(/\s+/g, '').toLocaleLowerCase();
const isClearListEdit = (previous: string, next: string) => {
  const before = normalizeListSource(previous); const after = normalizeListSource(next);
  if (!before || !after || before === after) return false;
  let sharedPrefix = 0;
  while (sharedPrefix < before.length && sharedPrefix < after.length && before[sharedPrefix] === after[sharedPrefix]) sharedPrefix += 1;
  return sharedPrefix >= 2 && sharedPrefix / Math.max(before.length, after.length) >= 0.5;
};
const nextListItemId = (key: RouteListKey, used: Set<string>) => {
  let ordinal = 1; let candidate = `list-${key}-${ordinal}`;
  while (used.has(candidate)) { ordinal += 1; candidate = `list-${key}-${ordinal}`; }
  used.add(candidate); return candidate;
};

/**
 * List values remain strings for the route editor, while this sidecar stores
 * durable IDs. Exact source matches are consumed globally before any edit
 * heuristic runs, so inserting a row cannot shift later items' identities.
 * A prior ID is reused for changed text only for one unambiguous, clearly
 * similar remaining pair; ambiguous replacements are deliberately new rows.
 */
export function reconcileRouteListItems(previous: unknown, values: Partial<Record<RouteListKey, string[]>>): RouteListItems {
  const stored = asRecord(previous); const result: RouteListItems = {};
  for (const key of ROUTE_LIST_KEYS) {
    const prior = asListItems(stored[key]); const sources = values[key] ?? [];
    const usedIds = new Set(prior.map(item => item.id)); const available = new Set(prior.map(item => item.id));
    const reconciled: Array<RouteListItem | undefined> = sources.map(source => {
      const exact = prior.find(item => available.has(item.id) && item.source === source);
      if (!exact) return undefined;
      available.delete(exact.id); return {id: exact.id, source};
    });
    const unmatchedIndexes = reconciled.flatMap((item, index) => item ? [] : [index]);
    const unmatchedPrior = prior.filter(item => available.has(item.id));
    if (unmatchedIndexes.length === 1 && unmatchedPrior.length === 1) {
      const index = unmatchedIndexes[0]; const candidate = unmatchedPrior[0];
      if (isClearListEdit(candidate.source, sources[index])) {
        reconciled[index] = {id: candidate.id, source: sources[index]}; available.delete(candidate.id);
      }
    }
    result[key] = reconciled.map((item, index) => item ?? {id: nextListItemId(key, usedIds), source: sources[index]});
  }
  return result;
}
export function routeListItems(content: Record<string, unknown>, key: RouteListKey): RouteListItem[] {
  return reconcileRouteListItems(content.translationListItems, {[key]: strings(content[key])})[key] ?? [];
}
export function localizedRouteList(localeValue: unknown, listItems: RouteListItem[], key: RouteListKey, fallback: string[]) {
  const locale = asRecord(localeValue); const translations = asRecord(locale[key]); const fields = Object.values(asRecord(asRecord(locale._content_package).fields)).map(asRecord);
  return listItems.map((item, index) => {
    const meta = fields.find(fieldValue => string(fieldValue.item_id) === item.id && string(fieldValue.field_key) === key);
    const translated = string(translations[item.id]) || string(meta?.text);
    const currentSource = contentHash(item.source);
    const sourceMatches = string(meta?.source_hash) === currentSource && string(meta?.source_text) === item.source;
    return translated && sourceMatches && string(meta?.status) !== 'stale' ? translated : (fallback[index] ?? item.source);
  });
}

/** Stable, non-cryptographic change detector. It is deliberately portable to browser and node tests. */
export function contentHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}
export function stableStopId(value: Record<string, unknown>) {
  const existing = value.id ?? value.stopId ?? value.placeId;
  return typeof existing === 'string' && existing.trim() ? existing.trim() : null;
}
const routeKeys = new Set(['shortTitle', 'subtitle', 'summary', 'description', 'heroTitle', 'heroSubtitle', 'heroHighlightPhrase', 'heroVideo', 'heroAspectRatio', 'departureCity', 'region', 'duration', 'walkingLevel', 'languages', 'highlights', 'included', 'excluded', 'preparation', 'notices', 'bookingNotice', 'cancellationPolicy', 'participantRules', 'weatherNotice', 'baggageNotice', 'safetyNotice', 'mealInfo', 'childPolicy', 'luggagePolicy', 'accessibilityInfo', 'weatherPolicy', 'packingList', 'clothingAdvice', 'friendlyReminders', 'suitableFor', 'itinerary', 'itineraryStops', 'stops']);
const stopKeys = new Set(['id', 'stopId', 'placeId', 'title', 'name', 'subtitle', 'description', 'shortDescription', 'longDescription', 'videoLabel', 'detail', 'location', 'time', 'stayMinutes', 'type', 'tags', 'imageUrl', 'gallery', 'highlights', 'tip', 'latitude', 'longitude', 'video']);
/** Keep imports compatible with the existing content JSON while ignoring arbitrary package keys. */
export function sanitizeRouteContent(input: unknown) {
  const raw = asRecord(input); const content: Record<string, unknown> = {}; const ignored: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!routeKeys.has(key)) { ignored.push(key); continue; }
    if (key === 'itinerary' || key === 'itineraryStops') {
      if (!Array.isArray(value)) { ignored.push(key); continue; }
      content[key] = value.flatMap((candidate) => { const stop = asRecord(candidate); const filtered = Object.fromEntries(Object.entries(stop).filter(([stopKey]) => stopKeys.has(stopKey))); return stableStopId(filtered) ? [filtered] : []; });
      continue;
    }
    content[key] = value;
  }
  return {content, ignored};
}

export const translationInstructions = [
  'Source language is zh-CN. Fill only fields[].translations for the requested target locales.',
  'Do not change schema_version, package_id, entity identifiers, field ids, paths, item_id, source_text, source_hash, locked values, or field order.',
  'Do not add facts, remove conditions, alter numbers, prices, dates, times, coordinates, capacity, route order, URLs, media IDs, placeholders, or brand names.',
  'Use established Japanese place names where possible. Marketing copy may be natural, while meeting, policy, safety, payment and itinerary content must remain strictly accurate.',
  'Keep UI labels concise. Hero titles should remain readable on a phone. A hero highlight phrase must be an exact continuous phrase inside that locale title.',
  'Return complete valid JSON with the same schema. Do not put explanations outside the JSON.'
];
export const authoringInstructions = [
  'Source locale must be zh-CN. Keep the schema, locked identifiers and stable itinerary item IDs exactly as supplied.',
  'Use the supplied Word/PDF/itinerary material only. Do not guess dates, times, prices, addresses, capacities, cancellation terms, safety rules or included services.',
  'When a required fact cannot be verified, use the literal string "needs_review" in that field and add the reason to review_notes. Do not replace uncertainty with marketing copy.',
  'heroTitle is the passenger-facing Hero title. heroHighlightPhrase must be an exact continuous phrase inside heroTitle. shortDescription is 2–3 readable lines; longDescription is optional expanded text.',
  'Each itinerary item needs a stable id. Existing IDs are locked; for a new stop use a descriptive lowercase id such as spot_sanzenin_001. Never rely on array position.',
  'Use preparation for what guests should prepare. Keep booking, cancellation, participant, weather, baggage and safety notices faithful to the supplied source.',
  'Return only a complete valid JTW Content Package JSON. Do not add explanations outside the JSON.'
];
export const translationProfiles: Record<TranslationProfile, string[]> = {
  hero_title: ['Natural and attractive for travel.', 'Keep the mobile visual to roughly 2–4 lines.', 'Generate a matching highlight_phrase if the source contains one.'],
  hero_subtitle: ['Short, natural and atmospheric.', 'Do not expand facts or guarantees.'],
  highlight_phrase: ['Must be an exact continuous phrase inside the title for the same locale.', 'Do not use the Chinese phrase inside another language title.'],
  theme_chip: ['Very short category or theme label.', 'Keep it visually compact.'],
  route_title: ['Natural route name suitable for a card and detail page.', 'Do not add destinations not in source.'],
  route_summary: ['Accurate, attractive and concise.', 'Natural localization is allowed but no new facts.'],
  spot_name: ['Prefer official or commonly used Japanese place names.', 'Keep it short and recognizable.'],
  spot_short_description: ['Explain the stop naturally in 2–3 compact lines.', 'Do not change place, order, stay duration or operations.'],
  spot_long_description: ['Faithful longer description for an optional disclosure.', 'Do not introduce facts absent from source.'],
  itinerary_step: ['Time and place must remain accurate.', 'Never change the route sequence or duration.'],
  meeting_instruction: ['Keep meeting point and timing strictly accurate.', 'Do not add operational instructions.'],
  included_item: ['Strictly preserve inclusion scope and conditions.'],
  excluded_item: ['Strictly preserve exclusion scope and conditions.'],
  preparation: ['Practical, concise and accurate.'],
  cta: ['Very short action label.', 'Do not make promises or change scope.'],
  policy: ['Strict semantic equivalence.', 'Preserve every number, amount, time and condition.'],
  safety_notice: ['Strict safety equivalence. Preserve every constraint and warning.'],
  nav_short_label: ['Single-line mobile navigation label.', 'Prefer the shortest familiar wording.'],
  generic_body: ['Natural and faithful to source.', 'Do not add business facts.']
};
export const defaultGlossary = [
  {source: 'Japan Travel Weekend', preferred: 'Japan Travel Weekend'},
  {source: 'DAITORA', preferred: 'DAITORA'},
  {source: '大寅', preferred: 'DAITORA', note: 'Brand name; do not invent a new brand translation.'},
  {source: 'Alphard', preferred: 'Alphard'},
  {source: 'Hiace', preferred: 'Hiace'},
];

const profileFor = (key: string): TranslationProfile => {
  if (key === 'title') return 'route_title';
  if (key === 'summary') return 'route_summary';
  if (key === 'highlight_phrase') return 'highlight_phrase';
  if (key === 'subtitle') return 'hero_subtitle';
  if (key === 'description') return 'generic_body';
  if (key === 'shortDescription') return 'spot_short_description';
  if (key === 'longDescription') return 'spot_long_description';
  if (key === 'included') return 'included_item';
  if (key === 'excluded') return 'excluded_item';
  if (key === 'notices' || key === 'tip' || key.endsWith('Notice') || key === 'cancellationPolicy' || key === 'participantRules') return key === 'safetyNotice' ? 'safety_notice' : 'policy';
  if (key === 'stop_title') return 'spot_name';
  return 'generic_body';
};
const field = (input: Omit<PackageField, 'id' | 'source_hash' | 'translations'>): PackageField => ({...input, id: id(input.entity_type, input.entity_id, input.item_id ?? 'route', input.field_key), source_hash: contentHash(input.source_text), translations: {}});

type RouteLocale = Record<string, unknown> & {_content_package?: {fields?: Record<string, {text?: string; source_hash?: string; status?: TranslationStatus}>}};
const localeRecord = (content: Record<string, unknown>, locale: string): RouteLocale => asRecord(asRecord(content.locales)[locale]) as RouteLocale;

export function buildRouteTranslationPackage(product: OperationsProduct): TranslationPackage {
  const content = product.content ?? {};
  const entityId = product.id;
  const fields: PackageField[] = [];
  const listIdentities = reconcileRouteListItems(content.translationListItems, Object.fromEntries(ROUTE_LIST_KEYS.map(key => [key, strings(content[key])])) as Record<RouteListKey, string[]>);
  const add = (key: string, source: string, path: string, profile = profileFor(key), itemId?: string, context = '游客路线详情页') => {
    if (!source.trim()) return;
    const item = field({entity_type: 'route', entity_id: entityId, item_id: itemId, field_key: key, path, source_text: source, translation_profile: profile, context, max_length: profile === 'route_title' ? 100 : undefined, single_line: profile === 'route_title' || profile === 'spot_name'});
    for (const locale of TARGET_LOCALES) {
      const existing = localeRecord(content, locale)._content_package?.fields?.[item.id];
      const sourceChanged = Boolean(existing?.source_hash && existing.source_hash !== item.source_hash);
      if (existing?.text?.trim()) item.translations[locale] = {text: existing.text, status: sourceChanged ? 'stale' : existing.status ?? 'draft', source_hash: existing.source_hash ?? item.source_hash};
      else item.translations[locale] = {text: '', status: 'missing', source_hash: item.source_hash};
    }
    fields.push(item);
  };
  add('title', product.title, 'title', 'route_title', undefined, '游客路线卡片和路线详情标题');
  add('heroTitle', string(content.heroTitle), 'content.heroTitle', 'hero_title', undefined, '游客路线 Hero 标题');
  add('heroSubtitle', string(content.heroSubtitle), 'content.heroSubtitle', 'hero_subtitle', undefined, '游客路线 Hero 副标题');
  add('heroHighlightPhrase', string(content.heroHighlightPhrase), 'content.heroHighlightPhrase', 'highlight_phrase', undefined, '游客路线 Hero 金色强调词');
  add('subtitle', string(content.subtitle), 'content.subtitle', 'theme_chip', undefined, '路线短标签');
  add('summary', string(content.summary), 'content.summary', 'route_summary');
  add('description', string(content.description), 'content.description', 'generic_body');
  for (const listKey of ROUTE_LIST_KEYS) {
    listIdentities[listKey]?.forEach((item) => add(listKey, item.source, `content.${listKey}[id=${item.id}]`, profileFor(listKey), item.id, listKey === 'notices' ? '游客路线页注意事项' : '游客路线页内容列表'));
  }
  for (const key of ['bookingNotice', 'cancellationPolicy', 'participantRules', 'weatherNotice', 'baggageNotice', 'safetyNotice'] as const) add(key, string(content[key]), `content.${key}`, profileFor(key), undefined, '游客路线详情出行须知');
  const itinerary = Array.isArray(content.itinerary) ? content.itinerary : [];
  itinerary.forEach((value) => {
    const stop = asRecord(value); const stopId = stableStopId(stop);
    if (!stopId) return;
    add('stop_title', string(stop.title) || string(stop.name), `content.itinerary[id=${stopId}].title`, 'spot_name', stopId, '游客路线详情中的景点名称');
    add('subtitle', string(stop.subtitle), `content.itinerary[id=${stopId}].subtitle`, 'theme_chip', stopId, '游客路线详情中的景点短标签');
    add('shortDescription', string(stop.shortDescription) || string(stop.description), `content.itinerary[id=${stopId}].shortDescription`, 'spot_short_description', stopId, '游客路线详情中的景点短介绍');
    add('longDescription', string(stop.longDescription), `content.itinerary[id=${stopId}].longDescription`, 'spot_long_description', stopId, '游客路线详情中的景点详细介绍');
    add('videoLabel', string(stop.videoLabel), `content.itinerary[id=${stopId}].videoLabel`, 'cta', stopId, '游客路线详情中的视频播放标签');
    add('tip', string(stop.tip), `content.itinerary[id=${stopId}].tip`, 'policy', stopId, '游客路线详情中的景点提示');
  });
  return {schema_version: TRANSLATION_PACKAGE_SCHEMA, package_id: `route-${product.slug}-${product.catalogVersion}-${contentHash(product.id)}`, source_locale: SOURCE_LOCALE, target_locales: [...TARGET_LOCALES], entity: {entity_type: 'route', entity_id: entityId, entity_slug: product.slug, source_version: product.catalogVersion}, task_instructions: translationInstructions, translator_instructions: translationInstructions, translation_profiles: translationProfiles, glossary: defaultGlossary, locked: {slug: product.slug, catalog_version: product.catalogVersion, hero_image_url: product.heroImageUrl, gallery: product.gallery, translation_list_items: listIdentities}, fields};
}

export function buildHeroTranslationPackage(hero: DiscoverHero): TranslationPackage {
  const source = hero.translations['zh-CN'] ?? {title: '', subtitle: ''};
  const entityId = hero.id; const fields: PackageField[] = [];
  const add = (key: 'title' | 'subtitle' | 'highlight_phrase', profile: TranslationProfile, context: string) => {
    const sourceText = key === 'highlight_phrase' ? source.highlight_phrase ?? '' : source[key] ?? '';
    if (!sourceText.trim()) return;
    const row = field({entity_type: 'discover_hero', entity_id: entityId, field_key: key, path: `translations.zh-CN.${key}`, source_text: sourceText, translation_profile: profile, context, max_length: key === 'title' ? 120 : undefined, single_line: key === 'highlight_phrase'});
    for (const locale of TARGET_LOCALES) {
      const translation = hero.translations[locale] as (DiscoverHeroTranslation & {_content_package?: {source_hash?: string; status?: TranslationStatus}}) | undefined;
      const value = key === 'highlight_phrase' ? translation?.highlight_phrase ?? '' : translation?.[key] ?? '';
      const metadata = translation?._content_package;
      row.translations[locale] = {text: value, status: value ? (metadata?.source_hash && metadata.source_hash !== row.source_hash ? 'stale' : metadata?.status ?? 'draft') : 'missing', source_hash: metadata?.source_hash ?? row.source_hash};
    }
    fields.push(row);
  };
  add('title', 'hero_title', 'Discover / Soul Hero 的移动端标题'); add('subtitle', 'hero_subtitle', 'Discover / Soul Hero 的副标题'); add('highlight_phrase', 'highlight_phrase', 'Discover / Soul Hero 标题中使用品牌金色的连续短语');
  return {schema_version: TRANSLATION_PACKAGE_SCHEMA, package_id: `hero-${hero.id}-${hero.version}`, source_locale: SOURCE_LOCALE, target_locales: [...TARGET_LOCALES], entity: {entity_type: 'discover_hero', entity_id: entityId, source_version: hero.version}, task_instructions: translationInstructions, translator_instructions: translationInstructions, translation_profiles: translationProfiles, glossary: defaultGlossary, locked: {video_url: hero.video_url, poster_url: hero.poster_url, product_id: hero.product_id, product_slug: hero.product_slug, enabled: hero.enabled, sort_order: hero.sort_order}, fields};
}

export function buildRouteContentTemplate(): RouteContentPackage {
  return {schema_version: CONTENT_PACKAGE_SCHEMA, package_id: 'route-zh-CN-template', source_locale: SOURCE_LOCALE, authoring_instructions: authoringInstructions, review_notes: ['Replace needs_review only when the original material confirms the fact.', 'Route Detail media defaults to a 16:9 frame. Images and video metadata are shared across locales; translate only labels, captions and alt text.'], entity: {entity_type: 'route', slug: 'new-route-slug', mode: 'create'}, route: {title: 'needs_review', hero_image_url: null, gallery: [], content: {heroTitle: 'needs_review', heroSubtitle: '', heroHighlightPhrase: '', heroAspectRatio: '16:9', heroVideo: {url: '', storagePath: '', mimeType: 'video/mp4', sizeBytes: 0, posterUrl: '', durationSeconds: 0, aspectRatio: '16:9'}, departureCity: 'needs_review', summary: 'needs_review', description: '', region: '', duration: '', included: [], excluded: [], preparation: [], bookingNotice: '', cancellationPolicy: '', participantRules: '', weatherNotice: '', baggageNotice: '', safetyNotice: '', itinerary: [{id: 'spot_example_001', title: 'needs_review', subtitle: '', time: '', stayMinutes: 0, shortDescription: 'needs_review', longDescription: '', videoLabel: '', location: '', type: 'spot', tags: [], imageUrl: '', video: {url: '', storagePath: '', mimeType: 'video/mp4', sizeBytes: 0, posterUrl: '', durationSeconds: 0, aspectRatio: '16:9'}}]}}};
}

export function buildHeroContentTemplate(): DiscoverContentPackage {
  return {schema_version: CONTENT_PACKAGE_SCHEMA, package_id: 'discover-hero-zh-CN-template', source_locale: SOURCE_LOCALE, authoring_instructions: authoringInstructions, review_notes: ['The title and highlight_phrase are both source-locale content.'], entity: {entity_type: 'discover_hero', mode: 'create'}, hero: {title: 'needs_review', subtitle: '', highlight_phrase: '', video_url: '', poster_url: '', product_id: null, product_slug: null, enabled: false, sort_order: 0}};
}

export function validateContentPackage(input: unknown): {package: ContentPackage | null; issues: PackageIssue[]} {
  const issues: PackageIssue[] = []; const value = asRecord(input);
  if (value.schema_version !== CONTENT_PACKAGE_SCHEMA) issues.push({severity: 'error', code: 'schema', path: 'schema_version', message: `仅支持 ${CONTENT_PACKAGE_SCHEMA}`});
  if (value.source_locale !== SOURCE_LOCALE) issues.push({severity: 'error', code: 'source_locale', path: 'source_locale', message: '中文内容包的 source_locale 必须是 zh-CN'});
  const entity = asRecord(value.entity); const type = entity.entity_type;
  if (type === 'route') {
    const route = asRecord(value.route); const slug = string(entity.slug); const rawContent = asRecord(route.content); const rawItinerary = Array.isArray(rawContent.itinerary) ? rawContent.itinerary : []; const {content, ignored} = sanitizeRouteContent(rawContent); const itinerary = Array.isArray(content.itinerary) ? content.itinerary : [];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) issues.push({severity: 'error', code: 'slug', path: 'entity.slug', message: '路线 slug 必须是小写英文、数字和连字符'});
    if (string(route.title).trim().length < 3) issues.push({severity: 'error', code: 'title', path: 'route.title', message: '路线标题至少需要 3 个字符'});
    if (string(route.title).includes('needs_review')) issues.push({severity: 'error', code: 'needs_review', path: 'route.title', message: '存在 needs_review 标记，不能导入为草稿'});
    const ids = new Set<string>(); rawItinerary.forEach((row, index) => { const source = asRecord(row); const stopId = stableStopId(source); if (!stopId) issues.push({severity: 'error', code: 'stop_id', path: `route.content.itinerary[${index}]`, message: '每个景点必须有稳定 id / stopId / placeId'}); else if (ids.has(stopId)) issues.push({severity: 'error', code: 'duplicate_stop_id', path: `route.content.itinerary[${index}]`, message: `重复景点 ID：${stopId}`}); else ids.add(stopId); if (Object.values(source).some(candidate => typeof candidate === 'string' && candidate.includes('needs_review'))) issues.push({severity: 'error', code: 'needs_review', path: `route.content.itinerary[${index}]`, message: '景点仍有 needs_review 标记，不能导入为草稿'}); });
    ignored.forEach(key => issues.push({severity: 'warning', code: 'ignored_field', path: `route.content.${key}`, message: '不是当前路线内容模型的字段，已忽略'}));
    return {package: issues.some(issue => issue.severity === 'error') ? null : value as unknown as RouteContentPackage, issues};
  }
  if (type === 'discover_hero') {
    const hero = asRecord(value.hero); const title = string(hero.title); const highlight = string(hero.highlight_phrase); if (!title.trim()) issues.push({severity: 'error', code: 'title', path: 'hero.title', message: 'Hero 标题不能为空'}); if (highlight && !title.includes(highlight)) issues.push({severity: 'error', code: 'highlight', path: 'hero.highlight_phrase', message: '标题强调词必须完整出现在中文标题内'});
    return {package: issues.some(issue => issue.severity === 'error') ? null : value as unknown as DiscoverContentPackage, issues};
  }
  issues.push({severity: 'error', code: 'entity', path: 'entity.entity_type', message: '只支持 route 或 discover_hero'}); return {package: null, issues};
}

export function validateTranslationPackage(input: unknown): {package: TranslationPackage | null; issues: PackageIssue[]} {
  const issues: PackageIssue[] = []; const value = asRecord(input);
  if (value.schema_version !== TRANSLATION_PACKAGE_SCHEMA) issues.push({severity: 'error', code: 'schema', path: 'schema_version', message: `仅支持 ${TRANSLATION_PACKAGE_SCHEMA}`});
  if (!Array.isArray(value.task_instructions) || !Array.isArray(value.translator_instructions)) issues.push({severity: 'error', code: 'instructions', path: 'task_instructions', message: '翻译包必须携带完整任务与翻译说明'});
  const fields = Array.isArray(value.fields) ? value.fields : [];
  const ids = new Set<string>();
  fields.forEach((raw, index) => { const row = asRecord(raw); const path = `fields[${index}]`; const fieldId = string(row.id); if (!fieldId || ids.has(fieldId)) issues.push({severity: 'error', code: 'field_id', path: `${path}.id`, message: '字段 ID 缺失或重复'}); ids.add(fieldId); if (!string(row.source_text) || !string(row.source_hash) || !string(row.path)) issues.push({severity: 'error', code: 'field_shape', path, message: '字段缺少 source_text、source_hash 或 path'}); const translations = asRecord(row.translations); Object.entries(translations).forEach(([locale, translation]) => { if (!TARGET_LOCALES.includes(locale as TargetLocale)) issues.push({severity: 'error', code: 'locale', path: `${path}.translations.${locale}`, message: '不支持的目标语言'}); const t = asRecord(translation); if (typeof t.text !== 'string') issues.push({severity: 'error', code: 'translation_type', path: `${path}.translations.${locale}.text`, message: '译文必须为字符串'}); if (String(row.field_key) === 'highlight_phrase' && string(t.text) && !string(asRecord(fields.find(candidate => asRecord(candidate).id === fieldId)?.translations)[locale])) { /* title pair validated against source below when applying */ } }); });
  return {package: issues.some(issue => issue.severity === 'error') ? null : value as unknown as TranslationPackage, issues};
}

export type TranslationApplyResult = {content: Record<string, unknown>; imported: number; skipped: number; warnings: PackageIssue[]};
const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const sameTargetLocales = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((locale, index) => locale === right[index]);
const immutableFieldMatches = (actual: PackageField, expected: PackageField) => actual.id === expected.id
  && actual.entity_type === expected.entity_type && actual.entity_id === expected.entity_id
  && actual.item_id === expected.item_id && actual.field_key === expected.field_key
  && actual.path === expected.path && actual.source_text === expected.source_text
  && actual.source_hash === expected.source_hash && actual.translation_profile === expected.translation_profile;
const packageEnvelopeMatches = (actual: TranslationPackage, expected: TranslationPackage) => actual.source_locale === expected.source_locale
  && sameTargetLocales(actual.target_locales, expected.target_locales)
  && actual.entity.entity_type === expected.entity.entity_type && actual.entity.entity_id === expected.entity.entity_id
  && actual.entity.entity_slug === expected.entity.entity_slug && actual.entity.source_version === expected.entity.source_version
  && sameJson(actual.locked, expected.locked);
const rejectPackage = (imported: TranslationPackage, expected: TranslationPackage): TranslationApplyResult | null => {
  if (packageEnvelopeMatches(imported, expected)) return null;
  return {content: {}, imported: 0, skipped: imported.fields.length, warnings: [{severity: 'warning', code: 'immutable_package_metadata', path: 'package', message: '译文包的来源语言、目标语言、路线版本或锁定元数据与当前路线不一致，已拒绝导入。'}]};
};
export function applyRouteTranslationPackage(product: OperationsProduct, imported: TranslationPackage): TranslationApplyResult {
  const expected = buildRouteTranslationPackage(product); const rejected = rejectPackage(imported, expected); if (rejected) return {...rejected, content: structuredClone(product.content ?? {}) as Record<string, unknown>};
  const expectedById = new Map(expected.fields.map(item => [item.id, item])); const content = structuredClone(product.content ?? {}) as Record<string, unknown>; const locales = asRecord(content.locales); let importedCount = 0; let skipped = 0; const warnings: PackageIssue[] = [];
  for (const fieldValue of imported.fields) {
    const expectedField = expectedById.get(fieldValue.id); if (!expectedField || !immutableFieldMatches(fieldValue, expectedField)) { skipped += 1; warnings.push({severity: 'warning', code: 'immutable_field_metadata', path: fieldValue.path, message: '译文字段元数据与当前路线不一致，已跳过'}); continue; }
    for (const locale of TARGET_LOCALES) {
      const translated = fieldValue.translations[locale]; if (!translated?.text.trim()) continue;
      const local = asRecord(locales[locale]); const meta = asRecord(local._content_package); const fieldMap = asRecord(meta.fields); fieldMap[fieldValue.id] = {text: translated.text.trim(), source_text: expectedField.source_text, source_hash: expectedField.source_hash, status: 'draft', entity_type: expectedField.entity_type, entity_id: expectedField.entity_id, item_id: expectedField.item_id, field_key: expectedField.field_key, path: expectedField.path, translation_profile: expectedField.translation_profile}; locales[locale] = {...local, _content_package: {...meta, fields: fieldMap}}; importedCount += 1;
      if (!fieldValue.item_id && ['title', 'summary', 'description', 'heroTitle', 'heroSubtitle', 'heroHighlightPhrase', 'subtitle', 'bookingNotice', 'cancellationPolicy', 'participantRules', 'weatherNotice', 'baggageNotice', 'safetyNotice'].includes(fieldValue.field_key)) locales[locale] = {...asRecord(locales[locale]), [fieldValue.field_key]: translated.text.trim()};
      if (fieldValue.item_id && routeListKey(fieldValue.field_key)) {
        const list = asRecord(asRecord(locales[locale])[fieldValue.field_key]); list[fieldValue.item_id] = translated.text.trim(); locales[locale] = {...asRecord(locales[locale]), [fieldValue.field_key]: list};
      } else if (fieldValue.item_id) {
        const itinerary = asRecord(asRecord(locales[locale]).itinerary); const existing = asRecord(itinerary[fieldValue.item_id]);
        itinerary[fieldValue.item_id] = {...existing, [fieldValue.field_key]: translated.text.trim()}; locales[locale] = {...asRecord(locales[locale]), itinerary};
      }
    }
  }
  content.translationListItems = expected.locked.translation_list_items as RouteListItems; content.locales = locales; return {content, imported: importedCount, skipped, warnings};
}

export function applyHeroTranslationPackage(hero: DiscoverHero, imported: TranslationPackage): {hero: DiscoverHero; imported: number; skipped: number; warnings: PackageIssue[]} {
  const expected = buildHeroTranslationPackage(hero); const expectedById = new Map(expected.fields.map(item => [item.id, item]));
  if (!packageEnvelopeMatches(imported, expected)) return {hero, imported: 0, skipped: imported.fields.length, warnings: [{severity: 'warning', code: 'immutable_package_metadata', path: 'package', message: '译文包的锁定元数据与当前 Hero 不一致，已拒绝导入。'}]};
  const next = structuredClone(hero) as DiscoverHero; let importedCount = 0; let skipped = 0; const warnings: PackageIssue[] = [];
  for (const row of imported.fields) {
    const expectedField = expectedById.get(row.id);
    if (!expectedField || !immutableFieldMatches(row, expectedField)) { skipped += 1; warnings.push({severity: 'warning', code: 'immutable_field_metadata', path: row.path, message: '译文字段元数据与当前 Hero 不一致，已跳过'}); continue; }
    for (const locale of TARGET_LOCALES) {
      const translated = row.translations[locale]; if (!translated?.text.trim()) continue;
      const current = next.translations[locale] ?? {title: '', subtitle: ''};
      if (row.field_key === 'highlight_phrase') next.translations[locale] = {...current, highlight_phrase: translated.text.trim(), _content_package: {source_hash: expectedField.source_hash, status: 'draft'}};
      else next.translations[locale] = {...current, [row.field_key]: translated.text.trim(), _content_package: {source_hash: expectedField.source_hash, status: 'draft'}};
      importedCount += 1;
    }
  }
  for (const locale of TARGET_LOCALES) {
    const local = next.translations[locale]; if (local?.highlight_phrase && local.title && !local.title.includes(local.highlight_phrase)) { next.translations[locale] = {...local, highlight_phrase: undefined}; skipped += 1; warnings.push({severity: 'warning', code: 'highlight', path: `translations.${locale}.highlight_phrase`, message: '强调词不在对应语言标题中，已跳过该强调词。'}); }
  }
  return {hero: next, imported: importedCount, skipped, warnings};
}

export function routeLocalizedText(content: Record<string, unknown>, locale: string, fieldId: string) {
  const fields = localeRecord(content, locale)._content_package?.fields ?? {}; const field = fields[fieldId]; return field?.status === 'stale' ? '' : field?.text?.trim() ?? '';
}

export function packageStatusSummary(packageValue: TranslationPackage) {
  const summary = Object.fromEntries(TARGET_LOCALES.map(locale => [locale, {missing: 0, draft: 0, reviewed: 0, published: 0, stale: 0}] as const)) as Record<TargetLocale, Record<TranslationStatus, number>>;
  packageValue.fields.forEach(fieldValue => TARGET_LOCALES.forEach(locale => { const status = fieldValue.translations[locale]?.status ?? 'missing'; summary[locale][status] += 1; })); return summary;
}

/** Export only content that is missing or stale, so reviewed translations are not needlessly retranslated. */
export function pendingTranslationPackage(packageValue: TranslationPackage): TranslationPackage {
  const fields = packageValue.fields.flatMap(fieldValue => {
    const translations = Object.fromEntries(Object.entries(fieldValue.translations).flatMap(([locale, value]) => value && (value.status === 'missing' || value.status === 'stale') ? [[locale, {...value, text: ''}]] : [])) as PackageField['translations'];
    return Object.keys(translations).length ? [{...fieldValue, translations}] : [];
  });
  return {...packageValue, fields};
}

export function parseJsonFile(file: File): Promise<unknown> { return file.text().then(text => JSON.parse(text)); }
export function downloadPackage(name: string, payload: Json | Record<string, unknown>) { const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
