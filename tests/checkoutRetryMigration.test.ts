import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const migration=readFileSync(resolve(process.cwd(),'supabase/migrations/202609020030_checkout_retry_idempotency.sql'),'utf8');
const regression=readFileSync(resolve(process.cwd(),'supabase/verification/checkout_retry_idempotency_regression.sql'),'utf8');

describe('结账重试幂等加固',()=>{
  it('重试只校验业务参数，并拒绝复活无效库存锁',()=>{
    expect(migration).toContain("v_existing_order.departure_id<>p_departure or v_existing_order.seat_count<>p_seats");
    expect(migration).not.toContain('v_existing_hold.expires_at<>p_expires');
    expect(migration).toContain('idempotency request no longer active');
  });
  it('银行卡与 Stripe 记录允许相同结果安全重放',()=>{
    expect(migration).toContain("ord.status='pending_manual_review'");
    expect(migration).toContain('ord.payment_intent_id=p_payment_intent and ord.amount=p_amount');
  });
  it('远程回归覆盖时钟漂移、支付记录与业务参数冲突并回滚',()=>{
    for(const marker of ['FAIL changed expiry created duplicate checkout','FAIL payment intent retry','FAIL bank transfer retry','FAIL mismatched idempotency accepted'])expect(regression).toContain(marker);
    expect(regression.trimEnd().endsWith('rollback;')).toBe(true);
  });
});
