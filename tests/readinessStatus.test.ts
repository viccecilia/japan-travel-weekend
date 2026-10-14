import {describe,expect,it} from 'vitest';
import {readReadinessStatus} from '../src/shared/readinessStatus';

describe('readReadinessStatus',()=>{
  it('keeps a structured 503 readiness response available for diagnostics',async()=>{
    const response=new Response(JSON.stringify({
      ok:false,
      mode:'test',
      version:'9eb91849bc533a11763e50f1e017b01a4a6a743c',
      checks:{database:true,stripeModeSafe:true,webhookSecret:true,notificationReceiptSecret:false},
    }),{status:503,headers:{'content-type':'application/json'}});

    await expect(readReadinessStatus(response)).resolves.toMatchObject({
      ok:false,
      mode:'test',
      checks:{notificationReceiptSecret:false},
    });
  });

  it('still rejects an invalid or non-JSON response',async()=>{
    await expect(readReadinessStatus(new Response('gateway error',{status:502}))).rejects.toThrow('服务状态读取失败');
  });
});
