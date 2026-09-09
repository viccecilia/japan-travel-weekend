import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609080083_referral_achievement_progress.sql','utf8');

describe('推荐成就按已完成行程计算',()=>{
  it('区分注册、进行中和已完成推荐',()=>{
    for(const field of ['successfulInvites','completedInvites','pendingInvites'])expect(sql).toContain(`'${field}'`);
    expect(sql).toContain('qualifying_order_id is not null');
  });
  it('返回1、3、10和100人的等级里程碑',()=>{
    for(const level of ['travel_sharer','rising_promoter','ambassador_candidate','gold_ambassador'])expect(sql).toContain(level);
    expect(sql).toContain("completed_count<10 then 10");
  });
});
