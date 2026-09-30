import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/20260930090000_qa01c_policy_authority.sql','utf8');

describe('QA-01C policy authority migration',()=>{
  it('locks all three module versions into a quote snapshot',()=>{
    expect(sql).toContain("'policyModules'");
    expect(sql).toContain("'global'");
    expect(sql).toContain("'serviceTime'");
    expect(sql).toContain("'cancellation'");
    expect(sql).toContain('new.policy_template_version_id:=global_version.id');
    expect(sql).toContain('new.service_time_policy_version_id:=service_version.id');
    expect(sql).toContain('new.cancellation_policy_version_id:=cancellation_version.id');
  });
  it('keeps only route-specific commercial fields outside shared policies',()=>{
    expect(sql).toContain("'routeSpecific'");
    expect(sql).toContain("'included'");
    expect(sql).toContain("'excluded'");
    expect(sql).not.toContain("'weatherPolicy',v_content");
    expect(sql).not.toContain("'childPolicy',v_content");
  });
  it('does not rewrite historical snapshots',()=>{
    expect(sql).not.toContain('update public.order_snapshots');
    expect(sql).not.toContain('update public.order_quotes');
  });
  it('leaves paid-order immutability to the quote-copy trigger',()=>{
    const capture=readFileSync('supabase/migrations/20260928035238_phase36_lock_policy_modules_at_quote.sql','utf8');
    expect(capture).toContain('q.policy_template_version_id,q.service_time_policy_version_id,q.cancellation_policy_version_id');
    expect(capture).toContain('q.agreement_snapshot,q.agreement_accepted_at from public.order_quotes q');
  });
});
