import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('班次截单、配车交接与工作人员同步迁移',()=>{
  const sql=readFileSync('supabase/migrations/202609040056_departure_cutoff_and_dispatch_handoff.sql','utf8');
  it('保存提前24小时截单与日本时间前一天中午开放规则',()=>{
    expect(sql).toContain("departs_at-interval '24 hours'");
    expect(sql).toContain("time '12:00'");
    expect(sql).toContain("at time zone 'Asia/Tokyo'");
    expect(sql).toContain('departures_lifecycle_defaults');
  });
  it('截止后关闭销售并区分自动规划与低人数人工介入',()=>{
    expect(sql).toContain('process_due_departure_cutoffs');
    expect(sql).toContain("set status='closed'");
    expect(sql).toContain("seats<4 then 'needs_manual_review'");
    expect(sql).toContain("'automaticCancellation',false");
  });
  it('低人数告警可发送报警邮箱且不会暴露给乘客',()=>{
    expect(sql).toContain('departure_operations_alerts');
    expect(sql).toContain('email_alerted_at');
    expect(sql).toContain('departure_alerts_operations_read');
    expect(sql).toContain('mark_departure_alert_emailed');
  });
  it('确认司机后按设定时间建立房间并同步工作人员任务',()=>{
    expect(sql).toContain('coalesce(d.chat_opens_at');
    expect(sql).toContain('insert into public.staff_assignments');
    expect(sql).toContain('get_staff_portal_tasks');
    expect(sql).toContain("dispatch_planning_status='confirmed'");
  });
  it('定时任务到点开启冻结的群聊房间',()=>{
    expect(sql).toContain("update public.trip_rooms set status='open'");
    expect(sql).toContain("status='frozen'");
    expect(sql).toContain('opens_at<=p_now');
  });
});
