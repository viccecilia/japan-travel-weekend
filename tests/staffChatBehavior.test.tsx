import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {StaffChat} from '../src/app/StaffChat';
import {AppProvider} from '../src/app/store';
import type {StaffTask} from '../src/app/StaffPortal';

afterEach(cleanup);
const task={staff_assignment_id:'assignment',vehicle_group_id:'group',room_id:'room',room_status:'open',trip_title:'已分配路线',driver_name:'测试司机',guide_name:'测试导游'} as StaffTask;
function setup(){
  const sendMessage=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
  const services={currentUser:async()=>({id:'driver'}),onAuthStateChange:()=>()=>{},loadSellableDepartures:async()=>({data:[],error:null}),
    tripRoom:{sendMessage,loadMessages:async()=>[{id:'m',author_id:'guest',content:'原文',created_at:'2026-09-19T01:00:00Z',trip_room_message_translations:[{target_language:'es',translated_content:'Texto traducido'}]}],loadAttendance:vi.fn(async()=>[{passenger_id:'p',passenger_label:'游客甲'}])},
    realtime:{subscribeTripRoom:async()=>({close:vi.fn()})}};
  const view=render(<MemoryRouter><AppProvider services={services as never}><StaffChat task={task}/></AppProvider></MemoryRouter>);
  return {view,services,sendMessage};
}
describe('本车紧凑群聊',()=>{
  it('八语缓存翻译与原文可切换，成员先工作人员且不显示游客手机号',async()=>{
    const {services}=setup();await screen.findByText('原文');
    expect(screen.getByRole('combobox',{name:'目标语言'}).querySelectorAll('option')).toHaveLength(8);
    fireEvent.change(screen.getByRole('combobox',{name:'目标语言'}),{target:{value:'es'}});
    expect(screen.getByText('Texto traducido')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'查看原文'}));expect(screen.getByText('原文')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'群成员'}));
    expect(await screen.findByText('游客甲')).toBeVisible();
    expect(services.tripRoom.loadAttendance).toHaveBeenCalledWith('group');
    expect(screen.getByText('司机：测试司机')).toBeVisible();
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  });
  it('失败保留输入，重试同一幂等键；更多面板如实报告未接通上传',async()=>{
    const {sendMessage}=setup();await screen.findByText('原文');
    fireEvent.change(screen.getByRole('textbox',{name:'发送到本车群组'}),{target:{value:'请按时集合'}});
    fireEvent.click(screen.getByRole('button',{name:'发送'}));
    expect(await screen.findByText(/网络异常，内容已保留/)).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveValue('请按时集合');
    fireEvent.click(screen.getByRole('button',{name:'发送'}));
    await waitFor(()=>expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(sendMessage.mock.calls[0]).toEqual(sendMessage.mock.calls[1]);
    expect(await screen.findByText('消息已保存到本车群。')).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveValue('');
    fireEvent.click(screen.getByRole('button',{name:'更多聊天功能'}));
    fireEvent.click(screen.getByRole('button',{name:'相册'}));
    expect(screen.getByRole('status')).toHaveTextContent('群相册上传尚未接通');
  });
});
