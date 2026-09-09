import {readFileSync} from 'node:fs';import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609080079_coupon_checkout_redemption.sql','utf8');
describe('优惠券结账核销',()=>{
  it('服务端锁定本人有效券并保存权威折后金额',()=>{for(const text of ["current_user not in ('service_role','postgres')","v_coupon.account_id<>p_account","v_coupon.status<>'active'","v_coupon.expires_at<=now()","discount_coupon_id=v_coupon.id","amount=v_amount"])expect(sql).toContain(text)});
  it('付款或付款异常后核销，取消和过期时释放',()=>{expect(sql).toContain("new.status in ('paid','confirmed','payment_review')");expect(sql).toContain("new.status in ('cancelled','expired')");expect(sql).toContain("status='redeemed'");expect(sql).toContain("then 'active' else 'expired'")});
  it('Stripe和银行转账都只接受订单权威金额',()=>{expect(sql.match(/coalesce\(/g)?.length).toBeGreaterThanOrEqual(2);expect(sql).toContain('record_stripe_payment_intent');expect(sql).toContain('mark_bank_transfer_pending')});
});
