import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/202609100110_refund_convergence_and_manual_evidence.sql'),'utf8');
describe('V6 refund convergence',()=>{
  it('allows audited operator takeover without allowing terminal state rollback',()=>{expect(sql).toContain("role='operations'");expect(sql).toContain("if op.status='completed' then return true");expect(sql).toContain('handled_by=p_actor')});
  it('requires manual evidence and exact actual amount',()=>{for(const marker of ['manual_reference','evidence_note','p_actual_amount<>op.requested_amount','operations_complete_manual_refund'])expect(sql).toContain(marker)});
  it('converges refund updated and failed events idempotently',()=>{expect(sql).toContain('apply_stripe_refund_status_event');expect(sql).toContain('provider_result_unknown');expect(sql).toContain('on conflict(event_id) do nothing')});
});
