import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/202609100109_checkout_attempt_and_immutable_billing.sql'),'utf8');

describe('V6 checkout and immutable billing migration',()=>{
  it('persists idempotent checkout attempts and replays stored responses',()=>{
    expect(sql).toContain('create table if not exists public.checkout_attempts');
    expect(sql).toContain('unique(account_id,idempotency_key)');
    expect(sql).toContain('checkout idempotency mismatch');
    expect(sql).toContain('record_checkout_attempt_result');
  });
  it('copies the confirmed quote contract into the immutable order snapshot',()=>{
    for(const marker of ['cancellation_policy_version','commercial_terms','line_items','quote_confirmed_at','q.meeting_address','q.id'])expect(sql).toContain(marker);
    expect(sql).toContain("if q.product_revision_id is distinct from");
  });
  it('exposes owner-scoped billing and keeps refunds as a separate ledger',()=>{
    expect(sql).toContain('get_own_order_billing');
    expect(sql).toContain("x.account_id=auth.uid() or public.is_operations()");
    expect(sql).toContain("'refunds',v_refunds");
  });
});
