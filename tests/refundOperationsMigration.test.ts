import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(join(process.cwd(),'supabase','migrations','202609090089_refund_operations_state_machine.sql'),'utf8');

describe('U0 refund operation state machine migration',()=>{
  it('persists an operation and derives a provider key before channel submission',()=>{
    expect(sql).toContain('table if not exists public.refund_operations');
    expect(sql).toContain("'refund:'||gen_random_uuid()::text");
    expect(sql).toContain('unique(cancellation_request_id,client_request_key)');
  });
  it('separates partial refund totals from fulfilment cancellation',()=>{
    expect(sql).toContain('refunded_amount_jpy');
    expect(sql).toContain('is_full:=p_amount_refunded=p_charge_amount');
    expect(sql).toMatch(/status=case when is_full then 'refunded'::public\.order_status else status end/);
    expect(sql).toContain("'fullRefund',is_full");
  });
  it('provides explicit zero-value and manual refund states',()=>{
    expect(sql).toContain('operations_complete_cancellation_without_refund');
    expect(sql).toContain("'manual_refund_required'");
    expect(sql).toContain("'cancelled_without_refund'");
  });
});
