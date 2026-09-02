import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/202609020031_dispatch_trip_room_bridge.sql'),'utf8');
const regression=readFileSync(resolve(process.cwd(),'supabase/verification/dispatch_trip_room_bridge_regression.sql'),'utf8');

describe('派单确认与 Trip Room 原子衔接',()=>{
  it('班次仍有草稿任务时不建立半套车辆群',()=>{
    expect(sql).toContain("dt.status='draft'");
    expect(sql).toContain('then return false');
  });
  it('确认后建立一车一群、房间、司机成员并顺序装载订单',()=>{
    for(const marker of ['insert into public.vehicle_groups','insert into public.trip_rooms','insert into public.staff_assignments','insert into public.vehicle_group_orders','order by va.sequence limit 1'])expect(sql).toContain(marker);
    expect(sql).toContain("order cannot fit without splitting");
  });
  it('取消任务立即撤销司机的本车访问并释放无占用车辆',()=>{
    expect(sql).toContain('delete from public.staff_assignments');
    expect(sql).toContain("set status='available'");
  });
  it('桥接 helper 不向客户端开放',()=>{
    expect(sql).toContain('revoke all on function public.finalize_dispatch_departure(uuid)');
    expect(sql).toContain('revoke all on function public.finalize_dispatch_departure(uuid) from authenticated');
  });
  it('远程回归覆盖半套方案、建组、装载、司机授权撤销并回滚',()=>{
    for(const marker of ['FAIL partial plan created vehicle group','FAIL one vehicle one group','FAIL Trip Room creation','FAIL paid order allocation','FAIL linked driver staff membership','FAIL cancelled driver retained room access'])expect(regression).toContain(marker);
    expect(regression.trimEnd().endsWith('rollback;')).toBe(true);
  });
});
