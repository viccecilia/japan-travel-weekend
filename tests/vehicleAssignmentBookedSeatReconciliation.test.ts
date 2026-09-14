import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609140135_vehicle_assignment_booked_seat_reconciliation.sql','utf8');

describe('每车已落实人数历史回填',()=>{
  it('以整单分车关系和有效订单席位为唯一来源',()=>{
    expect(sql).toContain('public.vehicle_group_orders');
    expect(sql).toContain("o.status in('paid','confirmed')");
    expect(sql).toContain('sum(o.seat_count)');
    expect(sql).toContain('set booked_seats=bookings.booked');
  });

  it('不删除订单、车辆群或审计历史',()=>{
    expect(sql).not.toMatch(/delete\s+from/i);
    expect(sql).not.toMatch(/truncate/i);
  });
});
