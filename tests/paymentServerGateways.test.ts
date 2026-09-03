import {describe,expect,it,vi} from 'vitest';
import {SupabaseManualPaymentGateway,SupabaseOrderInventoryGateway,SupabaseServerPricingGateway} from '../server/supabase';

describe('服务端支付 gateway',()=>{
  it('只为开放且配置正整数日元单价的班次报价',async()=>{
    const maybeSingle=vi.fn(async()=>({data:{seat_price_jpy:8500,status:'open'},error:null}));
    const client={from:vi.fn(()=>({select:vi.fn(()=>({eq:vi.fn(()=>({maybeSingle}))}))}))};
    const gateway=new SupabaseServerPricingGateway(client as never);
    await expect(gateway.quote('departure',2)).resolves.toEqual({amount:17000,currency:'JPY'});
    expect(client.from).toHaveBeenCalledWith('departures');
  });
  it('缺价格、关闭班次和非法席数一律 fail closed',async()=>{
    const response={data:{seat_price_jpy:null,status:'open'},error:null};
    const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>response})})})};
    const gateway=new SupabaseServerPricingGateway(client as never);
    await expect(gateway.quote('departure',1)).resolves.toBeNull();
    await expect(gateway.quote('departure',0)).resolves.toBeNull();
    response.data={seat_price_jpy:8500,status:'closed'} as never;
    await expect(gateway.quote('departure',1)).resolves.toBeNull();
  });
  it('草稿结账把账户、班次和席数一起交给原子转换函数',async()=>{
    const rpc=vi.fn(async()=>({data:[{order_id:'o1',hold_id:'h1'}],error:null}));
    const gateway=new SupabaseOrderInventoryGateway({rpc} as never);
    await expect(gateway.reserve({accountId:'account-1',accessTokenHash:'hash'},{draftId:'draft-1',departureId:'dep-1',seats:3,idempotencyKey:'checkout-1',expiresAt:'2026-09-03T10:00:00Z'})).resolves.toEqual({orderId:'o1',holdId:'h1'});
    expect(rpc).toHaveBeenCalledWith('reserve_inventory_from_draft',expect.objectContaining({p_draft:'draft-1',p_account:'account-1',p_departure:'dep-1',p_seats:3}));
  });
  it('银行转账待核对状态同时写入服务端权威金额',async()=>{
    const rpc=vi.fn(async()=>({data:'2026-09-04T00:00:00Z',error:null}));
    const gateway=new SupabaseManualPaymentGateway({rpc} as never);
    await expect(gateway.markPending('order-1',17000)).resolves.toEqual({dueAt:'2026-09-04T00:00:00Z'});
    expect(rpc).toHaveBeenCalledWith('mark_bank_transfer_pending',{p_order:'order-1',p_amount:17000});
  });
});
