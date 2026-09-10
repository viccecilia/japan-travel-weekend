import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609100114_departure_reschedule.sql','utf8');
const ui=readFileSync('src/app/operations/DepartureCenter.tsx','utf8');
describe('已有班次安全改期',()=>{
 it('使用版本锁、容量下限和完整时间地点校验',()=>{expect(sql).toContain('item.schedule_version<>p_expected_version');expect(sql).toContain('p_capacity<committed');expect(sql).toContain('p_ends_at<=p_departs_at');expect(sql).toContain("p_map_lat not between -90 and 90")});
 it('记录前后值且不更新订单快照',()=>{expect(sql).toContain('departure_change_audit');expect(sql).not.toMatch(/update public\.order_snapshots/);expect(sql).toContain("'contractSnapshotUnchanged',true")});
 it('运营保存前展示真实已付款影响',()=>{expect(ui).toContain('影响预览：当前已有');expect(ui).toContain('旧订单价格、路线与取消政策快照不会改变');expect(ui).toContain('window.confirm')});
});
