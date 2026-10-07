import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {applyRouteTranslationPackage, buildRouteTranslationPackage} from '../src/shared/contentPackages';
import {ProductPhonePreview} from '../src/app/operations/ProductPhonePreview';
import {draftFromProduct} from '../src/app/operations/productDraft';
import type {OperationsProduct} from '../src/shared/integrations/supabaseOperations';

const route = (): OperationsProduct => ({id: 'route-preview-i18n', slug: 'route-preview-i18n', status: 'draft', catalogVersion: 1, publishedRevision: null, draftRevision: 1, title: '中文路线', heroImageUrl: '/route.jpg', gallery: ['/route.jpg'], updatedAt: '2026-09-24T00:00:00Z', content: {summary: '中文简介', included: ['往返车辆'], excluded: ['午餐'], preparation: ['舒适鞋'], bookingNotice: '提前集合', cancellationPolicy: '取消规则', participantRules: '参加规则', weatherNotice: '天气提醒', baggageNotice: '行李说明', safetyNotice: '安全提示', itinerary: [{id: 'spot-one', title: '中文景点', shortDescription: '中文短介绍', longDescription: '中文长介绍'}], locales: {}}});

describe('ProductPhonePreview Route V2 locale content', () => {
  it('renders imported English lists, travel notes, and stable-ID spot text instead of Chinese fallback', () => {
    const original = route(); const pkg = buildRouteTranslationPackage(original);
    const values: Record<string, string> = {title: 'English route', summary: 'English summary', included: 'Round-trip transport', excluded: 'Lunch', preparation: 'Comfortable shoes', bookingNotice: 'Meet early', cancellationPolicy: 'Cancellation policy', participantRules: 'Participant rules', weatherNotice: 'Weather notice', baggageNotice: 'Baggage notice', safetyNotice: 'Safety notice', stop_title: 'English spot', shortDescription: 'English short description', longDescription: 'English long description'};
    for (const field of pkg.fields) if (values[field.field_key]) field.translations.en = {text: values[field.field_key], status: 'draft', source_hash: field.source_hash};
    const applied = applyRouteTranslationPackage(original, pkg);
    render(<ProductPhonePreview draft={draftFromProduct({...original, content: applied.content})} locale="en" mode="detail" dirty={false} />);
    for (const expected of Object.values(values)) expect(screen.getAllByText(expected, {exact: false}).length).toBeGreaterThan(0);
  });

  it('shows an explicit translation gap instead of silently mixing Chinese into Japanese preview', () => {
    render(<ProductPhonePreview draft={draftFromProduct(route())} locale="ja" mode="detail" dirty={false} />);
    expect(screen.getByText('TRANSLATION_GAP')).toBeInTheDocument();
    expect(screen.queryByText('中文路线')).not.toBeInTheDocument();
    expect(screen.queryByText('中文简介')).not.toBeInTheDocument();
    expect(screen.queryByText('中文景点')).not.toBeInTheDocument();
  });

  it('uses the selected Attraction CMS guide language for linked attraction stops', () => {
    const original = route();
    original.content = {
      ...original.content,
      locales: {ja: {title: '日本語ルート', summary: '日本語の概要'}},
      itinerary: [{id: 'spot-one', attractionId: 'katsuo-ji', title: '中文景点'}],
    };
    render(<ProductPhonePreview
      draft={draftFromProduct(original)}
      locale="ja"
      mode="detail"
      dirty={false}
      attractionGuides={{'katsuo-ji': {ja: {title: '勝尾寺', body: '勝運祈願で知られる寺院です。'}}}}
    />);
    expect(screen.getByText(/1\. 勝尾寺/)).toBeInTheDocument();
    expect(screen.getByText('勝運祈願で知られる寺院です。')).toBeInTheDocument();
    expect(screen.queryByText('中文景点')).not.toBeInTheDocument();
  });
});
