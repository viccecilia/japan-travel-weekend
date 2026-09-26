import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const phase1=readFileSync('supabase/migrations/20260926043656_growth_operations_phase1.sql','utf8');
const phase2=readFileSync('supabase/migrations/20260926054340_growth_operations_phase2_ambassador_center.sql','utf8');

describe('Growth Operations Phase 2 database contract',()=>{
  it('keeps an earned automatic qualification active after a refund changes the current count',()=>{
    expect(phase1).toContain('qualification_achieved_at');
    expect(phase1).toContain('revoked_at');
    expect(phase1).toContain("when public.ambassador_qualifications.qualification_achieved_at is not null then 'active'");
    expect(phase1).not.toContain("when public.ambassador_qualifications.source='auto_unlocked' then 'pending'");
  });
  it('returns one authenticated dashboard, privacy-safe direct records, and monthly payout state',()=>{
    for(const name of ['get_ambassador_dashboard','list_own_referral_records','list_own_commission_history'])expect(phase2).toContain(name);
    expect(phase2).toContain("left(raw_name,1)||'***'");
    expect(phase2).toContain("period_month=b.current_start::date");
    expect(phase2).toContain("'threshold',10000");
    expect(phase2).toContain('grant execute on function public.get_ambassador_dashboard()');
  });
});
