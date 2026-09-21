import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';
import {Orders,OrderDetail,Profile,AppTrips,AppShell} from '../src/app/App';
import {PassengerMessages} from '../src/app/PassengerMessages';
const mock=vi.hoisted(()=>{
 const services={loadOwnOrders:vi.fn(),loadOwnDrafts:vi.fn(),loadOwnOrderBilling:vi.fn(),loadOwnOrderFulfilment:vi.fn(),loadOwnCancellationRequest:vi.fn(),loadOwnAccountProfile:vi.fn(),loadOwnDisplayName:vi.fn(),currentRole:vi.fn(),updateOwnAccountProfile:vi.fn(),updateOwnDisplayName:vi.fn(),signOut:vi.fn(),loadOwnShareCampaign:vi.fn(),tripRoom:{loadAccessibleRoom:vi.fn()}};
 return {services,clearIdentity:vi.fn()};
});
vi.mock('../src/app/store',()=>({useApp:()=>({services:mock.services,state:{user:{email:'test@example.invalid'},ui:{locale:'zh-CN',compact:false},orders:[]},departures:[],clearIdentity:mock.clearIdentity,reset:vi.fn(),setUi:vi.fn()}),useOptionalApp:()=>({state:{ui:{locale:'zh-CN'}},setUi:vi.fn()})}));
afterEach(cleanup);
beforeEach(()=>{
 vi.resetAllMocks();
 mock.services.loadOwnOrders.mockResolvedValue({data:[{id:'paid',departure_id:'dep',seat_count:2,status:'paid',departure:{departs_at:'2026-10-01T00:00:00Z',status:'open',trip:{slug:'amanohashidate-ine'}}},{id:'cancelled',departure_id:'dep',seat_count:1,status:'cancelled'},{id:'completed',departure_id:'dep',seat_count:1,status:'confirmed',departure:{status:'completed'}},{id:'pending',departure_id:'dep',seat_count:1,status:'pending_payment'}],error:null});
 mock.services.loadOwnDrafts.mockResolvedValue({data:[],error:null});
 mock.services.loadOwnOrderBilling.mockResolvedValue(null);
 mock.services.loadOwnOrderFulfilment.mockResolvedValue(null);
 mock.services.loadOwnCancellationRequest.mockResolvedValue(null);
 mock.services.tripRoom.loadAccessibleRoom.mockResolvedValue({data:null,error:null});
 mock.services.loadOwnAccountProfile.mockResolvedValue({data:{display_name:'测试先生',phone:'000',emergency_name:'测试联系人',emergency_phone:'111'},error:null});
 mock.services.loadOwnDisplayName.mockResolvedValue({data:'测试先生',error:null});
 mock.services.currentRole.mockResolvedValue('passenger');
 mock.services.loadOwnShareCampaign.mockResolvedValue({campaign:null});
 mock.services.updateOwnAccountProfile.mockResolvedValue({ok:true,error:null});
 mock.services.updateOwnDisplayName.mockResolvedValue({ok:true,error:null});
});
const mount=(node:React.ReactNode,path='/')=>render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
const RoomDestination=()=>{const location=useLocation();return <p>ROOM {location.search}</p>};
describe('passenger frame closure',()=>{
 it('VIP precedes two-column route cards and groups stay last',()=>{
  mount(<AppTrips/>);const root=document.querySelector('.route-catalog')!;
  expect(root.firstElementChild?.querySelector('a')).toHaveAttribute('href','/app/vip-charter');
  expect(root.lastElementChild?.querySelector('a')).toHaveAttribute('href','/app/private-groups');
  expect(screen.getByRole('heading',{name:'精选线路'})).toBeVisible();
  expect(screen.queryByText('下一次想去哪里？')).toBeNull();
 });
 it('messages and notification bell have separate destinations',()=>{
  mount(<AppShell nav>content</AppShell>,'/app/messages');
  expect(screen.getByRole('link',{name:'系统通知'})).toHaveAttribute('href','/app/notifications');
  expect(screen.getByRole('link',{name:/消息$/})).toHaveAttribute('href','/app/messages');
  expect(document.querySelectorAll('[aria-current=page]')).toHaveLength(1);
 });
 it('filters actual order/fulfilment states and entire card navigates to the matching id',async()=>{
  mount(<Routes><Route path="/" element={<Orders/>}/><Route path="/app/orders/:id" element={<p>ORDER DETAIL</p>}/></Routes>);
  await waitFor(()=>expect(document.querySelectorAll('.passenger-order-link')).toHaveLength(4));
  fireEvent.click(screen.getByRole('button',{name:'已完成'}));
  expect(document.querySelectorAll('.passenger-order-link')).toHaveLength(1);
  expect(document.querySelector('.passenger-order-link')).toHaveAttribute('href','/app/orders/completed');
  fireEvent.click(screen.getByRole('button',{name:'待付款'}));
  expect(document.querySelector('.passenger-order-link')).toHaveAttribute('href','/app/orders/pending');
  fireEvent.click(screen.getByRole('button',{name:'已取消'}));
  fireEvent.click(document.querySelector('.passenger-order-link')!);
  expect(screen.getByText('ORDER DETAIL')).toBeVisible();
 });
 it('detail request failure ends loading and offers retry, rather than a dead click',async()=>{
  mock.services.loadOwnOrders.mockRejectedValue(new Error('network unavailable'));
  mount(<Routes><Route path="/app/orders/:id" element={<OrderDetail/>}/></Routes>,'/app/orders/paid');
  expect(await screen.findByRole('alert')).toHaveTextContent('network unavailable');
  expect(screen.getByRole('button',{name:'重新读取'})).toBeEnabled();
 });
 it('legacy billing with null amounts renders unknown values, not a blank page or fabricated zero',async()=>{
  mock.services.loadOwnOrderBilling.mockResolvedValue({lineItems:[],grossAmountJpy:null,amountPaidJpy:null,discountAmountJpy:0,refunds:[],snapshotAvailable:false});
  mount(<Routes><Route path="/app/orders/:id" element={<OrderDetail/>}/></Routes>,'/app/orders/paid');
  expect(await screen.findByRole('region',{name:'不可变订单账单'})).toHaveTextContent('待确认');
  expect(screen.getByRole('region',{name:'不可变订单账单'})).not.toHaveTextContent('¥0');
 });
 it('locked room consumes server opens_at/status, even if orders hide unannounced group details',async()=>{
  mock.services.tripRoom.loadAccessibleRoom.mockResolvedValue({data:{room_id:'r',vehicle_group_id:'g',room_status:'frozen',opens_at:'2026-10-01T00:00:00Z'},error:null});
  mount(<PassengerMessages/>);
  expect(await screen.findByText('群聊暂未开放')).toBeVisible();
  expect(screen.getByRole('textbox',{name:'聊天消息'})).toBeDisabled();
  expect(screen.getByText(/2026\/10\/1/)).toBeVisible();
  expect(screen.queryByRole('link',{name:'进入本车群聊'})).toBeNull();
 });
 it('one open room redirects to that group; unknown requested group cannot fall back to another',async()=>{
  mock.services.tripRoom.loadAccessibleRoom.mockResolvedValue({data:{room_id:'r',vehicle_group_id:'g',room_status:'open'},error:null});
  const view=mount(<Routes><Route path="/" element={<PassengerMessages/>}/><Route path="/app/my-trip/room" element={<RoomDestination/>}/></Routes>);
  expect(await screen.findByText('ROOM ?vehicleGroup=g')).toBeVisible();
  view.unmount();mount(<PassengerMessages/>,'/?vehicleGroup=other');
  expect(await screen.findByRole('alert')).toHaveTextContent('无法访问指定旅行团');
  expect(screen.queryByRole('link',{name:'进入本车群聊'})).toBeNull();
 });
 it('two open rooms keep the explicit group picker instead of silently choosing',async()=>{
  mock.services.loadOwnOrderFulfilment.mockResolvedValue({vehicle_group_id:'second'});
  mock.services.tripRoom.loadAccessibleRoom.mockImplementation(async(id?:string)=>({data:{room_id:'r-'+(id??'first'),vehicle_group_id:id??'first',room_status:'open'},error:null}));
  mount(<PassengerMessages/>);
  expect(await screen.findByRole('combobox',{name:'选择本车行程'})).toBeVisible();
  expect(screen.getByRole('combobox')).toHaveValue('second');
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'first'}});
  expect(await screen.findByRole('link',{name:'进入本车群聊'})).toHaveAttribute('href','/app/my-trip/room?vehicleGroup=first');
 });
 it('closed rooms offer history without an enabled composer',async()=>{
  mock.services.tripRoom.loadAccessibleRoom.mockResolvedValue({data:{room_id:'r',vehicle_group_id:'g',room_status:'closed'},error:null});
  mount(<PassengerMessages/>);
  expect(await screen.findByRole('link',{name:'查看历史群聊'})).toHaveAttribute('href','/app/my-trip/room?vehicleGroup=g');
  expect(screen.getByRole('textbox',{name:'聊天消息'})).toBeDisabled();
 });
 it('no group stays a chat empty state, without simulated messages',async()=>{
  mount(<PassengerMessages/>);
  expect(await screen.findByText('暂无可用行程群')).toBeVisible();
  expect(screen.getByRole('textbox',{name:'聊天消息'})).toBeDisabled();
 });
 it('two profile sections preserve fields, unify existing saves and clear identity on sign out',async()=>{
  mount(<Profile/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'保存个人资料'})).toBeEnabled());
  expect(document.querySelectorAll('.passenger-profile-sections>section')).toHaveLength(2);
  expect(screen.getByLabelText(/紧急联系人姓名/)).toHaveValue('测试联系人');
  fireEvent.click(screen.getByRole('checkbox',{name:/服务条款/}));
  fireEvent.click(screen.getByRole('checkbox',{name:/隐私政策/}));
  fireEvent.submit(screen.getByRole('button',{name:'保存个人资料'}).closest('form')!);
  await waitFor(()=>expect(mock.services.updateOwnDisplayName).toHaveBeenCalledWith('测试先生'));
  expect(mock.services.updateOwnAccountProfile).toHaveBeenCalledWith(expect.objectContaining({phone:'000',emergencyName:'测试联系人',acceptedPrivacy:true}));
  fireEvent.click(screen.getByRole('button',{name:'退出账户'}));
  await waitFor(()=>expect(mock.clearIdentity).toHaveBeenCalled());
 });
 it('partial profile failure retains inputs and explains which save did not finish',async()=>{
  mock.services.updateOwnDisplayName.mockResolvedValue({ok:false,error:'network failure'});
  mount(<Profile/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存个人资料'})).toBeEnabled());
  fireEvent.submit(screen.getByRole('button',{name:'保存个人资料'}).closest('form')!);
  expect(await screen.findByRole('status')).toHaveTextContent(/联系资料已保存.*公开显示名称未保存.*network failure/);
  expect(screen.getByLabelText(/紧急联系人姓名/)).toHaveValue('测试联系人');
 });
 it('existing consent hides checkboxes while retaining policy links and saves without fresh consent',async()=>{
  mock.services.loadOwnAccountProfile.mockResolvedValue({data:{display_name:'测试先生',phone:'00000',emergency_name:'测试联系人',emergency_phone:'11111',accepted_terms_at:'2026-01-01T00:00:00Z',accepted_privacy_at:'2026-01-01T00:00:00Z'},error:null});
  mount(<Profile/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'保存个人资料'})).toBeEnabled());
  expect(screen.queryByRole('checkbox',{name:/服务条款/})).toBeNull();
  expect(screen.queryByRole('checkbox',{name:/隐私政策/})).toBeNull();
  expect(screen.getByRole('link',{name:'服务条款'})).toHaveAttribute('href','/terms');
  fireEvent.submit(screen.getByRole('button',{name:'保存个人资料'}).closest('form')!);
  await waitFor(()=>expect(mock.services.updateOwnAccountProfile).toHaveBeenCalledWith(expect.objectContaining({acceptedTerms:false,acceptedPrivacy:false})));
 });
});
