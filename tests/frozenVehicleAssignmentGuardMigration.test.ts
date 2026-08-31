import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202608310026_frozen_vehicle_assignment_guard.sql','utf8');
describe('026 冻结车辆分配保护',()=>{
  it('已有Vehicle Group时禁止改变车型或容量',()=>{expect(sql).toContain('old.vehicle_type is distinct from new.vehicle_type');expect(sql).toContain('old.capacity is distinct from new.capacity');expect(sql).toContain('exists(select 1 from public.vehicle_groups');expect(sql).toContain("raise exception 'frozen vehicle assignment cannot be changed'")});
  it('保护函数不能由浏览器直接调用',()=>{expect(sql).toContain('revoke all on function public.guard_frozen_vehicle_assignment() from public,anon,authenticated')});
});
