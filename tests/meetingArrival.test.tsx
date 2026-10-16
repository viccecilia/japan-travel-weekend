import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
vi.mock('../src/app/store',()=>({useApp:()=>({state:{ui:{locale:'zh-CN'}}})}));
import {PassengerChatRoom} from '../src/app/PassengerChatRoom';
import {passengerChatDemo} from '../src/shared/data/passengerChatDemo';

afterEach(()=>{cleanup();vi.restoreAllMocks()});
const context={roomId:'room-1',vehicleGroupId:'group-1',status:'active' as const,revision:7,time:'09:30',place:'日本桥2号出口'};
const passenger=(id:string,status:'pending'|'at_meeting_point'|'boarded'='pending',meetingRevision:number|null=null)=>({passengerId:id,label:`游客 ${id}`,status,meetingRevision});
const room=(overrides:Partial<Parameters<typeof PassengerChatRoom>[0]>={})=>render(<MemoryRouter><PassengerChatRoom {...passengerChatDemo} meetingContext={context} arrivalPassengers={[passenger('B1')]} onArrive={vi.fn(async()=>true)} {...overrides}/></MemoryRouter>);

describe('游客集合通知快捷报到',()=>{
  it('集合通知绑定正式房间、车组和版本并显示当前地点时间',()=>{room();const notice=screen.getByText(/集合已开始/).closest('article')!;expect(notice).toHaveAttribute('data-room-id','room-1');expect(notice).toHaveAttribute('data-vehicle-group-id','group-1');expect(notice).toHaveAttribute('data-meeting-revision','7');expect(notice).toHaveTextContent('日本桥2号出口');expect(notice).toHaveTextContent('09:30')});
  it('单人点击直接提交当前乘客和集合版本',async()=>{const onArrive=vi.fn(async()=>true);room({onArrive});fireEvent.click(screen.getByRole('button',{name:/我已到达/}));await waitFor(()=>expect(onArrive).toHaveBeenCalledWith(['B1'],7))});
  it('5席家庭不默认全员报到，只提交明确勾选的一人',async()=>{const onArrive=vi.fn(async()=>true);room({arrivalPassengers:['B1','B2','B3','B4','B5'].map(id=>passenger(id)),onArrive});fireEvent.click(screen.getByRole('button',{name:/我已到达/}));expect(screen.getByRole('dialog',{name:'请选择已到达的同行乘客'})).toBeInTheDocument();fireEvent.click(screen.getByRole('checkbox',{name:/游客 B3/}));fireEvent.click(screen.getByRole('button',{name:'确认到达'}));await waitFor(()=>expect(onArrive).toHaveBeenCalledWith(['B3'],7));expect(onArrive).toHaveBeenCalledTimes(1)});
  it('多人未选择时不能确认',()=>{room({arrivalPassengers:[passenger('B1'),passenger('B2')]});fireEvent.click(screen.getByRole('button',{name:/我已到达/}));expect(screen.getByRole('button',{name:'确认到达'})).toBeDisabled()});
  it('请求处理中禁用按钮并展示进行中状态',async()=>{let resolve:(value:boolean)=>void=()=>{};const onArrive=vi.fn(()=>new Promise<boolean>(done=>{resolve=done}));room({onArrive});fireEvent.click(screen.getByRole('button',{name:/我已到达/}));expect(screen.getByRole('button',{name:'正在确认…'})).toBeDisabled();resolve(true);await waitFor(()=>expect(onArrive).toHaveBeenCalledTimes(1))});
  it('失败时明确提示并保留重试入口',async()=>{room({onArrive:vi.fn(async()=>false)});fireEvent.click(screen.getByRole('button',{name:/我已到达/}));expect(await screen.findByRole('alert')).toHaveTextContent('报到未保存');expect(screen.getByRole('button',{name:'重试'})).toBeEnabled()});
  it('当前版本已到达从服务端状态显示且刷新可恢复',()=>{room({arrivalPassengers:[passenger('B1','at_meeting_point',7)]});expect(screen.getByText('✓ 已到达')).toBeInTheDocument();expect(screen.queryByRole('button',{name:/我已到达/})).not.toBeInTheDocument()});
  it('已登车状态优先且不可倒退',()=>{room({arrivalPassengers:[passenger('B1','boarded')]});expect(screen.getByText('✓ 已登车')).toBeInTheDocument();expect(screen.queryByRole('button',{name:/我已到达/})).not.toBeInTheDocument()});
  it('旧集合版本的到达不适用于新版本',()=>{room({arrivalPassengers:[passenger('B1','at_meeting_point',6)]});expect(screen.getByRole('button',{name:/我已到达/})).toBeEnabled();expect(screen.getByText('#7')).toBeInTheDocument()});
  it('集合未开始时按钮不可用',()=>{room({meetingActive:false,meetingContext:{...context,status:'scheduled'}});expect(screen.getByRole('button',{name:/我已到达/})).toBeDisabled()});
  it('群关闭或行程结束后按钮不可用且通知保留',()=>{room({status:'ended',readOnly:true});expect(screen.getByText(/集合已开始/)).toBeInTheDocument();expect(screen.getByRole('button',{name:/我已到达/})).toBeDisabled()});
  it('到达失败不影响消息发送入口',async()=>{const onSend=vi.fn();const onArrive=vi.fn(async()=>false);room({onSend,onArrive});fireEvent.click(screen.getByRole('button',{name:/我已到达/}));await screen.findByRole('alert');expect(onSend).not.toHaveBeenCalled();expect(screen.getByRole('textbox',{name:'输入消息'})).toBeEnabled()});
});
