import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter, useLocation} from 'react-router-dom';
import {ProductCenter} from '../src/app/operations/ProductCenter';
import {AppProvider} from '../src/app/store';
import type {OperationsProduct} from '../src/shared/integrations/supabaseOperations';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(()=>cleanup());
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};});
const product=(id:string,title:string,version:number):OperationsProduct=>({id,slug:id,status:'draft',catalogVersion:version,publishedRevision:null,draftRevision:1,title,content:{itinerary:[]},heroImageUrl:null,gallery:[],updatedAt:'2026-09-11T00:00:00Z'});
function CurrentLocation(){const location=useLocation();return <output aria-label="当前地址">{location.pathname}{location.search}</output>}
const renderCenter=(copyProduct:ReturnType<typeof vi.fn>, initial='/app/operations/products', listProducts?:ReturnType<typeof vi.fn>)=>{
  const products=[product('route-a','路线 A',7),product('route-b','路线 B',12)];
  const services={operations:{listProducts:listProducts ?? vi.fn(async()=>({data:products,error:null})),listProductRevisions:vi.fn(async()=>({data:[],error:null})),copyProduct},loadSellableDepartures:async()=>({data:[],error:null}),onAuthStateChange:()=>()=>{},currentUser:async()=>null} as unknown as ProductionBrowserServices;
  render(<MemoryRouter initialEntries={[initial]}><AppProvider services={services}><ProductCenter/><CurrentLocation/></AppProvider></MemoryRouter>);
};

describe('产品复制组件行为',()=>{
  it('打开 A 的复制表单后筛选 B，仍复制 A 的固定版本并跳转新草稿',async()=>{
  const copyProduct=vi.fn(async()=>({ok:true,id:'route-a-copy',error:null}));renderCenter(copyProduct);
    const rows=await screen.findAllByRole('button',{name:/复制$/});
    fireEvent.click(rows[0]);
    fireEvent.change(screen.getByRole('textbox',{name:'搜索路线'}),{target:{value:'路线 B'}});
    fireEvent.submit(screen.getByRole('form',{name:'复制产品'}));
    await waitFor(()=>expect(copyProduct).toHaveBeenCalledWith(expect.objectContaining({sourceId:'route-a',sourceVersion:7})));
    await waitFor(()=>expect(screen.getByLabelText('当前地址').textContent).toContain('/products/route-a-copy/edit?returnTo='));
  });

  it('从深链恢复搜索和状态，编辑链接保留列表条件，草稿没有公开预览',async()=>{
    renderCenter(vi.fn(),'/app/operations/products?q=route-b&status=draft');
    const edit=await screen.findByRole('link',{name:'编辑'});
    expect(edit.getAttribute('href')).toContain('/products/route-b/edit?returnTo=');
    expect(decodeURIComponent(edit.getAttribute('href')!)).toContain('q=route-b&status=draft');
    expect(screen.getByRole('textbox',{name:'搜索路线'})).toHaveValue('route-b');
    expect(screen.queryByRole('link',{name:'预览'})).not.toBeInTheDocument();
  });

  it('读取抛错后显示错误而非空数据，重试可以恢复',async()=>{
    const list=vi.fn().mockRejectedValueOnce(new Error('连接中断')).mockResolvedValue({data:[product('route-a','路线 A',7)],error:null});
    renderCenter(vi.fn(),'/app/operations/products',list);
    expect(await screen.findByRole('alert')).toHaveTextContent('连接中断');
    expect(screen.queryByText(/当前筛选下无匹配路线/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'重试'}));
    expect(await screen.findByRole('link',{name:'编辑'})).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('网络异常时保留复制表单并显示可理解的失败提示',async()=>{
    const copyProduct=vi.fn(async()=>{throw new Error('网络连接中断')});renderCenter(copyProduct);
    await screen.findByRole('button',{name:/路线 A 复制/});
    const rows=await screen.findAllByRole('button',{name:/复制$/});
    fireEvent.click(rows[0]);
    fireEvent.submit(screen.getByRole('form',{name:'复制产品'}));
    expect(await screen.findByText('复制失败：网络连接中断')).toBeInTheDocument();
    expect(screen.getByRole('form',{name:'复制产品'})).toBeInTheDocument();
  });
});
