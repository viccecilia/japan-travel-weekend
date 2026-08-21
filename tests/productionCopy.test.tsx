import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {AppHome,BoardingPass,Login,Orders,Payment,PaymentResult} from '../src/app/AppDemo';
import {TripRoom} from '../src/app/TripRoom';
import {AppProvider} from '../src/app/store';
import {appConfig} from '../src/shared/config/businessRules';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);

const cases=[
  ['/app-demo',<AppHome/>],
  ['/app-demo/login',<Login/>],
  ['/app-demo/orders',<Orders/>],
  ['/app-demo/my-trip/room',<TripRoom/>],
  ['/app-demo/payment-result',<PaymentResult/>],
  ['/app-demo/boarding-pass/missing',<BoardingPass/>],
] as const;

describe('production 用户可见文案',()=>{
  it.each(cases)('%s 不显示开发或 Demo 标签',(path,component)=>{
    expect(appConfig.runtimeMode).toBe('production');
    const view=render(<MemoryRouter initialEntries={[path]}><AppProvider><Routes><Route path="*" element={component}/></Routes></AppProvider></MemoryRouter>);
    expect(view.container.textContent).not.toMatch(/开发种子|开发模拟|Demo/);
  });
  it('Supabase 可用但结账 API 缺失时支付按钮明确禁用',()=>{
    const client={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null},error:null})}} as unknown as SupabaseClient;
    const services=new ProductionBrowserServices(client,undefined);
    render(<MemoryRouter><AppProvider services={services}><Payment/></AppProvider></MemoryRouter>);
    expect(screen.getByText('账户服务可用，但结账服务尚未连接，当前不会创建订单或扣款。')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'结账服务未连接'})).toBeDisabled();
  });
});
