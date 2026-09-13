import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {ProductEditPage} from '../src/app/operations/ProductEditPage';
import {AppProvider} from '../src/app/store';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const product = {
  id: 'trip-edit', slug: 'trip-edit', title: '原路线标题', status: 'draft' as const,
  catalogVersion: 3, draftRevision: 2, publishedRevision: null, heroImageUrl: '/images/cover.webp', gallery: [], updatedAt: '2026-09-13T00:00:00Z',
  content: {summary: '原简介', description: '原介绍', region: '京都', duration: '10小时', itinerary: [{id: 'stop-1', title: '清水寺', description: '原景点介绍'}, {id: 'stop-2', title: '奈良公园', description: '第二站'}], locales: {ja: {title: '元のタイトル', summary: '元の概要'}, en: {title: 'Original title'}}},
};

function open(overrides: Record<string, unknown> = {}) {
  const operations = {
    listProducts: vi.fn(async () => ({data: [product], error: null})),
    listProductRevisions: vi.fn(async () => ({data: [], error: null})),
    saveProductDraft: vi.fn(async (_input: unknown) => ({ok: true, error: null})),
    publishProduct: vi.fn(async () => ({ok: true, error: null})),
    uploadProductImage: vi.fn(async () => ({url: 'https://media.example.invalid/new.webp', error: null})),
    setProductStatus: vi.fn(async () => ({ok: true, error: null})),
    ...overrides,
  };
  const services = {operations, loadSellableDepartures: async () => ({data: [], error: null}), onAuthStateChange: () => () => {}, currentUser: async () => null} as unknown as ProductionBrowserServices;
  render(<MemoryRouter initialEntries={['/app/operations/products/trip-edit/edit']}><AppProvider services={services}><Routes><Route path="/app/operations/products/:productId/edit" element={<ProductEditPage />} /><Route path="/app/operations/products" element={<div>产品列表目标页</div>} /></Routes></AppProvider></MemoryRouter>);
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

it('景点改名不重挂输入，排序作用于稳定景点且实时更新预览', async () => {
  open();
  fireEvent.click(await screen.findByRole('button', {name: '景点行程'}));
  const name = screen.getAllByLabelText('景点名称')[0];
  name.focus();
  fireEvent.change(name, {target: {value: '清水寺新名称'}});
  expect(document.activeElement).toBe(name);
  expect(screen.getByDisplayValue('清水寺新名称')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', {name: '下移'})[0]);
  const preview = within(screen.getByLabelText('游客手机草稿预览'));
  const text = preview.getByText(/1\. 奈良公园/).parentElement?.parentElement?.textContent ?? '';
  expect(text).toContain('1. 奈良公园');
  expect(preview.getByText(/2\. 清水寺新名称/)).toBeInTheDocument();
});

it('保存失败保留输入和未保存状态，按钮恢复可重试', async () => {
  open({saveProductDraft: vi.fn(async () => ({ok: false, error: '版本冲突'}))});
  fireEvent.change(await screen.findByLabelText('路线标题'), {target: {value: '不能丢失的输入'}});
  fireEvent.click(screen.getByRole('button', {name: '保存草稿'}));
  expect(await screen.findByText('保存失败：版本冲突')).toBeInTheDocument();
  expect(screen.getByDisplayValue('不能丢失的输入')).toBeInTheDocument();
  expect(screen.getByText('有未保存修改')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: '保存草稿'})).toBeEnabled();
});

it('图片上传失败保留本地草稿并阻止 blob 地址写入保存', async () => {
  vi.stubGlobal('URL', {...URL, createObjectURL: vi.fn(() => 'blob:pending-photo'), revokeObjectURL: vi.fn()});
  const operations = open({uploadProductImage: vi.fn(async () => ({url: null, error: '存储暂不可用'}))});
  const file = new File(['image'], 'route.webp', {type: 'image/webp'});
  fireEvent.change(await screen.findByLabelText('上传路线图片'), {target: {files: [file]}});
  expect(await screen.findByText(/上传失败：存储暂不可用/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: '保存草稿'}));
  expect(await screen.findByText(/仍有图片只存在于本地预览/)).toBeInTheDocument();
  expect(operations.saveProductDraft).not.toHaveBeenCalled();
});

