import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const migration=readFileSync('supabase/migrations/20261016123000_meeting_revision_passenger_arrival.sql','utf8');
const staffChat=readFileSync('src/app/StaffChat.tsx','utf8');

describe('集合版本化游客报到权限',()=>{
  it('沿用正式签到RPC并校验账号、订单、车组、集合版本和开放状态',()=>{for(const value of ['set_own_passenger_checkin','o.account_id=auth.uid()','o.status in (\'paid\',\'confirmed\')','vgo.vehicle_group_id=p_vehicle_group','v_meeting.status<>\'active\'','v_meeting.revision<>p_meeting_revision','r.status=\'open\''])expect(migration).toContain(value)});
  it('取消任务边界、RLS能力和游客／工作人员均不能让已登车降级',()=>{expect(migration).toContain('public.is_vehicle_group_executable(v_group)');expect(migration.match(/v_checkin\.status='boarded'/g)).toHaveLength(2);expect(migration).toContain('set_staff_passenger_checkin');expect(migration).not.toMatch(/disable row level security/i)});
  it('游客到达和正式登车仍为不同事实，集合版本写入事件并使用幂等键',()=>{const own=migration.slice(migration.indexOf('create function public.set_own_passenger_checkin'),migration.indexOf('create or replace function public.set_staff_passenger_checkin'));expect(own).toContain('meeting_revision');expect(own).toContain('p_idempotency_key');expect(own).not.toMatch(/insert into public\.boardings/i)});
  it('名单读取继续限制为本人订单或本车工作人员',()=>{expect(migration).toContain('o.account_id=auth.uid() or public.is_operations() or public.is_group_staff(p_vehicle_group)')});
  it('工作人员端读取同一份出勤数据，但不渲染游客快捷报到入口',()=>{expect(staffChat).toContain('loadAttendance(task.vehicle_group_id)');expect(staffChat).not.toContain('MeetingArrivalNotice');expect(staffChat).not.toContain('我已到达')});
});
