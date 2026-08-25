import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {StripePaymentForm} from '../src/app/StripePaymentForm';

const mocks=vi.hoisted(()=>({confirmPayment:vi.fn()}));
vi.mock('@stripe/react-stripe-js',()=>({
  PaymentElement:()=> <div>Stripe 安全付款控件</div>,
  useStripe:()=>({confirmPayment:mocks.confirmPayment}),
  useElements:()=>({}),
}));

afterEach(cleanup);
beforeEach(()=>mocks.confirmPayment.mockReset());

describe('Stripe 浏览器付款表单',()=>{
  it('测试付款成功后只回传订单与供应商状态',async()=>{
    mocks.confirmPayment.mockResolvedValue({paymentIntent:{status:'succeeded'}});
    const complete=vi.fn();render(<StripePaymentForm orderId="order-1" onComplete={complete}/>);
    fireEvent.click(screen.getByRole('button',{name:'确认支付'}));
    await waitFor(()=>expect(complete).toHaveBeenCalledWith('order-1','succeeded'));
    expect(mocks.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({redirect:'if_required'}));
  });
  it('供应商拒绝付款时展示错误且不伪装成功',async()=>{
    mocks.confirmPayment.mockResolvedValue({error:{message:'测试卡被拒绝'}});
    const complete=vi.fn();render(<StripePaymentForm orderId="order-2" onComplete={complete}/>);
    fireEvent.click(screen.getByRole('button',{name:'确认支付'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('测试卡被拒绝');expect(complete).not.toHaveBeenCalled();
  });
});
