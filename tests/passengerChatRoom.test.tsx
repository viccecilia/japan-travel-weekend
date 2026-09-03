import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {PassengerChatRoom} from '../src/app/PassengerChatRoom';
import {passengerChatDemo} from '../src/shared/data/passengerChatDemo';

afterEach(()=>{cleanup();vi.restoreAllMocks()});
const renderRoom=(overrides:Partial<Parameters<typeof PassengerChatRoom>[0]>={})=>render(<MemoryRouter><PassengerChatRoom {...passengerChatDemo} {...overrides}/></MemoryRouter>);

describe('游客群聊紧凑交互',()=>{
  it('点击集合栏展开并再次收起',()=>{renderRoom();const bar=screen.getByRole('button',{name:/11:30集合/});expect(bar).toHaveAttribute('aria-expanded','false');fireEvent.click(bar);expect(bar).toHaveAttribute('aria-expanded','true');expect(screen.getByText('司导与车辆')).toBeInTheDocument();fireEvent.click(bar);expect(screen.queryByText('司导与车辆')).not.toBeInTheDocument()});
  it('电话和地图按钮阻止集合栏展开，导航使用当前坐标',()=>{vi.spyOn(window,'confirm').mockReturnValue(false);const opened=vi.spyOn(window,'open').mockImplementation(()=>null);renderRoom();const bar=screen.getByRole('button',{name:/11:30集合/});fireEvent.click(screen.getByRole('button',{name:'拨打司导电话'}));expect(bar).toHaveAttribute('aria-expanded','false');fireEvent.click(screen.getByRole('button',{name:'打开步行导航'}));expect(bar).toHaveAttribute('aria-expanded','false');expect(opened).toHaveBeenCalledWith(expect.stringContaining('34.6889%2C135.8398'),'_blank')});
  it('消息左右分列且翻译失败仍显示原文',()=>{renderRoom({messages:[{id:'other',senderId:'p2',name:'游客A',role:'passenger',content:'Original message',time:'10:00'},{id:'mine',senderId:'me',name:'我',role:'passenger',content:'我的消息',time:'10:01'}]});expect(screen.getByText('Original message')).toBeInTheDocument();expect(screen.getByText('Original message').closest('article')).toHaveClass('other');expect(screen.getByText('我的消息').closest('article')).toHaveClass('own')});
  it('游客只看到集合总进度，不渲染其他乘客隐私字段',()=>{renderRoom();fireEvent.click(screen.getByRole('button',{name:/11:30集合/}));expect(screen.getByText(/全团已集合 9\/12人/)).toBeInTheDocument();expect(document.body.textContent).not.toContain('其他乘客电话');expect(document.body.textContent).not.toContain('付款金额');expect(document.body.textContent).not.toContain('证件号码')});
  it('行程结束后输入区转为只读',()=>{renderRoom({status:'ended',readOnly:true});expect(screen.getAllByText('行程已结束，聊天已转为只读').length).toBeGreaterThan(0);expect(screen.getByRole('textbox',{name:'输入消息'})).toBeDisabled();expect(screen.getByRole('button',{name:'发送'})).toBeDisabled()});
  it('重大集合变更在确认前保持提醒并可确认',()=>{renderRoom();const alert=screen.getByText(/集合信息已变更/).closest('article')!;expect(alert).not.toHaveClass('acknowledged');fireEvent.click(screen.getByRole('button',{name:'我知道了'}));expect(alert).toHaveClass('acknowledged')});
});
