import {readFileSync} from 'node:fs';import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609030042_due_fulfilment_notifications.sql','utf8');
describe('042 到期履约通知生成器',()=>{
  it('只为已付款订单生成 24 小时提醒且要求完整集合资料',()=>{expect(sql).toMatch(/o\.status in \('paid','confirmed'\)/);expect(sql).toMatch(/interval '24 hours'/);expect(sql).toMatch(/d\.meeting_name is not null/);expect(sql).toMatch(/d\.meeting_address is not null/)});
  it('开放房间与未签到提醒分别幂等生成',()=>{expect(sql).toMatch(/trip-room-opened:/);expect(sql).toMatch(/checkin-reminder:/);expect(sql).toMatch(/first_reminder_minutes_before/);expect((sql.match(/on conflict\(event_id\) do nothing/g)??[])).toHaveLength(3)});
  it('只允许可信服务运行并限制调度时间漂移',()=>{expect(sql).toMatch(/trusted service only/);expect(sql).toMatch(/interval '5 minutes'/);expect(sql).not.toMatch(/grant execute[\s\S]*to authenticated/)});
});
