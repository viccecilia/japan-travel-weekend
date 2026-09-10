import {readFileSync} from 'node:fs';import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609100115_ambassador_cash_commission.sql','utf8');
describe('统一10%现金佣金和每周提现',()=>{
 it('新规则版本化且不回写历史记录',()=>{expect(sql).toContain("values('cash-10-v1',10");expect(sql).not.toMatch(/update public\.discount_coupons set discount_percent/)});
 it('只按新人首笔实际完成行程结算一次',()=>{expect(sql).toContain("ejs.status='completed'");expect(sql).toContain('unique(referral_relationship_id)');expect(sql).toContain('unique(source_order_id)');expect(sql).toContain('earlier.created_at<v_order.created_at')});
 it('司导或达到十次门槛的游客大使才有现金佣金',()=>{expect(sql).toContain("p.role in('driver','guide')");expect(sql).toContain('count(*)>=10');expect(sql).toContain("c.recipient_kind='inviter'")});
 it('每周一次提现并锁定余额，重复请求返回原结果',()=>{expect(sql).toContain('unique(account_id,week_start)');expect(sql).toContain('unique(account_id,idempotency_key)');expect(sql).toContain("set status='locked'");expect(sql).toContain('if found then return')});
 it('退款不会遗留未提现收益，已进入付款流程则要求人工审计',()=>{expect(sql).toContain("set status='reversed'");expect(sql).toContain('commission already included in payout; manual audited recovery required')});
});
