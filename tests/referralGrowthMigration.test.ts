import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/20261013071140_route_referral_growth_convergence.sql','utf8');
describe('route referral growth convergence migration',()=>{
  it('counts stable paid passenger completion evidence and never auto-activates at ten',()=>{expect(sql).toContain('referral_qualified_seats');expect(sql).toContain("pc.status='boarded'");expect(sql).toContain("js.status='completed'");expect(sql).toContain("p.commerce_status='paid'");expect(sql).toContain("then 'learning_candidate'");expect(sql).not.toMatch(/excluded\.qualifying_paid_seat_count>=10 then 'active'/)});
  it('fixes only the two referral coupon families to an exact 90 days',()=>{expect(sql).toContain("'referral-newcomer-90d-v1'");expect(sql).toContain("'referral-completed-90d-v1'");expect(sql.match(/interval '90 days'/g)?.length).toBeGreaterThanOrEqual(2);expect(sql).not.toMatch(/update public\.discount_coupons set expires_at/)});
  it('disables the old 24-hour path and keeps certification content unpublished',()=>{expect(sql).toContain('drop trigger if exists schedule_referral_reward_after_payment_trigger');expect(sql).toContain('content_published boolean not null default false');expect(sql).not.toContain("interval '24 hours'")});
});
