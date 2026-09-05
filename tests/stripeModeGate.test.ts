import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {StripeTestAdapter} from '../server/stripe';

describe('Stripe live mode safety gate',()=>{
  it('defaults to test and rejects live keys',()=>{
    const adapter=new StripeTestAdapter({secretKey:'sk_live_example',webhookSecret:'whsec_example'});
    expect(adapter.mode).toBe('test');
    expect(adapter.available).toBe(false);
  });
  it('accepts a live key only when live mode is explicit',()=>{
    const adapter=new StripeTestAdapter({secretKey:'sk_live_example',webhookSecret:'whsec_example',mode:'live'});
    expect(adapter.mode).toBe('live');
    expect(adapter.available).toBe(true);
  });
  it('rejects test keys in live mode',()=>{
    expect(new StripeTestAdapter({secretKey:'sk_test_example',webhookSecret:'whsec_example',mode:'live'}).available).toBe(false);
  });
  it('uses dashboard-managed automatic payment methods',()=>{
    const source=readFileSync(resolve(process.cwd(),'server/stripe.ts'),'utf8');
    expect(source).toContain('automatic_payment_methods:{enabled:true}');
  });
});
