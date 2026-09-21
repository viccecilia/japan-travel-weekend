import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ResumeOrderPayment} from '../src/app/ResumeOrderPayment';

const mocks=vi.hoisted(()=>({resume:vi.fn(),mode:'test',locale:'en'}));
vi.mock('../src/app/store',()=>({useApp:()=>({services:{resumePayment:mocks.resume},state:{ui:{locale:mocks.locale}}})}));
vi.mock('../src/shared/integrations/stripeClient',()=>({stripeClient:Promise.resolve({}),get stripeMode(){return mocks.mode}}));
vi.mock('@stripe/react-stripe-js',()=>({Elements:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('../src/app/StripePaymentForm',()=>({StripePaymentForm:({orderId}:{orderId:string})=><div>Payment for {orderId}</div>}));
afterEach(cleanup);
beforeEach(()=>{mocks.resume.mockReset();mocks.mode='test';mocks.locale='en'});
const open=()=>render(<MemoryRouter><ResumeOrderPayment orderId="existing-order"/></MemoryRouter>);

describe('resume existing order interaction',()=>{
 it('opens the payment form for the same order and uses the server amount',async()=>{
  mocks.resume.mockResolvedValue({orderId:'existing-order',amount:11000,clientSecret:'test-secret'});open();
  fireEvent.click(screen.getByRole('button',{name:'Continue payment'}));
  expect(await screen.findByText('Payment for existing-order')).toBeVisible();
  expect(screen.getByText('Amount due: ¥11,000')).toBeVisible();
  expect(mocks.resume).toHaveBeenCalledWith({orderId:'existing-order',idempotencyKey:expect.any(String)});
 });
 it('prevents repeated clicks while waiting and permits retry after network failure',async()=>{
  let reject!:(error:Error)=>void;
  mocks.resume.mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r}));open();
  const button=screen.getByRole('button',{name:'Continue payment'});
  fireEvent.click(button);fireEvent.click(button);
  expect(mocks.resume).toHaveBeenCalledTimes(1);expect(button).toBeDisabled();
  reject(Error('offline'));
  expect(await screen.findByRole('alert')).toHaveTextContent(/no new order will be created/i);
  mocks.resume.mockResolvedValue({orderId:'existing-order',amount:11000,clientSecret:'test-secret'});
  fireEvent.click(screen.getByRole('button',{name:'Continue payment'}));
  await screen.findByText('Payment for existing-order');expect(mocks.resume).toHaveBeenCalledTimes(2);
 });
 it('rejects an unexpected order response without opening its payment form',async()=>{
  mocks.resume.mockResolvedValue({orderId:'someone-else',amount:11000,clientSecret:'test-secret'});open();
  fireEvent.click(screen.getByRole('button',{name:'Continue payment'}));
  await screen.findByRole('alert');expect(screen.queryByText(/Payment for/)).toBeNull();
 });
 it('does not request payment in live mode',async()=>{
  mocks.mode='live';open();const button=screen.getByRole('button',{name:'Continue payment'});
  expect(button).toBeDisabled();fireEvent.click(button);
  await waitFor(()=>expect(mocks.resume).not.toHaveBeenCalled());
 });
 it('uses Spanish loading and failure feedback',async()=>{
  mocks.locale='es';mocks.resume.mockResolvedValue(null);open();
  fireEvent.click(screen.getByRole('button',{name:'Continuar el pago'}));
  expect(await screen.findByRole('alert')).toHaveTextContent(/no se creará otra reserva/i);
 });
});
