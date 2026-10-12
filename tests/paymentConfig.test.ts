import {describe,expect,it} from 'vitest';
import {resolvePaymentConfig} from '../server/paymentConfig';

describe('payment configuration',()=>{
  it('accepts a complete Test configuration regardless of production Node packaging',()=>{
    expect(resolvePaymentConfig({NODE_ENV:'production',JTW_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_example',STRIPE_WEBHOOK_SECRET:'whsec_example'})).toMatchObject({effectiveMode:'test',modeSafe:true,secretKeySafe:true,webhookSecretSafe:true,usable:true,reasons:[]});
  });
  it('fails closed for missing, invalid or mismatched configuration',()=>{
    expect(resolvePaymentConfig({})).toMatchObject({effectiveMode:'test',usable:false});
    expect(resolvePaymentConfig({JTW_STRIPE_MODE:'other',STRIPE_SECRET_KEY:'sk_test_example',STRIPE_WEBHOOK_SECRET:'whsec_example'})).toMatchObject({modeSafe:false,usable:false,reasons:expect.arrayContaining(['invalid_payment_mode'])});
    expect(resolvePaymentConfig({JTW_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_live_wrong',STRIPE_WEBHOOK_SECRET:'whsec_example'})).toMatchObject({secretKeySafe:false,usable:false});
  });
  it('never downgrades a requested Live mode and requires both authorization and production Node mode',()=>{
    const base={JTW_STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_example',STRIPE_WEBHOOK_SECRET:'whsec_example'};
    expect(resolvePaymentConfig({...base,NODE_ENV:'test',JTW_PRODUCTION_PAYMENT_AUTHORIZED:'true'})).toMatchObject({effectiveMode:'live',modeSafe:false,usable:false});
    expect(resolvePaymentConfig({...base,NODE_ENV:'production'})).toMatchObject({effectiveMode:'live',modeSafe:false,usable:false});
    expect(resolvePaymentConfig({...base,NODE_ENV:'production',JTW_PRODUCTION_PAYMENT_AUTHORIZED:'true'})).toMatchObject({effectiveMode:'live',modeSafe:true,usable:true});
  });
});
