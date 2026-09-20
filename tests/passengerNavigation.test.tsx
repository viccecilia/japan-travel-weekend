import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppNotifications,AppShell} from '../src/app/App';
import {AppProvider} from '../src/app/store';

afterEach(cleanup);

describe('乘客端底部导航',()=>{
  it('以消息作为核心入口并移除奖励入口',()=>{
    render(<MemoryRouter><AppShell nav><p>页面正文</p></AppShell></MemoryRouter>);
    const navigation=screen.getByRole('navigation',{name:'应用导航'});
    expect(navigation).toHaveTextContent('发现');
    expect(navigation).toHaveTextContent('精选线路');
    expect(navigation).toHaveTextContent('消息');
    expect(navigation).toHaveTextContent('订单');
    expect(navigation).toHaveTextContent('我的');
    expect(navigation).not.toHaveTextContent('奖励');
    expect(screen.getByRole('link',{name:/消息$/})).toHaveAttribute('href','/app/notifications');
  });
  it.each([
    ['/app','发现'],
    ['/app/private-groups','精选线路'],
    ['/app/vip-charter','精选线路'],
    ['/app/trips/kyoto-nara-classic','精选线路'],
    ['/app/booking/kyoto-nara-classic','精选线路'],
    ['/app/orders/order-1','订单'],
    ['/app/notifications','消息'],
    ['/app/my-trip/room?vehicleGroup=group-1','消息'],
    ['/app/profile','我的'],
    ['/app/rewards','我的'],
  ])('路径 %s 仅选中所属栏目 %s',(path,label)=>{
    render(<MemoryRouter initialEntries={[path]}><AppShell nav><p>页面正文</p></AppShell></MemoryRouter>);
    const navigation=screen.getByRole('navigation',{name:'应用导航'});
    const current=Array.from(navigation.querySelectorAll('[aria-current="page"]'));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(label);
    expect(current[0]).toHaveClass('active');
  });
  it('消息中心提供通知、本人行程群列表和客服入口',()=>{
    render(<MemoryRouter initialEntries={['/app/notifications?type=trip']}><AppProvider><AppNotifications/></AppProvider></MemoryRouter>);
    expect(screen.getByRole('button',{name:'旅行团'})).toHaveClass('active');
    expect(screen.getByRole('link',{name:/本车群聊/})).toHaveAttribute('href','/app/my-trip');
    expect(screen.getByRole('link',{name:/客服/})).toHaveAttribute('href','/app/support');
  });
});
