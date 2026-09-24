import {describe, expect, it} from 'vitest';
import {applyHeroTranslationPackage, applyRouteTranslationPackage, buildHeroContentTemplate, buildHeroTranslationPackage, buildRouteContentTemplate, buildRouteTranslationPackage, pendingTranslationPackage, sanitizeRouteContent, validateContentPackage, validateTranslationPackage} from '../src/shared/contentPackages';
import type {OperationsProduct} from '../src/shared/integrations/supabaseOperations';
import type {DiscoverHero} from '../src/shared/discover';

const product = (): OperationsProduct => ({id: 'route-osaka-katsuoji', slug: 'osaka-katsuoji-miyama-arashiyama', status: 'draft', catalogVersion: 7, publishedRevision: null, draftRevision: 7, title: '大阪到胜尾寺、美山与岚山一日游', content: {summary: '从大阪出发的秋日路线。', description: '中文详细介绍。', itinerary: [{id: 'stop-katsuoji', title: '胜尾寺', description: '达摩寺院。'}, {id: 'stop-miyama', title: '美山', description: '茅草屋村落。'}], included: ['往返车辆'], locales: {}}, heroImageUrl: '/media/hero.jpg', gallery: ['/media/hero.jpg'], updatedAt: '2026-09-23T00:00:00Z'});

