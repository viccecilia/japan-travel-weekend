import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('bank transfer review queue',()=>{
  const sql=readFileSync('supabase/migrations/202609030051_bank_transfer_review_queue.sql','utf8');
  it('requires a positive server amount and preserves it idempotently',()=>{
    for(const marker of ['p_amount integer','p_amount<=0','d.seat_price_jpy::bigint*v_order.seat_count','v_expected<>p_amount',"status='pending_manual_review',amount=p_amount",'v_order.amount is distinct from p_amount'])expect(sql).toContain(marker);
  });
  it('creates a separate manual review work item and passenger notification',()=>{
    expect(sql).toContain("'manual_payment_review','pending'");
    expect(sql).toContain("'bank-transfer-pending'");
    expect(sql).toContain('on conflict(event_id) do nothing');
  });
  it('keeps the state transition service-role only',()=>{
    expect(sql).toContain('from public,anon,authenticated');
    expect(sql).toContain('to service_role');
  });
  it('also rejects Stripe intent recording when the quoted amount no longer matches',()=>{
    expect(sql).toContain('create or replace function public.record_stripe_payment_intent');
    expect(sql).toContain('d.seat_price_jpy::bigint*o.seat_count');
    expect(sql).toContain('payment_intent_id=p_payment_intent,amount=p_amount');
  });
});
