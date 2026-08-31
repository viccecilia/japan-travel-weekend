import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppShell} from '../src/app/App';

afterEach(cleanup);

describe('乘客端底部导航',()=>{
  it('以消息作为核心入口并移除奖励入口',()=>{
    render(<MemoryRouter><AppShell nav><p>页面正文</p></AppShell></MemoryRouter>);
    const navigation=screen.getByRole('navigation',{name:'应用导航'});
    expect(navigation).toHaveTextContent('首页');
    expect(navigation).toHaveTextContent('行程');
    expect(navigation).toHaveTextContent('消息');
    expect(navigation).toHaveTextContent('订单');
    expect(navigation).toHaveTextContent('我的');
    expect(navigation).not.toHaveTextContent('奖励');
    expect(screen.getByRole('link',{name:/消息$/})).toHaveAttribute('href','/app/my-trip/room');
  });
});
