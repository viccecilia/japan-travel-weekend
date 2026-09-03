import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('bank transfer payment window',()=>{
  const sql=readFileSync('supabase/migrations/202609030053_bank_transfer_payment_window.sql','utf8');
  it('stores and returns a bounded payment deadline',()=>{
    expect(sql).toContain('manual_payment_due_at timestamptz');
    expect(sql).toContain("least(now()+interval '24 hours',v_departs_at-interval '2 hours')");
    expect(sql).toContain('if v_due<=now() then return null');
    expect(sql).toContain('returns timestamptz');
  });
  it('extends only an active hold and exposes the deadline in the necessary notification',()=>{
    expect(sql).toContain("where order_id=p_order and status='held' and expires_at>now()");
    expect(sql).toContain("raise exception 'active inventory hold required'");
    expect(sql).toContain("'paymentDueAt',v_due");
  });
  it('provides a trusted scheduler transition that releases overdue orders',()=>{
    expect(sql).toContain('expire_due_bank_transfers');
    expect(sql).toContain("status='pending_manual_review' and manual_payment_due_at<=p_now");
    expect(sql).toContain("set status='expired'");
    expect(sql).toContain("grant execute on function public.expire_due_bank_transfers(timestamptz) to service_role");
  });
});
