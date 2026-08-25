import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202608250011_fulfilment_allocation.sql','utf8');
describe('011 履约迁移静态审计',()=>{
  it('顺序生成车辆、一车一群和房间，并拒绝容量不足与重复计划',()=>{expect(sql).toMatch(/allocate_departure_sequential/);expect(sql).toMatch(/order by va\.sequence/);expect(sql).toMatch(/allocation already exists/);expect(sql).toMatch(/insufficient configured vehicle capacity/);expect(sql).toMatch(/insert into public\.vehicle_groups/);expect(sql).toMatch(/insert into public\.trip_rooms/)});
  it('保持整张订单同车，不能静默拆分同行人',()=>expect(sql).toMatch(/order cannot fit without splitting/));
  it('位置共享只允许本车乘客主动开启 15 或 30 分钟并可停止',()=>{expect(sql).toMatch(/p_minutes not in \(15,30\)/);expect(sql).toMatch(/not a vehicle group passenger/);expect(sql).toMatch(/stop_own_location_share/)});
  it('配车函数仅 service role 可执行，房间读取由认证角色加 RLS 成员条件保护',()=>{expect(sql).toMatch(/grant execute on function public\.allocate_departure_sequential[\s\S]*to service_role/);expect(sql).toMatch(/public\.is_group_staff/);expect(sql).toMatch(/own_o\.account_id=auth\.uid\(\)/)});
});
