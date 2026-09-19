import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AiGuide} from '../src/app/AiGuide';
import {AppProvider} from '../src/app/store';

afterEach(()=>{cleanup();vi.restoreAllMocks()});
function setup(){
  let refresh:()=>void=()=>{};
  const meeting={vehicle_group_id:'mine',revision:4,status:'scheduled',acknowledged:false,meeting_at:'2099-09-01T04:00:00Z',meeting_name:'本车集合点',meeting_address:'大阪',latitude:34.6,longitude:135.5};
  const services={
    loadSellableDepartures:async()=>({data:[],error:null}),onAuthStateChange:()=>()=>{},currentUser:async()=>null,
    tripRoom:{
      loadAccessibleRoom:vi.fn(async()=>({data:{room_id:'room',vehicle_group_id:'mine',room_status:'open'},error:null})),
      loadCurrentMeeting:vi.fn(async()=>({...meeting})),
      loadItinerary:async()=>[{id:'poi1',name:'第一景点',meetingPointName:'南门',meetingPointDescription:'已发布说明一'},{id:'poi2',name:'第二景点',meetingPointName:'北门',meetingPointDescription:'已发布说明二'}],
      loadPassengerContext:async()=>({trip_title:'本车路线'}),
      acknowledgeMeeting:vi.fn(async()=>{meeting.acknowledged=true;return true}),
    },
    realtime:{subscribeTripRoom:vi.fn(async(_room:string,onMessage:()=>void)=>{refresh=onMessage;return {close:vi.fn()}})},
  };
  const view=render(<MemoryRouter initialEntries={['/app/ai-guide?vehicleGroup=mine']}><AppProvider services={services as never}><AiGuide/></AppProvider></MemoryRouter>);
  return {services,meeting,view,refresh:()=>refresh()};
}
describe('本车景点导览行为',()=>{
  it('景点独立阅读，结束回总览，集合更新打断且确认提交服务端版本',async()=>{
    const test=setup();
    const buttons=await screen.findAllByRole('button',{name:'查看景点资料'});
    fireEvent.click(buttons[0]);
    expect(screen.getByText('已发布说明一')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'结束阅读，返回自由活动总览'}));
    expect(screen.queryByText('已发布说明二')).toBeNull();
    fireEvent.click(buttons[1]);
    test.meeting.status='active';
    await act(async()=>test.refresh());
    expect(await screen.findByText('正在集合 · 导览已暂停')).toBeVisible();
    expect(screen.queryByText('已发布说明二')).toBeNull();
    expect(screen.getAllByRole('button',{name:'查看景点资料'})[0]).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'确认收到'}));
    await waitFor(()=>expect(test.services.tripRoom.acknowledgeMeeting).toHaveBeenCalledWith('mine',4));
    expect(await screen.findByRole('button',{name:'已确认收到／返回中'})).toBeDisabled();
  });
  it('组权限消失后清空本车资料，不展示其他组回退内容',async()=>{
    const test=setup();await screen.findByText('本车路线');
    test.services.tripRoom.loadAccessibleRoom.mockResolvedValue({data:{room_id:'other',vehicle_group_id:'other',room_status:'open'},error:null});
    await act(async()=>test.refresh());
    expect(await screen.findByRole('alert')).toHaveTextContent('无法访问指定旅行团');
    expect(screen.queryByText('本车路线')).toBeNull();
    expect(screen.queryByText('第一景点')).toBeNull();
  });
  it('无旅行团参数不加载固定路线或模拟定位',()=>{
    render(<MemoryRouter><AppProvider><AiGuide/></AppProvider></MemoryRouter>);
    expect(screen.getByText(/请从本人已分配/)).toBeVisible();
    expect(screen.queryByRole('button',{name:'读取当前位置'})).toBeNull();
  });
});
