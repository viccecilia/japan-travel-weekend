import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';
import {isSafeApiBaseUrl} from '../src/shared/backend/testApi';

function publicClient(){
  const order=vi.fn(async()=>({data:[{id:'order-1',departure_id:'departure-1',seat_count:2,status:'paid'}],error:null}));
  const client={
    auth:{
      signInWithPassword:vi.fn(async()=>({data:{user:{id:'account-1',email:'test@example.invalid'}},error:null})),
      getSession:vi.fn(async()=>({data:{session:{access_token:'public-session'}}})),
    },
    from:vi.fn(()=>({select:vi.fn(()=>({order}))})),
  } as unknown as SupabaseClient;
  return {client,order};
}

describe('浏览器服务能力解耦',()=>{
  it('仅允许 HTTPS 或同源相对 API，拒绝 HTTP 外站和协议相对地址',()=>{expect(isSafeApiBaseUrl('https://api.example.test')).toBe(true);expect(isSafeApiBaseUrl('/api-test')).toBe(true);expect(isSafeApiBaseUrl('http://api.example.test')).toBe(false);expect(isSafeApiBaseUrl('//evil.test')).toBe(false)});
  it('仅有 Supabase 公开客户端时仍可登录和读取本人订单，但不能结账',async()=>{
    const {client}=publicClient();const fetcher=vi.fn();const services=new ProductionBrowserServices(client,undefined,fetcher as typeof fetch);
    expect(services.authAvailable).toBe(true);
    expect(services.ordersAvailable).toBe(true);
    expect(services.tripRoomAvailable).toBe(true);
    expect(services.realtimeAvailable).toBe(true);
    expect(services.checkoutAvailable).toBe(false);
    expect((await services.signIn('test@example.invalid','not-a-real-password'))?.user?.id).toBe('account-1');
    expect(await services.loadOwnOrders()).toMatchObject({data:[{id:'order-1'}],error:null});
    expect(await services.createCheckout({departureId:'departure-1',seats:2,idempotencyKey:'key-1',paymentMethod:'card'})).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('全部配置缺失时每项能力独立 fail closed',async()=>{
    const services=new ProductionBrowserServices(null,undefined);
    expect({auth:services.authAvailable,orders:services.ordersAvailable,checkout:services.checkoutAvailable,tripRoom:services.tripRoomAvailable,realtime:services.realtimeAvailable}).toEqual({auth:false,orders:false,checkout:false,tripRoom:false,realtime:false});
    expect(await services.signIn('nobody@example.invalid','unused')).toBeNull();
    expect(await services.loadOwnOrders()).toEqual({data:[],error:'账户服务未配置'});
    expect(await services.createCheckout({departureId:'departure-1',seats:1,idempotencyKey:'key-2',paymentMethod:'bank_transfer'})).toBeNull();
  });
  it('结账 API 错误保留可诊断代码而不伪装成功',async()=>{
    const {client}=publicClient();const fetcher=vi.fn(async()=>new Response(JSON.stringify({error:'inventory_unavailable'}),{status:409,headers:{'content-type':'application/json'}}));const services=new ProductionBrowserServices(client,'https://api.example.invalid',fetcher as typeof fetch);
    expect(await services.createCheckout({departureId:'departure-1',seats:3,idempotencyKey:'key-error',paymentMethod:'card'})).toEqual({status:'failed',error:'inventory_unavailable',httpStatus:409});
  });
  it('默认浏览器 fetch 保持正确的全局调用上下文',async()=>{
    const {client}=publicClient();const browserFetch=vi.fn(function(this:unknown){if(this!==globalThis)throw new TypeError('Illegal invocation');return Promise.resolve(new Response(JSON.stringify({orderId:'order-2',holdId:'hold-2',status:'pending_manual_review'}),{status:200,headers:{'content-type':'application/json'}}))});vi.stubGlobal('fetch',browserFetch);
    try{const services=new ProductionBrowserServices(client,'/api-test');expect((await services.createCheckout({departureId:'departure-1',seats:1,idempotencyKey:'key-bound-fetch',paymentMethod:'bank_transfer'}))?.status).toBe('pending_manual_review');expect(browserFetch).toHaveBeenCalledOnce()}finally{vi.unstubAllGlobals()}
  });
});
