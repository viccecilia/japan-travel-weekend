import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202609140132_dispatch_plan_consistency.sql",
  "utf8",
);

describe("UI-C-R1 配车与运行数据一致性迁移", () => {
  it("只修正计划人数超过已付款承诺的旧班次，并按本车真实订单恢复人数", () => {
    expect(sql).toContain("total.planned>total.committed");
    expect(sql).toContain("o.status in ('paid','confirmed')");
    expect(sql).toContain("planned_passengers=least(va.capacity,bookings.booked)");
    expect(sql).toContain("join public.vehicle_group_orders");
  });

  it("保留历史但不把服务日前的旧履约状态显示为当前完成状态", () => {
    expect(sql).toContain("then 'data_inconsistent'");
    expect(sql).toContain("at time zone 'Asia/Tokyo'");
    expect(sql).toContain("else js.current_stop_name");
  });
});
