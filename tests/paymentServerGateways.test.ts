import {describe,expect,it,vi} from 'vitest';
import {SupabaseServerPricingGateway} from '../server/supabase';

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
});