it('保存成功读取新版本后才允许发布，并使用更新后的版本号', async () => {
  const updated = {...product, title: '已保存的新标题', catalogVersion: 4, content: {...product.content, summary: '原简介'}};
  const listProducts = vi.fn().mockResolvedValueOnce({data: [product], error: null}).mockResolvedValue({data: [updated], error: null});
  const operations = open({listProducts});
  fireEvent.change(await screen.findByLabelText('路线标题'), {target: {value: '已保存的新标题'}});
  fireEvent.click(screen.getByRole('button', {name: '保存草稿'}));
  expect(await screen.findByText(/草稿已保存，尚未发布/)).toBeInTheDocument();
  const publish = screen.getByRole('button', {name: '发布草稿'});
  expect(publish).toBeEnabled();
  fireEvent.click(publish);
  await vi.waitFor(() => expect(operations.publishProduct).toHaveBeenCalledWith('trip-edit', 4));
});

it('合法相对图片地址可以保存，扩展字段和其他语言不会被清除', async () => {
  const operations = open();
  fireEvent.change(await screen.findByLabelText('主图地址'), {target: {value: '/images/routes/new-cover.webp'}});
  fireEvent.click(screen.getByRole('button', {name: '保存草稿'}));
  await vi.waitFor(() => expect(operations.saveProductDraft).toHaveBeenCalled());
  const payload = operations.saveProductDraft.mock.calls[0][0] as {heroImageUrl: string; content: {locales: Record<string, Record<string, string>>; itinerary: Array<Record<string, unknown>>}};
  expect(payload.heroImageUrl).toBe('/images/routes/new-cover.webp');
  expect(payload.content.locales.en.title).toBe('Original title');
  expect(payload.content.itinerary[0]).toMatchObject({id: 'stop-1', title: '清水寺'});
  expect(payload.content.itinerary[0]).not.toHaveProperty('editorId');
});

it('站内返回在未保存时需要确认，取消后留在编辑页', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  open();
  fireEvent.change(await screen.findByLabelText('路线标题'), {target: {value: '未保存'}});
  fireEvent.click(screen.getByRole('link', {name: '返回产品列表'}));
  expect(confirm).toHaveBeenCalled();
  expect(screen.queryByText('产品列表目标页')).not.toBeInTheDocument();
  expect(screen.getByDisplayValue('未保存')).toBeInTheDocument();
  confirm.mockRestore();
});

it('窄屏编辑与预览是明确的面板切换状态', async () => {
  open();
  await screen.findByLabelText('移动端编辑预览切换');
  expect(document.querySelector('.product-editor-layout')).toHaveAttribute('data-mobile-view', 'edit');
  fireEvent.click(screen.getByRole('button', {name: '预览'}));
  expect(document.querySelector('.product-editor-layout')).toHaveAttribute('data-mobile-view', 'preview');
  fireEvent.click(screen.getByRole('button', {name: '编辑'}));
  expect(document.querySelector('.product-editor-layout')).toHaveAttribute('data-mobile-view', 'edit');
});

it('手机底栏保留保存发布并通过更多菜单承载次要操作', async () => {
  open();
  await screen.findByRole('button', {name: '保存草稿'});
  const savebar = document.querySelector('.product-editor-savebar') as HTMLElement;
  expect(within(savebar).getByRole('button', {name: '保存草稿'})).toHaveClass('product-editor-save-primary');
  expect(within(savebar).getByRole('button', {name: '发布草稿'})).toHaveClass('product-editor-save-primary');
  const more = within(savebar).getByRole('button', {name: '更多'});
  expect(more).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(more);
  expect(more).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById('product-editor-more-actions')).toHaveAttribute('data-open', 'true');
  expect(within(savebar).getByRole('button', {name: '放弃修改'})).toBeInTheDocument();
  expect(within(savebar).getByRole('button', {name: '下架'})).toBeInTheDocument();
  expect(within(savebar).getByRole('button', {name: '返回'})).toBeInTheDocument();
});
