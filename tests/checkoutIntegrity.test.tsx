import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {BookingPage,Checkout,Payment,resolvePaymentDeparture} from '../src/app/App';
import type {Departure} from '../src/shared/types';
import {travelRepository} from '../src/shared/data/repository';

afterEach(()=>{cleanup();vi.restoreAllMocks()});

describe('结账完整性',()=>{
  it('没有可售价格的班次不显示空价格且不能继续',()=>{
    vi.spyOn(travelRepository,'getTrip').mockReturnValue({slug:'kyoto-nara-classic',title:'京都奈良',shortTitle:'京都奈良',summary:'路线简介',description:'路线简介',region:'京都与奈良',duration:'一日',stops:['京都','奈良'],heroImage:'/images/kyoto-nara.jpg'} as never);
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
    expect(screen.getByRole('button',{name:'保存订单草稿（不扣款）'})).toBeDisabled();
  });
  it('Stripe 已锁定最后一席后仍保留已验证的班次快照',()=>{
    const held={id:'held-departure',price:100} as Departure;
    expect(resolvePaymentDeparture(undefined,held)).toBe(held);
    const refreshed={id:'refreshed-departure',price:100} as Departure;
    expect(resolvePaymentDeparture(refreshed,held)).toBe(refreshed);
  });
});
