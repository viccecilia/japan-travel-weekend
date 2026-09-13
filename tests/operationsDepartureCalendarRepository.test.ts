import {readFileSync} from 'node:fs';
import {describe, expect, it, vi} from 'vitest';
import {SupabaseOperationsRepository} from '../src/shared/integrations/supabaseOperations';

describe('运营班次月历数据', () => {
  it('使用日本服务日期范围调用专用投影并映射实车容量', async () => {
    const rpc = vi.fn(async () => ({data: [{id: 'd', trip_id: 't', trip_title: '路线', departs_at: '2026-09-18T00:00:00Z', ends_at: '2026-09-18T10:00:00Z', seat_price_jpy: 7000, capacity: 45, sales_open_at: '2026-08-01T00:00:00Z', sales_close_at: '2026-09-17T00:00:00Z', booking_closes_at: '2026-09-17T00:00:00Z', status: 'open', schedule_version: 1, paid_passengers: 8, paid_orders: 3, dispatch_planning_status: 'planned', vehicles: [{sellableCapacity: 21, plannedPassengers: 8}]}], error: null}));
    const repository = new SupabaseOperationsRepository({rpc} as never);
    const result = await repository.listDepartureCalendar('2026-09-01', '2026-09-30');
    expect(rpc).toHaveBeenCalledWith('get_operations_departure_calendar', {p_from: '2026-09-01', p_to: '2026-09-30'});
    expect(result.data[0]).toMatchObject({paidPassengers: 8, paidOrders: 3, vehicles: [{sellableCapacity: 21, plannedPassengers: 8}]});
  });

  it('数据库投影只统计已付款未取消订单并由运营权限保护', () => {
    const sql = readFileSync('supabase/migrations/202609130131_operations_compact_departure_calendar.sql', 'utf8');
    expect(sql).toContain("o.status in('paid','confirmed')");
    expect(sql).toContain("public.is_operations()");
    expect(sql).toContain("at time zone 'Asia/Tokyo'");
    expect(sql).toContain('fv.sellable_capacity');
  });
});
