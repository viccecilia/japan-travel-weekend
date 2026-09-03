import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {MemoryRouter} from 'react-router-dom';
import {MyTrip} from '../src/app/TripRoom';
import {AppProvider} from '../src/app/store';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);

function servicesFor(orders:Array<{id:string;departure_id:string;seat_count:number;status:string}>,fulfilment:Record<string,unknown>|null){
  const rpc=vi.fn((name:string)=>name==='get_own_order_fulfilment'?{maybeSingle:async()=>({data:fulfilment,error:null})}:{maybeSingle:async()=>({data:null,error:null})});
  const client={
    auth:{getUser:async()=>({data:{user:{id:'owner-1',email:'owner@example.invalid'}},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:(table:string)=>({select:()=>({order:async()=>({data:table==='orders'?orders:[],error:null})})}),
    rpc,
  } as unknown as SupabaseClient;
  return {services:new ProductionBrowserServices(client,undefined),rpc};
}

describe('真实账户我的行程',()=>{
  it('从本人已付款订单读取履约投影并开放已建好的 Trip Room',async()=>{
    const {services}=servicesFor([{id:'order-paid',departure_id:'dep-1',seat_count:2,status:'paid'}],{
      departs_at:'2026-10-01T08:00:00+09:00',meeting_name:'大阪日本桥2号出口',meeting_address:'大阪市中央区日本桥',vehicle_group_id:'group-1',trip_room_id:'room-1',boarding_ready:true,
    });
    render(<MemoryRouter><AppProvider services={services}><MyTrip/></AppProvider></MemoryRouter>);
    expect(await screen.findByText('已付款一日游')).toBeInTheDocument();
    expect(screen.getAllByText('大阪日本桥2号出口')).toHaveLength(2);
    expect(screen.getByRole('link',{name:'进入本车行程房间'})).toHaveAttribute('href','/app/my-trip/room');
  });
  it('退款订单不会重新取得行程或群聊入口',async()=>{
    const {services,rpc}=servicesFor([{id:'order-refunded',departure_id:'dep-1',seat_count:2,status:'refunded'}],null);
    render(<MemoryRouter><AppProvider services={services}><MyTrip/></AppProvider></MemoryRouter>);
    expect(await screen.findByText('暂无进行中的行程')).toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'进入本车行程房间'})).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('get_own_order_fulfilment',expect.anything());
  });
});
