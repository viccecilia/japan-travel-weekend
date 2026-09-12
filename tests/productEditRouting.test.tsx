import {cleanup, render, screen, fireEvent} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {MemoryRouter, Routes, Route} from 'react-router-dom';
import {ProductEditPage} from '../src/app/operations/ProductEditPage';
import {AppProvider} from '../src/app/store';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);
function open(id: string, listProducts = vi.fn(async () => ({data: ['a','b'].map(id => ({id,slug:id,title:`路线 ${id}`,status:'draft',catalogVersion:1,content:{itinerary:[]},gallery:[],draftRevision:1,publishedRevision:null})),error:null}))) {
  const services = {operations:{listProducts,listProductRevisions:async()=>({data:[],error:null})},loadSellableDepartures:async()=>({data:[],error:null}),onAuthStateChange:()=>()=>{},currentUser:async()=>null} as unknown as ProductionBrowserServices;
  render(<MemoryRouter initialEntries={[`/app/operations/products/${id}/edit`]}><AppProvider services={services}><Routes><Route path="/app/operations/products/:productId/edit" element={<ProductEditPage/>}/></Routes></AppProvider></MemoryRouter>);
}
it.each(['a','b'])('深链 %s 读取对应路线且不包含产品列表',async id=>{
  open(id);
  expect(await screen.findByDisplayValue(`路线 ${id}`)).toBeInTheDocument();
  expect(screen.queryByRole('region',{name:'产品表格'})).not.toBeInTheDocument();
  expect(screen.queryByRole('link',{name:'查看当前公开页'})).not.toBeInTheDocument();
});
it('不存在的 ID 不回退到第一条路线',async()=>{
  open('missing');
  expect(await screen.findByText('路线不存在或无访问权限')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('路线 a')).not.toBeInTheDocument();
});
it('读取抛错后可以重试，不停留在加载状态',async()=>{
  const list=vi.fn().mockRejectedValueOnce(new Error('网络断开')).mockResolvedValue({data:[],error:null});
  open('a',list);
  expect(await screen.findByText('读取失败：网络断开')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'重新读取'}));
  expect(await screen.findByText('路线不存在或无访问权限')).toBeInTheDocument();
});
