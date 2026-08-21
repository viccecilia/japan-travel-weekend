import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';

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
});
