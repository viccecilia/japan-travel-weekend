import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {ProductEditPage} from '../src/app/operations/ProductEditPage';
import {AppProvider} from '../src/app/store';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);

const product = {
  id: 'trip-edit', slug: 'trip-edit', title: '原路线标题', status: 'draft' as const,
  catalogVersion: 3, draftRevision: 2, publishedRevision: null, heroImageUrl: '/images/cover.webp', gallery: [], updatedAt: '2026-09-13T00:00:00Z',
  content: {summary: '原简介', description: '原介绍', region: '京都', duration: '10小时', itinerary: [{id: 'stop-1', title: '清水寺', description: '原景点介绍'}], locales: {ja: {title: '元のタイトル', summary: '元の概要'}, en: {title: 'Original title'}}},
};

function open(overrides: Record<string, unknown> = {}) {
  const operations = {
    listProducts: vi.fn(async () => ({data: [product], error: null})),
    listProductRevisions: vi.fn(async () => ({data: [], error: null})),
    saveProductDraft: vi.fn(async () => ({ok: true, error: null})),
    publishProduct: vi.fn(async () => ({ok: true, error: null})),
    ...overrides,
  };
  const services = {operations, loadSellableDepartures: async () => ({data: [], error: null}), onAuthStateChange: () => () => {}, currentUser: async () => null} as unknown as ProductionBrowserServices;
  render(<MemoryRouter initialEntries={['/app/operations/products/trip-edit/edit']}><AppProvider services={services}><Routes><Route path="/app/operations/products/:productId/edit" element={<ProductEditPage />} /></Routes></AppProvider></MemoryRouter>);
  return operations;
}

it('四个编辑 Tab 共用草稿，切换后输入与实时预览不丢失', async () => {
  open();
  const title = await screen.findByLabelText('路线标题');
  fireEvent.change(title, {target: {value: '实时预览的新标题'}});
  expect(within(screen.getByLabelText('游客手机草稿预览')).getByRole('heading', {name: '实时预览的新标题'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: '费用须知'}));
  fireEvent.change(screen.getByLabelText('费用包含'), {target: {value: '往返交通\n司导服务'}});
  fireEvent.click(screen.getByRole('button', {name: '多语言'}));
  fireEvent.change(screen.getByLabelText('路线标题'), {target: {value: '新しいタイトル'}});
  fireEvent.change(screen.getByLabelText('预览语言'), {target: {value: 'ja'}});
  expect(within(screen.getByLabelText('游客手机草稿预览')).getByRole('heading', {name: '新しいタイトル'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: '图文与视频'}));
  expect(screen.getByDisplayValue('实时预览的新标题')).toBeInTheDocument();
  expect(screen.getByText('有未保存修改')).toBeInTheDocument();
});

it('有未保存修改时禁止发布旧草稿', async () => {
  const operations = open();
  fireEvent.change(await screen.findByLabelText('路线标题'), {target: {value: '尚未保存的新标题'}});
  expect(screen.getByRole('button', {name: '发布草稿'})).toBeDisabled();
  expect(operations.publishProduct).not.toHaveBeenCalled();
});
