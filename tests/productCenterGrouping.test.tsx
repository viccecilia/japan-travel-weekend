import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {ProductCenter} from '../src/app/operations/ProductCenter';
import type {OperationsProduct} from '../src/shared/integrations/supabaseOperations';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);

const product=(id:string,status:OperationsProduct['status'],options:{published?:number|null;draft?:number|null;title?:string}={}):OperationsProduct=>({
  id,slug:id,status,catalogVersion:3,publishedRevision:options.published??(status==='published'?2:null),draftRevision:options.draft??(status==='draft'?3:null),title:options.title??id,
  content:{routeStudioV1:true,region:'关西'},heroImageUrl:null,gallery:[],updatedAt:'2026-10-10T00:00:00Z',
});

const renderCenter=(listProducts:ReturnType<typeof vi.fn>,initial='/app/operations/products')=>{
  const services={operations:{listProducts,copyProduct:vi.fn()},loadSellableDepartures:async()=>({data:[],error:null}),onAuthStateChange:()=>()=>{},currentUser:async()=>null} as unknown as ProductionBrowserServices;
  render(<MemoryRouter initialEntries={[initial]}><AppProvider services={services}><ProductCenter/></AppProvider></MemoryRouter>);
};

describe('产品列表分区',()=>{
  it('已上架在上方，草稿和已下架默认折叠，但保留各自状态',async()=>{
    renderCenter(vi.fn(async()=>({data:[
      product('published-with-draft','published',{published:2,draft:3,title:'已上架有更新'}),
      product('draft-route','draft',{title:'草稿路线'}),
      product('archived-route','archived',{published:2,draft:3,title:'已下架且恢复了草稿'}),
    ],error:null})));
    expect(await screen.findByRole('heading',{name:'已上架产品（1）'})).toBeInTheDocument();
    expect(screen.getByText('已上架有更新')).toBeInTheDocument();
    expect(screen.getByText('有草稿更新')).toBeInTheDocument();
    const toggle=screen.getByRole('button',{name:'未上架产品（2）'});
    expect(toggle).toHaveAttribute('aria-expanded','false');
    expect(screen.queryByText('草稿路线')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    const table=screen.getByRole('region',{name:'未上架产品表格'});
    expect(within(table).getByText('草稿路线')).toBeInTheDocument();
    expect(within(table).getAllByText('草稿').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('已下架').length).toBeGreaterThan(0);
  });

  it('搜索命中未上架时自动展开，清空后恢复原折叠选择',async()=>{
    renderCenter(vi.fn(async()=>({data:[product('published','published',{title:'已上架'}),product('draft','draft',{title:'隐藏草稿'})],error:null})));
    await screen.findByText('已上架');
    const search=screen.getByRole('textbox',{name:'搜索路线'});
    fireEvent.change(search,{target:{value:'隐藏'}});
    expect(screen.getByText('隐藏草稿')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'未上架产品（1）'})).toHaveAttribute('aria-expanded','true');
    fireEvent.change(search,{target:{value:''}});
    expect(screen.queryByText('隐藏草稿')).not.toBeInTheDocument();
    fireEvent.change(search,{target:{value:'不存在'}});
    expect(screen.getByText('未找到匹配产品')).toBeInTheDocument();
  });

  it('选择草稿状态筛选时自动展开未上架分组',async()=>{
    renderCenter(vi.fn(async()=>({data:[product('published','published'),product('draft','draft',{title:'筛选草稿'})],error:null})));
    await screen.findByRole('heading',{name:'已上架产品（1）'});
    fireEvent.change(screen.getByRole('combobox',{name:'状态筛选'}),{target:{value:'draft'}});
    expect(screen.getByRole('button',{name:'未上架产品（1）'})).toHaveAttribute('aria-expanded','true');
    expect(screen.getByText('筛选草稿')).toBeInTheDocument();
  });

  it('下架或正式发布后重新读取即更新分组',async()=>{
    const list=vi.fn()
      .mockResolvedValueOnce({data:[product('one','published'),product('two','draft')],error:null})
      .mockResolvedValueOnce({data:[product('one','archived'),product('two','published')],error:null});
    renderCenter(list);
    expect(await screen.findByRole('heading',{name:'已上架产品（1）'})).toBeInTheDocument();
    window.dispatchEvent(new Event('focus'));
    await waitFor(()=>expect(list).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('region',{name:'已上架产品表格'})).toHaveTextContent('two');
    fireEvent.click(screen.getByRole('button',{name:'未上架产品（1）'}));
    expect(screen.getByRole('region',{name:'未上架产品表格'})).toHaveTextContent('one');
  });

  it('分组后分页并保留各组的稳定顺序与数量',async()=>{
    const published=Array.from({length:11},(_,index)=>product(`published-${index}`,'published'));
    const drafts=Array.from({length:11},(_,index)=>product(`draft-${index}`,'draft'));
    renderCenter(vi.fn(async()=>({data:[...published,...drafts],error:null})));
    expect(await screen.findByRole('heading',{name:'已上架产品（11）'})).toBeInTheDocument();
    const publishedTable=screen.getByRole('region',{name:'已上架产品表格'});
    expect(within(publishedTable).getAllByRole('row')).toHaveLength(11);
    expect(within(publishedTable).getAllByText('published-0').length).toBeGreaterThan(0);
    expect(within(publishedTable).queryByText('published-10')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'未上架产品（11）'}));
    const unpublishedTable=screen.getByRole('region',{name:'未上架产品表格'});
    expect(within(unpublishedTable).getAllByText('draft-0').length).toBeGreaterThan(0);
    expect(within(unpublishedTable).queryByText('draft-10')).not.toBeInTheDocument();
  });
});
