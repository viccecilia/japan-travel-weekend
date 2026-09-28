import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/20260927031500_lock_route_policy_agreement_at_quote.sql','utf8');
const modulesSql=readFileSync('supabase/migrations/20260928035238_phase36_lock_policy_modules_at_quote.sql','utf8');

describe('route policy agreement quote lock migration',()=>{
  it('locks route and policy agreement fields at quote creation',()=>{
    expect(sql).toContain('policy_template_version_id');
    expect(sql).toContain('accepted_locale');
    expect(sql).toContain('agreement_snapshot');
    expect(sql).toContain("'meetingTime',d.departs_at");
    expect(sql).toContain("'routeReminders',coalesce(v_content->'routeReminders'");
  });
  it('copies only the locked quote agreement into the immutable order snapshot',()=>{
    expect(sql).toContain('q.policy_template_version_id,q.accepted_locale,q.agreement_snapshot,q.agreement_accepted_at');
    expect(sql).not.toContain('update public.order_snapshots');
    expect(sql).toContain("q.accepted_locale<>p_accepted_locale then raise exception 'quote changed'");
  });
});

describe('route service and cancellation module lock migration',()=>{
  it('locks the exact published service and cancellation versions before the quote is inserted',()=>{
    expect(modulesSql).toContain('create trigger lock_order_quote_policy_modules before insert');
    expect(modulesSql).toContain('new.service_time_policy_version_id:=service_version.id');
    expect(modulesSql).toContain('new.cancellation_policy_version_id:=cancellation_version.id');
    expect(modulesSql).toContain("'policyModules'");
  });
  it('copies module IDs and the quote agreement snapshot without a current-version lookup at payment time',()=>{
    expect(modulesSql).toContain('q.service_time_policy_version_id,q.cancellation_policy_version_id,q.accepted_locale,q.agreement_snapshot');
    expect(modulesSql).not.toContain('update public.order_snapshots');
  });
});
