import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync(
  "supabase/migrations/202609030039_late_paid_order_allocation.sql",
  "utf8",
);
describe("派车后新增付款订单自动入组", () => {
  it("只处理已付款或已确认订单且保证一单一车", () => {
    expect(sql).toContain("v_order.status not in ('paid','confirmed')");
    expect(sql).toContain("on conflict(order_id) do nothing");
  });
  it("仅选择有房间且剩余容量足够的车辆组", () => {
    expect(sql).toContain("tr.status in ('frozen','open')");
    expect(sql).toMatch(/va\.capacity-coalesce[\s\S]*>=v_order\.seat_count/);
  });
  it("容量不足时保持待履约并允许运营安全重试", () => {
    expect(sql).toContain("if v_group is null then return false");
    expect(sql).toContain("operations_retry_paid_fulfilment");
    expect(sql).toContain("kind='paid_order_ready'");
  });
  it("付款成功工作项写入时由数据库触发自动分配", () => {
    expect(sql).toContain("before insert on public.fulfilment_work_items");
    expect(sql).toContain("public.try_allocate_paid_order(new.order_id)");
    expect(sql).toContain("new.status:='completed'");
  });
});
