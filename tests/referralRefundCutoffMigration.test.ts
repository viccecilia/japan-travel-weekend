import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609080085_referral_unlock_at_refund_cutoff.sql','utf8');
describe('推荐券在不可退款截止点解锁',()=>{
  it('把预计可用时间设为开团前24小时',()=>{expect(sql).toContain("available_at=d.departs_at-interval '24 hours'")});
  it('截止时间前仍要求推荐订单有效',()=>{expect(sql).toContain("c.status='pending_trip_completion'");expect(sql).toContain("o.status in ('paid','confirmed')");expect(sql).toContain("d.status not in ('cancelled')")});
  it('刷新权益或结账时自动完成到期转换',()=>{expect(sql).toContain('activate_referral_rewards_at_refund_cutoff(auth.uid())');expect(sql).toContain('activate_referral_rewards_at_refund_cutoff(p_account)')});
});
