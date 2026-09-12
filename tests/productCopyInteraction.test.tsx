import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {ProductCenter} from '../src/app/operations/ProductCenter';
import {AppProvider} from '../src/app/store';
import type {OperationsProduct} from '../src/shared/integrations/supabaseOperations';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(()=>cleanup());
const product=(id:string,title:string,version:number):OperationsProduct=>({id,slug:id,status:'draft',catalogVersion:version,publishedRevision:null,draftRevision:1,title,content:{itinerary:[]},heroImageUrl:null,gallery:[],updatedAt:'2026-09-11T00:00:00Z'});
const renderCenter=(copyProduct:ReturnType<typeof vi.fn>)=>{
  const products=[product('route-a','路线 A',7),product('route-b','路线 B',12)];
  const services={operations:{listProducts:vi.fn(async()=>({data:products,error:null})),listProductRevisions:vi.fn(async()=>({data:[],error:null})),copyProduct},loadSellableDepartures:async()=>({data:[],error:null}),onAuthStateChange:()=>()=>{},currentUser:async()=>null} as unknown as ProductionBrowserServices;
  render(<MemoryRouter><AppProvider services={services}><ProductCenter/></AppProvider></MemoryRouter>);
};

describe('产品复制组件行为',()=>{
  it('打开 A 的复制表单后切换 B，提交仍使用 A 的固定 ID 和版本',async()=>{
  const copyProduct=vi.fn(async()=>({ok:true,id:'route-a-copy',error:null}));renderCenter(copyProduct);
    const rows=await screen.findAllByRole('button',{name:/复制$/});
    fireEvent.click(rows[0]);
    fireEvent.submit(screen.getByRole('form',{name:'复制产品'}));
    await waitFor(()=>expect(copyProduct).toHaveBeenCalledWith(expect.objectContaining({sourceId:'route-a',sourceVersion:7})));
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
