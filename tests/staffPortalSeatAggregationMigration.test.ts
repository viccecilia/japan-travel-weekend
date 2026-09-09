import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609090087_staff_portal_seat_aggregation.sql','utf8');
describe('司机端座位统计不受乘客明细联表放大',()=>{
  it('座位数使用独立订单聚合',()=>{expect(sql).toContain('select sum(o2.seat_count)');expect(sql).toContain('vgo2.vehicle_group_id=vg.id')});
  it('乘客与登车人数仍按乘客主键去重',()=>{expect(sql).toContain('count(distinct p.id)');expect(sql).toContain("pc.status='boarded'")});
});
