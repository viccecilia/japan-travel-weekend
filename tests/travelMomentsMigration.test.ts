import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260928082633_phase41_travel_moment_submission_eligibility.sql'),'utf8');
const repairSql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260929012705_phase41_submission_repair_actions.sql'),'utf8');
const reasonGuardSql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260929021500_phase41_internal_reason_not_found_guard.sql'),'utf8');
const generationSql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260929040000_phase41_external_verification_generations.sql'),'utf8');
const duplicateSql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260929050000_phase41_duplicate_content_identity.sql'),'utf8');
describe('Phase 4.1 migration security contract',()=>{
 it('keeps the submission, check, metric, flag, and audit domains separate',()=>{for(const name of ['travel_moment_submissions','travel_moment_check_runs','travel_moment_metric_snapshots','travel_moment_flags','travel_moment_eligibility_audits','travel_moment_manual_verifications'])expect(sql).toContain(`public.${name}`);});
 it('enables RLS, revokes public access, and protects security-definer functions',()=>{expect(sql).toMatch(/enable row level security/);expect(sql).toMatch(/revoke all on public\.travel_moment_submissions/);expect(sql).toMatch(/security definer set search_path=public,pg_temp/);expect(sql).toContain('last_user_recheck_at>now()-interval \'6 hours\'');expect(sql).toContain('update_own_travel_moment_submission');});
 it('records nullable metrics and refund invalidation without rankings or rewards',()=>{expect(sql).toContain("nullif(p_metrics->>'views','')::bigint");expect(sql).toContain("'ORDER_REFUNDED'");expect(sql).not.toContain('travel_moment_rankings');expect(sql).not.toContain('discount_coupons');});
 it('repairs only the owner submission while canonicalizing URLs and retaining duplicate protection',()=>{expect(repairSql).toContain('account_id=auth.uid()');expect(repairSql).toContain("raise exception 'DUPLICATE_CONTENT'");expect(repairSql).toContain('tm_canonical_url');expect(repairSql).toContain('tm_content_id');expect(repairSql).toContain('eligibility_audits');});
 it('handles missing order lookup without dereferencing an unassigned record',()=>{expect(reasonGuardSql).toContain('if not found then return \'TRIP_NOT_FOUND\'; end if;');expect(reasonGuardSql).toContain('security definer set search_path=public,pg_temp');});
 it('uses one current generation evaluator and persists stale provider history',()=>{expect(generationSql).toContain("array['public','official_mention','campaign_hashtag','author']");expect(generationSql).toContain('p_expected_generation');expect(generationSql).toContain('if not v_is_current then return true; end if;');expect(generationSql).toContain('operations_confirm_all_travel_moment_external');expect(generationSql).toContain('verification_generation=v_generation');});
 it('returns the duplicate business result before the canonical content index can reject an equivalent URL',()=>{expect(duplicateSql).toContain('canonical_content_id=v_content');expect(duplicateSql).toContain("'DUPLICATE_CONTENT'");expect(duplicateSql).toContain('security definer set search_path=public,pg_temp');});
});
