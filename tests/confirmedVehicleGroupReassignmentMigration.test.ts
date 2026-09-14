import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609140136_confirmed_vehicle_group_reassignment.sql','utf8');

it('已确认旅行团变更使用版本锁、原子更新、权限迁移和幂等重放',()=>{
  expect(sql).toContain('operations_request_vehicle_group_change');
  expect(sql).toContain('operations_apply_vehicle_group_change');
  expect(sql).toContain("v_group.operations_version<>v_change.expected_group_version");
  expect(sql).toContain("completed vehicle group cannot be changed");
  expect(sql).toContain("requested vehicle capacity is insufficient");
  expect(sql).toContain("requested vehicle has a time conflict");
  expect(sql).toContain("requested driver has a time conflict");
  expect(sql).toContain("if v_change.status='applied'");
  expect(sql).toContain("set revoked_at=now(),revoked_by=auth.uid()");
  expect(sql).toContain("on conflict(vehicle_group_id,staff_id) do update");
  expect(sql).not.toContain('delete from public.vehicle_group_orders');
  expect(sql).not.toContain('delete from public.trip_rooms');
});
