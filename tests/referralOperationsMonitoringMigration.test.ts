import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609090086_referral_operations_monitoring.sql','utf8');
describe('管理端推荐优惠监控',()=>{
  it('核对每条推荐关系必须对应两张券',()=>{expect(sql).toContain("'expectedCoupons'");expect(sql).toContain("'missingPairs'");expect(sql).toContain('<>2')});
  it('统计完整状态和实际抵扣金额',()=>{for(const value of ['pending_trip_completion','active','reserved','redeemed','void','frozen','expired','discountAmountJpy'])expect(sql).toContain(value)});
  it('检测退款后奖励、提前激活、快速推荐和重复退款',()=>{for(const value of ['reward_after_refund','invalid_early_activation','rapid_referrals','repeat_cancellation'])expect(sql).toContain(value)});
  it('明确尚未采集的设备支付风控信号',()=>{for(const value of ['device_fingerprint','registration_ip','payment_method_fingerprint'])expect(sql).toContain(value)});
  it('人工冻结与恢复必须留审计记录',()=>{expect(sql).toContain('referral_coupon_admin_actions');expect(sql).toContain('operations_set_referral_coupon_status');expect(sql).toContain("length(trim(reason)) between 3 and 300")});
});
