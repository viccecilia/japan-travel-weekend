import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const tree=readFileSync('supabase/migrations/20260926082708_growth_operations_phase3_referral_tree.sql','utf8');
const detail=readFileSync('supabase/migrations/20260926083645_growth_operations_phase3_tree_details.sql','utf8');
const scope=readFileSync('supabase/migrations/20260926084520_growth_operations_phase3_anomaly_scope.sql','utf8');
const periodContext=readFileSync('supabase/migrations/20260926091500_growth_operations_phase3_period_context.sql','utf8');
describe('Phase 3 referral-tree migrations',()=>{
  it('keeps all operations RPCs protected by is_operations and blocks anonymous execution',()=>{for(const sql of [tree,detail,scope]){expect(sql).toContain('public.is_operations()');expect(sql).toMatch(/revoke all[\s\S]*?from public,anon/);}});
  it('reads the established relationship and ledger systems without a multi-level commission writer',()=>{expect(detail).toContain('cash_commission_entries');expect(detail).toContain('discount_coupons');expect(detail).not.toContain('insert into public.cash_commission_entries');});
  it('centralizes high-value and propagation thresholds and defines scoped anomaly checks',()=>{expect(detail).toContain('referral_tree_analysis_settings');expect(detail).toContain('high_value_direct_min');expect(scope).toContain('cash_missing_relation');expect(scope).toContain('valid_missing_completed_trip');expect(scope).toContain('coupon_missing_event');expect(scope).toContain('root_mismatch');});
  it('preserves an ancestor path when a descendant matches the selected period',()=>{expect(periodContext).toContain('context_sources');expect(periodContext).toContain('join context_sources');expect(periodContext).toContain("source_id in (select source_id from context_sources)");});
});
