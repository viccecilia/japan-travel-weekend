import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';

let app: any;
vi.mock('../src/app/store',()=>({useApp:()=>app}));
import {PassengerMessages} from '../src/app/PassengerMessages';

afterEach(()=>{cleanup();vi.restoreAllMocks()});

const room=(vehicleGroupId:string,status:'open'|'frozen'|'closed'='open')=>({
  room_id:`room-${vehicleGroupId}`,
  vehicle_group_id:vehicleGroupId,
  room_status:status,
  opens_at:'2026-09-25T00:00:00.000Z',
  departs_at:'2026-09-26T00:00:00.000Z',
  vehicle_label:'大阪 1234',
});

function Location(){const location=useLocation();return <output data-testid="location">{location.pathname}{location.search}</output>}
function renderMessages(){return render(<MemoryRouter initialEntries={['/app/messages']}><Routes><Route path="/app/messages" element={<PassengerMessages/>}/><Route path="/app/my-trip/room" element={<Location/>}/></Routes></MemoryRouter>)}

describe('游客消息入口',()=>{
  it('将一个已付款订单解析到同一个 vehicle group 的开放群并自动进入',async()=>{
    const target=room('group-one');
    app={state:{ui:{locale:'zh-CN'}},services:{
      loadOwnOrders:vi.fn().mockResolvedValue({data:[{id:'order-one',status:'paid'}],error:null}),
      loadOwnOrderFulfilment:vi.fn().mockResolvedValue({vehicle_group_id:'group-one'}),
      tripRoom:{loadAccessibleRoom:vi.fn().mockResolvedValue({data:target,error:null})},
    }};
    renderMessages();
    await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('/app/my-trip/room?vehicleGroup=group-one'));
    expect(app.services.tripRoom.loadAccessibleRoom).toHaveBeenCalledWith('group-one');
  });

  it('将已完成订单的关闭群保留为只读历史入口',async()=>{
    const target=room('group-history','closed');
    app={state:{ui:{locale:'zh-CN'}},services:{
      loadOwnOrders:vi.fn().mockResolvedValue({data:[{id:'order-history',status:'completed'}],error:null}),
      loadOwnOrderFulfilment:vi.fn().mockResolvedValue({vehicle_group_id:'group-history'}),
      tripRoom:{loadAccessibleRoom:vi.fn().mockResolvedValue({data:target,error:null})},
    }};
    renderMessages();
    expect(await screen.findByRole('link',{name:'查看历史群聊'})).toHaveAttribute('href','/app/my-trip/room?vehicleGroup=group-history');
  });

  it('冻结群显示真实开放状态，不误报服务不可用',async()=>{
    const target=room('group-frozen','frozen');
    app={state:{ui:{locale:'zh-CN'}},services:{
      loadOwnOrders:vi.fn().mockResolvedValue({data:[{id:'order-frozen',status:'confirmed'}],error:null}),
      loadOwnOrderFulfilment:vi.fn().mockResolvedValue({vehicle_group_id:'group-frozen'}),
      tripRoom:{loadAccessibleRoom:vi.fn().mockResolvedValue({data:target,error:null})},
    }};
    renderMessages();
    expect(await screen.findByRole('heading',{name:'群聊暂未开放'})).toBeInTheDocument();
    expect(screen.queryByText('行程群服务暂不可用')).not.toBeInTheDocument();
  });
});
