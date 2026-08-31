import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202608310024_dispatch_confirmation_guard.sql','utf8');

describe('024 派单确认最终防线',()=>{
  it('确认状态前锁定司机和车辆并拒绝时间冲突',()=>{
    expect(sql).toContain('from public.driver_resources where id=new.driver_id for update');
    expect(sql).toContain("from public.fleet_vehicles where id=new.fleet_vehicle_id and status='available' for update");
    expect(sql).toContain("raise exception 'dispatch resource time conflict'");
  });
  it('任务时间必须围绕真实班次且不超过日游窗口',()=>{
    expect(sql).toContain("departure_time-interval '6 hours'");
    expect(sql).toContain("departure_time+interval '36 hours'");
    expect(sql).toContain("raise exception 'dispatch time outside departure window'");
  });
  it('触发器覆盖状态、车辆、司机与载荷变更且不可由浏览器调用',()=>{
    expect(sql).toContain('before insert or update of status,vehicle_assignment_id,driver_id,fleet_vehicle_id,payload');
    expect(sql).toContain('revoke all on function public.guard_dispatch_task_confirmation() from public,anon,authenticated');
  });
});
