import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {applyRouteTranslationPackage, buildRouteTranslationPackage} from '../src/shared/contentPackages';
import {ProductPhonePreview} from '../src/app/operations/ProductPhonePreview';
import {draftFromProduct} from '../src/app/operations/productDraft';
import type {OperationsProduct} from '../src/shared/integrations/supabaseOperations';

const route = (): OperationsProduct => ({id: 'route-preview-i18n', slug: 'route-preview-i18n', status: 'draft', catalogVersion: 1, publishedRevision: null, draftRevision: 1, title: '中文路线', heroImageUrl: '/route.jpg', gallery: ['/route.jpg'], updatedAt: '2026-09-24T00:00:00Z', content: {summary: '中文简介', included: ['往返车辆'], excluded: ['午餐'], preparation: ['舒适鞋'], bookingNotice: '提前集合', cancellationPolicy: '取消规则', participantRules: '参加规则', weatherNotice: '天气提醒', baggageNotice: '行李说明', safetyNotice: '安全提示', itinerary: [{id: 'spot-one', title: '中文景点', shortDescription: '中文短介绍', longDescription: '中文长介绍'}], locales: {}}});

const linkedRoute = (): OperationsProduct => {
  const original = route();
  original.content = {
    ...original.content,
    locales: {
      'zh-TW': {
        title: '繁體路線',
        summary: '繁體簡介',
        itinerary: {
          'spot-katsuoji': {
            stop_title: '路線繁體勝尾寺',
            shortDescription: '路線繁體勝尾寺介紹',
          },
          'spot-otagi': {
            stop_title: '路線繁體愛宕念佛寺',
            shortDescription: '路線繁體愛宕念佛寺介紹',
          },
        },
      },
    },
    itinerary: [
      {id: 'spot-katsuoji', attractionId: 'katsuo-ji', title: '中文胜尾寺', shortDescription: '中文胜尾寺介绍'},
      {id: 'spot-otagi', attractionId: 'otagi-nenbutsu-ji', title: '中文爱宕念佛寺', shortDescription: '中文爱宕念佛寺介绍'},
    ],
  };
  return original;
};

afterEach(cleanup);

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

  it('prefers a zh-TW Attraction CMS guide and reports no translation gap', () => {
    render(<ProductPhonePreview
      draft={draftFromProduct(linkedRoute())}
      locale="zh-TW"
      mode="detail"
      dirty={false}
      attractionGuides={{
        'katsuo-ji': {'zh-TW': {title: 'CMS 勝尾寺', body: 'CMS 繁體勝尾寺介紹'}},
        'otagi-nenbutsu-ji': {'zh-TW': {title: 'CMS 愛宕念佛寺', body: 'CMS 繁體愛宕念佛寺介紹'}},
      }}
    />);
    expect(screen.getByText(/1\. CMS 勝尾寺/)).toBeInTheDocument();
    expect(screen.getByText('CMS 繁體勝尾寺介紹')).toBeInTheDocument();
    expect(screen.getByText(/2\. CMS 愛宕念佛寺/)).toBeInTheDocument();
    expect(screen.getByText('CMS 繁體愛宕念佛寺介紹')).toBeInTheDocument();
    expect(screen.queryByText('路線繁體勝尾寺介紹')).not.toBeInTheDocument();
    expect(screen.queryByText('路線繁體愛宕念佛寺介紹')).not.toBeInTheDocument();
    expect(screen.queryByText('TRANSLATION_GAP')).not.toBeInTheDocument();
  });

  it('uses zh-TW route stop translations when the linked attraction has no zh-TW guide', () => {
    render(<ProductPhonePreview draft={draftFromProduct(linkedRoute())} locale="zh-TW" mode="detail" dirty={false} />);
    expect(screen.getByText(/1\. 路線繁體勝尾寺/)).toBeInTheDocument();
    expect(screen.getByText('路線繁體勝尾寺介紹')).toBeInTheDocument();
    expect(screen.getByText(/2\. 路線繁體愛宕念佛寺/)).toBeInTheDocument();
    expect(screen.getByText('路線繁體愛宕念佛寺介紹')).toBeInTheDocument();
    expect(screen.queryByText('中文胜尾寺')).not.toBeInTheDocument();
    expect(screen.queryByText('中文胜尾寺介绍')).not.toBeInTheDocument();
    expect(screen.queryByText('中文爱宕念佛寺')).not.toBeInTheDocument();
    expect(screen.queryByText('中文爱宕念佛寺介绍')).not.toBeInTheDocument();
    expect(screen.queryByText('TRANSLATION_GAP')).not.toBeInTheDocument();
  });

  it('reports a linked-attraction gap without falling back to zh-CN when neither zh-TW source exists', () => {
    const original = linkedRoute();
    original.content = {
      ...original.content,
      locales: {'zh-TW': {title: '繁體路線', summary: '繁體簡介'}},
    };
    render(<ProductPhonePreview draft={draftFromProduct(original)} locale="zh-TW" mode="detail" dirty={false} />);
    expect(screen.getByText('TRANSLATION_GAP')).toBeInTheDocument();
    expect(screen.getByText('景点 1 名称、景点 1 介绍、景点 2 名称、景点 2 介绍')).toBeInTheDocument();
    expect(screen.queryByText('中文胜尾寺')).not.toBeInTheDocument();
    expect(screen.queryByText('中文胜尾寺介绍')).not.toBeInTheDocument();
    expect(screen.queryByText('中文爱宕念佛寺')).not.toBeInTheDocument();
    expect(screen.queryByText('中文爱宕念佛寺介绍')).not.toBeInTheDocument();
  });

  it('keeps the existing Japanese Attraction CMS guide behavior', () => {
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
    expect(screen.queryByText('TRANSLATION_GAP')).not.toBeInTheDocument();
  });
});
