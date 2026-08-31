import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import type {SupabaseClient} from '@supabase/supabase-js';
import {StaffPortal,StaffTaskAction} from '../src/app/StaffPortal';
import {AppProvider} from '../src/app/store';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);
const task={staff_assignment_id:'assignment-1',assignment_role:'driver',vehicle_group_id:'group-1',room_id:'room-1',room_status:'open',departure_id:'departure-1',trip_title:'京都与奈良',departs_at:'2026-09-01T00:00:00Z',meeting_name:'大阪梅田',meeting_address:'受控地址',map_lat:null,map_lng:null,vehicle_sequence:1,vehicle_type:'hiace-13',vehicle_label:'Hiace 1号车',vehicle_capacity:13,booked_seats:12,passenger_count:12,boarded_count:8,payment_ready_count:10,payment_review_count:2,payment_blocked_count:0};

describe('工作人员端',()=>{
  it('只展示履约付款状态，不展示金额或支付凭据',async()=>{
    const client={auth:{getUser:async()=>({data:{user:null},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name:string)=>name==='get_staff_portal_tasks'?{data:[task],error:null}:{data:null,error:null}} as unknown as SupabaseClient;
    render(<MemoryRouter><AppProvider services={new ProductionBrowserServices(client,undefined)}><StaffPortal/></AppProvider></MemoryRouter>);
    expect(await screen.findByText('本车订单状态')).toBeInTheDocument();
    expect(screen.getByText('可登车 10')).toBeInTheDocument();
    expect(screen.getByText('待人工确认 2')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/¥|银行卡|卡号：|优惠券/);
    expect(screen.getByText('司机权限')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'乘客点名'})).toHaveAttribute('href','/staff/tasks/assignment-1/passengers');
    expect(screen.getByRole('link',{name:'团队群聊'})).toHaveAttribute('href','/staff/tasks/assignment-1/chat');
    expect(screen.getByRole('link',{name:'发送通知'})).toHaveAttribute('href','/staff/tasks/assignment-1/notice');
    expect(screen.getByRole('link',{name:'异常上报'})).toHaveAttribute('href','/staff/tasks/assignment-1/incident');
    expect(screen.getByRole('link',{name:'联系运营'})).toHaveAttribute('href','/staff/tasks/assignment-1/support');
  });
  it('本车乘客点名仅显示最小必要字段并可保存状态',async()=>{
    const calls:string[]=[];
    const client={auth:{getUser:async()=>({data:{user:null},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name:string)=>{calls.push(name);if(name==='get_staff_portal_tasks')return {data:[task],error:null};if(name==='get_vehicle_group_attendance')return {data:[{passenger_id:'passenger-1',passenger_label:'测试乘客',order_id:'order-123456',status:'pending',status_at:null,contact_status:null}],error:null};return {data:null,error:null}}} as unknown as SupabaseClient;
    render(<MemoryRouter initialEntries={['/staff/tasks/assignment-1/passengers']}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Routes><Route path="/staff/tasks/:assignmentId/:action" element={<StaffTaskAction/>}/></Routes></AppProvider></MemoryRouter>);
    expect(await screen.findByText('测试乘客')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@|卡号：|¥|银行卡号/);
    fireEvent.click(screen.getByRole('button',{name:'已登车'}));
    expect(await screen.findByText('乘客状态已保存。')).toBeInTheDocument();
    expect(calls).toContain('set_staff_passenger_checkin');
  });
  it('联系时间到达后按需显示可拨打电话并调用审计 RPC',async()=>{
    const calls:string[]=[];
    const client={auth:{getUser:async()=>({data:{user:null},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name:string)=>{calls.push(name);if(name==='get_staff_portal_tasks')return {data:[task],error:null};if(name==='get_vehicle_group_attendance')return {data:[{passenger_id:'passenger-1',passenger_label:'测试乘客',order_id:'order-123456',status:'pending',status_at:null,contact_status:null}],error:null};if(name==='get_staff_passenger_contact')return {data:[{contact_name:'测试联系人',phone:'000-0000-0000'}],error:null};return {data:null,error:null}}} as unknown as SupabaseClient;
    render(<MemoryRouter initialEntries={['/staff/tasks/assignment-1/passengers']}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Routes><Route path="/staff/tasks/:assignmentId/:action" element={<StaffTaskAction/>}/></Routes></AppProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button',{name:'拨打乘客电话'}));
    expect(await screen.findByRole('link',{name:'000-0000-0000'})).toHaveAttribute('href','tel:000-0000-0000');
    expect(calls).toContain('get_staff_passenger_contact');
    expect(screen.getByRole('status')).toHaveTextContent('本次查看已记录');
  });
  it('异常上报只生成未外发草稿并保留调度 API 边界',async()=>{
    const client={auth:{getUser:async()=>({data:{user:null},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name:string)=>name==='get_staff_portal_tasks'?{data:[task],error:null}:{data:null,error:null}} as unknown as SupabaseClient;
    render(<MemoryRouter initialEntries={['/staff/tasks/assignment-1/incident']}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Routes><Route path="/staff/tasks/:assignmentId/:action" element={<StaffTaskAction/>}/></Routes></AppProvider></MemoryRouter>);
    const input=await screen.findByPlaceholderText(/填写事实/);
    fireEvent.change(input,{target:{value:'测试车辆延误，不包含真实乘客资料'}});
    fireEvent.click(screen.getByRole('button',{name:'生成待提交草稿'}));
    expect(screen.getByRole('status')).toHaveTextContent('未连接柚子调度或外部通知');
    expect(screen.getByText(/Yuzu Dispatch/)).toBeInTheDocument();
  });
});
