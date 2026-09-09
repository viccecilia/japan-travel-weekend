import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609080081_referral_completion_rewards.sql','utf8');

describe('推荐奖励在实际出行后生效',()=>{
  it('新人券立即生效而直接推荐人奖励等待行程完成',()=>{
    expect(sql).toContain("'inviter',cfg.discount_percent,'pending_trip_completion'");
    expect(sql).toContain("'invitee',cfg.discount_percent,'active'");
    expect(sql).toContain('activate_completed_referral_rewards');
  });
  it('要求行程完成且至少一名订单乘客已上车',()=>{
    expect(sql).toContain("status='completed'");
    expect(sql).toContain("pc.status='boarded'");
    expect(sql).toContain("o.status in ('paid','confirmed')");
    expect(sql).toContain('activate_referral_rewards_after_journey_trigger');
  });
  it('退款取消会作废或冻结已经产生的推荐奖励',()=>{
    expect(sql).toContain("new.status in ('refunded','cancelled')");
    expect(sql).toContain("status='redeemed' then 'frozen'");
    expect(sql).toContain('qualifying_order_id=new.id');
  });
});
