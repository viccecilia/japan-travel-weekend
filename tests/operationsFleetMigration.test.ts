import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202608270021_operations_fleet_dispatch.sql','utf8');
describe('021 运营车辆司机与派单模型',()=>{
  it('车辆、司机、资格、可用时间、派单和审计表均启用RLS',()=>{for(const table of ['vehicle_type_configs','fleet_vehicles','driver_resources','driver_vehicle_qualifications','driver_availability_windows','dispatch_tasks','dispatch_task_audit'])expect(sql).toContain(`alter table public.${table} enable row level security`)});
  it('所有浏览器写入由operations权限终审',()=>{expect(sql.match(/public\.is_operations\(\)/g)?.length).toBeGreaterThanOrEqual(9);expect(sql).toContain("raise exception 'operations only'")});
  it('司机创建同时保存车型资格与有效可用时间',()=>{expect(sql).toContain('insert into driver_vehicle_qualifications');expect(sql).toContain('insert into driver_availability_windows');expect(sql.indexOf('insert into driver_availability_windows')).toBeLessThan(sql.indexOf('return created_id;\nend$$;',sql.indexOf('operations_create_driver')))});
  it('柚子派单保留幂等、确认人和审计状态',()=>{expect(sql).toMatch(/idempotency_key text not null unique/);expect(sql).toContain('confirmed_by uuid');expect(sql).toContain('dispatch_task_audit')});
});
