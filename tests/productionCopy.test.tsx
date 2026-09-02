import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {AppHome,BoardingPass,Login,Orders,Payment,PaymentResult} from '../src/app/App';
import {TripRoom} from '../src/app/TripRoom';
import {AppProvider} from '../src/app/store';
import {appConfig} from '../src/shared/config/businessRules';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);

const cases=[
  ['/app',<AppHome/>],
  ['/app/login',<Login/>],
  ['/app/orders',<Orders/>],
  ['/app/my-trip/room',<TripRoom/>],
  ['/app/payment-result',<PaymentResult/>],
  ['/app/boarding-pass/missing',<BoardingPass/>],
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
    expect(screen.getByText(/支付功能尚未开放/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'保存订单草稿（不扣款）'})).toBeDisabled();
    expect(document.body.textContent).not.toMatch(/测试|开发|Demo/);
  });
  it('Supabase 登录在 production 使用正式账户文案',async()=>{
    const client={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null},error:null})}} as unknown as SupabaseClient;
    const services=new ProductionBrowserServices(client,undefined);
    render(<MemoryRouter><AppProvider services={services}><Login/></AppProvider></MemoryRouter>);
    expect(await screen.findByRole('button',{name:'登录账户'})).toBeEnabled();
    expect(screen.getByText('使用安全账户会话；您只能查看本人有权访问的订单与行程。')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/测试|开发|Demo/);
  });
  it('配置结账入口时不向 production 用户暴露测试后端属性',()=>{
    const client={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null},error:null})}} as unknown as SupabaseClient;
    const services=new ProductionBrowserServices(client,'https://api.example.invalid');
    render(<MemoryRouter><AppProvider services={services}><Payment/></AppProvider></MemoryRouter>);
    expect(screen.getByText(/本阶段停在支付前/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'保存订单草稿（不扣款）'})).toBeDisabled();
    expect(document.body.textContent).not.toMatch(/测试|开发|Demo/);
  });
  it('远程本人订单卡片使用正式产品称谓',async()=>{
    const client={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null},error:null})},from:()=>({select:()=>({order:async()=>({data:[{id:'order-1',departure_id:'departure-1',seat_count:2,status:'paid'}],error:null})})})} as unknown as SupabaseClient;
    const services=new ProductionBrowserServices(client,undefined);
    render(<MemoryRouter><AppProvider services={services}><Orders/></AppProvider></MemoryRouter>);
    expect(await screen.findByText('本人订单')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/测试环境订单|测试|开发|Demo/);
  });
});
