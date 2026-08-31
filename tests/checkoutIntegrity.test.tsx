import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {BookingPage,Checkout,Payment} from '../src/app/App';

afterEach(cleanup);

describe('结账完整性',()=>{
  it('没有可售价格的班次不显示空价格且不能继续',()=>{
    render(<MemoryRouter initialEntries={['/app/booking/kyoto-nara-classic']}><AppProvider><BookingPage/></AppProvider></MemoryRouter>);
    expect(document.body.textContent).not.toContain('¥null');
    expect(screen.getByText('该路线暂无开放班次')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'继续填写乘客信息'})).not.toBeInTheDocument();
  });
  it('缺少班次或乘客资料时核对页提供返回入口而不是支付入口',()=>{
    render(<MemoryRouter><AppProvider><Checkout/></AppProvider></MemoryRouter>);
    expect(screen.getByText('请先选择有效班次')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'选择支付方式'})).not.toBeInTheDocument();
  });
  it('支付页资料不完整时禁止创建开发订单',()=>{
    render(<MemoryRouter><AppProvider><Payment/></AppProvider></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('不会创建付款');
    expect(screen.getByRole('button',{name:'支付服务未开放'})).toBeDisabled();
  });
});
