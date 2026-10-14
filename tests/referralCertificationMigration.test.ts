import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(join(process.cwd(),'supabase/migrations/20261014113520_referral_certification_quiz_v1.sql'),'utf8');

describe('referral certification migration',()=>{
  it('publishes exactly ten scored questions and keeps operations approval separate',()=>{
    expect(sql.match(/'referral-certification-v1','[^']+',\d+,\d+/g)).toHaveLength(10);
    expect(sql).toContain('scored_question_count=10');
    expect(sql).toContain("survey_question_count=0");
    expect(sql).toContain("v_passed:=v_total=10 and v_correct_count=v_total");
    expect(sql).not.toContain("status='approved'");
  });
  it('keeps correct options server-side and exposes only authenticated RPCs',()=>{
    expect(sql).toContain('revoke all on public.referral_certification_questions');
    expect(sql).not.toContain('grant select on public.referral_certification_questions to authenticated');
    expect(sql).not.toContain('grant select on public.referral_certification_attempts to authenticated');
    expect(sql).toContain('grant execute on function public.get_own_referral_certification()');
    expect(sql).toContain('to authenticated');
  });
});