describe('JTW content and translation packages', () => {
  it('accepts a Chinese route package only when every itinerary stop has a stable ID', () => {
    const valid = validateContentPackage({schema_version: 'jtw-content-package/v1', package_id: 'route-sample', source_locale: 'zh-CN', entity: {entity_type: 'route', slug: 'sample-route', mode: 'create'}, route: {title: '大阪路线', content: {itinerary: [{id: 'stop-a', title: '胜尾寺'}]}}});
    expect(valid.package?.entity.entity_type).toBe('route');
    const invalid = validateContentPackage({schema_version: 'jtw-content-package/v1', package_id: 'route-sample', source_locale: 'zh-CN', entity: {entity_type: 'route', slug: 'sample-route', mode: 'create'}, route: {title: '大阪路线', content: {itinerary: [{title: '胜尾寺'}]}}});
    expect(invalid.package).toBeNull(); expect(invalid.issues.some(issue => issue.code === 'stop_id')).toBe(true);
  });

  it('exports self-describing Chinese templates and rejects unresolved needs_review values on import', () => {
    expect(buildRouteContentTemplate().authoring_instructions?.join(' ')).toContain('needs_review');
    expect(buildHeroContentTemplate().authoring_instructions?.join(' ')).toContain('stable itinerary item IDs');
    const unresolved = validateContentPackage({schema_version: 'jtw-content-package/v1', package_id: 'route-sample', source_locale: 'zh-CN', entity: {entity_type: 'route', slug: 'sample-route', mode: 'create'}, route: {title: 'needs_review', content: {itinerary: [{id: 'spot-a', title: 'needs_review'}]}}});
    expect(unresolved.package).toBeNull(); expect(unresolved.issues.some(issue => issue.code === 'needs_review')).toBe(true);
  });

  it('keeps Chinese package imports inside the route content allowlist', () => {
    const sanitized = sanitizeRouteContent({summary: '中文简介', inventory: 999, locales: {en: {title: 'not imported'}}, itinerary: [{id: 'stop-a', title: '胜尾寺', price: 5500}]});
    expect(sanitized.content).toEqual({summary: '中文简介', itinerary: [{id: 'stop-a', title: '胜尾寺'}]});
    expect(sanitized.ignored).toEqual(expect.arrayContaining(['inventory', 'locales']));
  });

  it('writes a translation back by stable stop ID after itinerary order changes', () => {
    const original = product(); const exported = buildRouteTranslationPackage(original);
    const stopTitle = exported.fields.find(field => field.item_id === 'stop-katsuoji' && field.field_key === 'stop_title')!;
    stopTitle.translations.en = {text: 'Katsuoji Temple', status: 'draft', source_hash: stopTitle.source_hash};
    const reordered = {...original, content: {...original.content, itinerary: [...(original.content.itinerary as unknown[])].reverse()}};
    const applied = applyRouteTranslationPackage(reordered, exported);
    const locales = applied.content.locales as Record<string, {itinerary?: Record<string, {stop_title?: string}>}>;
    expect(locales.en?.itinerary?.['stop-katsuoji']?.stop_title).toBe('Katsuoji Temple');
  });

  it('marks prior translations stale when the Chinese source changed and only applies known source hashes', () => {
    const original = product(); const first = buildRouteTranslationPackage(original); const title = first.fields.find(field => field.field_key === 'title')!;
    title.translations.en = {text: 'Autumn Day Trip', status: 'draft', source_hash: title.source_hash};
    const stored = applyRouteTranslationPackage(original, first).content;
    const changed = {...original, title: '大阪到胜尾寺、美山和岚山秋日一日游', content: stored};
    const next = buildRouteTranslationPackage(changed); const nextTitle = next.fields.find(field => field.field_key === 'title')!;
    expect(nextTitle.translations.en?.status).toBe('stale');
    expect(pendingTranslationPackage(next).fields.some(field => field.id === nextTitle.id)).toBe(true);
    expect(applyRouteTranslationPackage(changed, first).imported).toBe(0);
  });

  it('rejects malformed translation package identifiers and retains only supported locale fields', () => {
    const invalid = validateTranslationPackage({schema_version: 'jtw-translation-package/v1', fields: [{id: '', source_text: '中文', source_hash: 'x', path: 'title', translations: {fr: {text: 'French'}}}]});
    expect(invalid.package).toBeNull(); expect(invalid.issues.some(issue => issue.code === 'field_id')).toBe(true); expect(invalid.issues.some(issue => issue.code === 'locale')).toBe(true);
  });

  it('carries self-contained translator instructions and V2 spot fields', () => {
    const exported = buildRouteTranslationPackage(product());
    expect(exported.task_instructions.length).toBeGreaterThan(3);
    expect(exported.translation_profiles.spot_long_description).toBeDefined();
    expect(exported.translation_profiles.nav_short_label).toBeDefined();
    expect(exported.fields.some(field => field.field_key === 'shortDescription' || field.field_key === 'description')).toBe(true);
  });

  it('keeps Hero title and highlight linked to the matching locale title', () => {
    const hero: DiscoverHero = {id: 'hero-autumn', video_url: '/hero.mp4', poster_url: '/hero.jpg', product_id: null, product_slug: null, enabled: true, sort_order: 0, version: 3, translations: {'zh-CN': {title: '这一生，总要看一次京都的秋天。', subtitle: '秋日京都。', highlight_phrase: '京都的秋天'}}};
    const exported = buildHeroTranslationPackage(hero); const title = exported.fields.find(field => field.field_key === 'title')!; const highlight = exported.fields.find(field => field.field_key === 'highlight_phrase')!;
    title.translations.en = {text: 'Once in your life, see Kyoto in autumn.', status: 'draft', source_hash: title.source_hash}; highlight.translations.en = {text: 'Kyoto in autumn', status: 'draft', source_hash: highlight.source_hash};
    const applied = applyHeroTranslationPackage(hero, exported);
    expect(applied.hero.translations.en?.highlight_phrase).toBe('Kyoto in autumn'); expect(applied.warnings).toHaveLength(0);
  });

  it('skips a Hero highlight phrase that does not match the translated title', () => {
    const hero: DiscoverHero = {id: 'hero-invalid', video_url: '/hero.mp4', poster_url: '/hero.jpg', product_id: null, product_slug: null, enabled: true, sort_order: 0, version: 3, translations: {'zh-CN': {title: '京都的秋天', subtitle: '秋日京都。', highlight_phrase: '京都的秋天'}}};
    const exported = buildHeroTranslationPackage(hero); const title = exported.fields.find(field => field.field_key === 'title')!; const highlight = exported.fields.find(field => field.field_key === 'highlight_phrase')!;
    title.translations.en = {text: 'Kyoto in autumn', status: 'draft', source_hash: title.source_hash}; highlight.translations.en = {text: 'Autumn in Nara', status: 'draft', source_hash: highlight.source_hash};
    const applied = applyHeroTranslationPackage(hero, exported);
    expect(applied.hero.translations.en?.highlight_phrase).toBeUndefined(); expect(applied.warnings[0]?.code).toBe('highlight');
  });
});
