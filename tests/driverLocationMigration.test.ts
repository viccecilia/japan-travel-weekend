import {describe,expect,it} from 'vitest';import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/202608250017_driver_live_location.sql','utf8');
describe('017 司机实时位置生命周期',()=>{
  it('坐标范围、精度和最长共享时间均受数据库约束',()=>{expect(sql).toMatch(/latitude between -90 and 90/);expect(sql).toMatch(/longitude between -180 and 180/);expect(sql).toMatch(/accuracy_meters between 0 and 1000/);expect(sql).toMatch(/p_minutes not between 5 and 30/)});
  it('只有本车司机或司导能在开放房间发布',()=>{expect(sql).toMatch(/sa\.role in \('driver','guide'\)/);expect(sql).toMatch(/r\.status='open'/);expect(sql).toMatch(/assigned open-room staff only/)});
  it('乘客只能经车辆群权限函数读取仍有效的位置',()=>{expect(sql).toMatch(/can_receive_vehicle_group\(p_vehicle_group\)/);expect(sql).toMatch(/d\.expires_at>now\(\)/);expect(sql).toMatch(/d\.stopped_at is null/);expect(sql).toMatch(/revoke all on public\.driver_location_sessions from public,anon,authenticated/)});
});
