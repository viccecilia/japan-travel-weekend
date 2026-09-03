import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609030037_dynamic_meeting_state.sql','utf8');

describe('动态集合点真实数据层',()=>{
  it('每个车组只有一个带版本的当前集合点',()=>{
    expect(sql).toContain('vehicle_group_id uuid primary key');
    expect(sql).toContain('revision integer not null default 1');
    expect(sql).toContain('changed_reason text');
  });
  it('变更同时更新坐标、生成重大群聊通知并支持游客确认',()=>{
    expect(sql).toContain('update_vehicle_group_meeting');
    expect(sql).toContain("'meeting_changed'");
    expect(sql).toContain('meeting_change_acknowledgements');
    expect(sql).toContain('acknowledge_vehicle_group_meeting');
  });
  it('发起集合前必须已有确认集合点并切换为 active',()=>{
    expect(sql).toContain("set status='active'");
    expect(sql).toContain('meeting point must be confirmed first');
    expect(sql).toContain("'vehicle_arrived'");
  });
  it('乘客只能读取本人已付款订单所属车组',()=>{
    expect(sql).toMatch(/o\.account_id=auth\.uid\(\).*o\.status in \('paid','confirmed'\)/s);
    expect(sql).toContain('public.is_group_staff(m.vehicle_group_id)');
  });
});
