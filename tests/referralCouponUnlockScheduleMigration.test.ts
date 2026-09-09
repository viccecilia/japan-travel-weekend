import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609080084_referral_coupon_unlock_schedule.sql','utf8');

describe('推荐券解锁时间与取消规则',()=>{
  it('付款后记录被推荐人开团及预计结束时间，但仍保持等待状态',()=>{
    expect(sql).toContain('schedule_referral_reward_after_payment');
    expect(sql).toContain('qualifying_trip_starts_at=d.departs_at');
    expect(sql).toContain('available_at=d.ends_at');
    expect(sql).toContain("c.status='pending_trip_completion'");
  });
  it('必须实际结束且超过预计结束时间后才激活',()=>{
    expect(sql).toContain("js.status='completed'");
    expect(sql).toContain('js.completed_at is not null');
    expect(sql).toContain('now()>=d.ends_at');
    expect(sql).toContain("pc.status='boarded'");
  });
  it('开团前取消或退款会把等待中的推荐券直接作废',()=>{
    expect(sql).toContain("status in ('pending_trip_completion','active','reserved','redeemed')");
    expect(sql).toContain("status='redeemed' then 'frozen' else 'void'");
  });
  it('作废及冻结奖励不计入推广等级',()=>{
    expect(sql).toContain("c.status in ('active','reserved','redeemed')");
    expect(sql).not.toContain("'redeemed','frozen'");
  });
});
