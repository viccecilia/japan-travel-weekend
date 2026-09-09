import {describe,expect,it} from 'vitest';import {readFileSync} from 'node:fs';
const refund=readFileSync('supabase/migrations/202609090089_refund_operations_state_machine.sql','utf8');
const quote=readFileSync('supabase/migrations/202609090097_order_quote_snapshot_and_refund_retry.sql','utf8');
const endpoint=readFileSync('server/refunds.ts','utf8');
describe('V3-C refund and immutable quote rules',()=>{
  it('allows an interrupted prepared operation to be loaded for retry',()=>expect(endpoint).toContain("'refund_prepared','refund_processing','provider_result_unknown'"));
  it('does not enqueue both legacy and event notifications for a full refund',()=>expect(refund).toContain('if delta>0 and not is_full then'));
  it('captures price, departure version, and product revision when the order is created',()=>{for(const value of ['quoted_unit_price_jpy','quoted_gross_amount_jpy','quoted_product_revision_id','quoted_departure_version','before insert on public.orders'])expect(quote).toContain(value)});
  it('builds the paid snapshot from the quote rather than the mutable current price',()=>expect(quote).toMatch(/coalesce\(new\.quoted_unit_price_jpy,d\.seat_price_jpy\)/));
});
