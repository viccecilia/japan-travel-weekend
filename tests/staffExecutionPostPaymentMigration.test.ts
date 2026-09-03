import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202609030036_staff_execution_and_post_payment.sql",
  "utf8",
);

describe("工作人员执行与付款后履约桥接", () => {
  it("付款成功以幂等事件生成履约工作项和确认通知", () => {
    expect(sql).toContain("fulfilment_work_items");
    expect(sql).toContain("'paid_order_ready'");
    expect(sql).toContain("'order-confirmed'");
    expect(sql).toContain("on conflict(event_id) do nothing");
  });
  it("无有效库存的成功付款进入人工复核而不伪装确认", () => {
    expect(sql).toContain("payment_succeeded_without_valid_inventory");
    expect(sql).toContain("'payment_review'");
  });
  it("工作人员执行操作受分组权限、审计和幂等键保护", () => {
    expect(sql).toContain("record_staff_execution_event");
    expect(sql).toContain("public.is_group_staff(p_vehicle_group)");
    expect(sql).toContain("unique(actor_id,idempotency_key)");
    expect(sql).toContain("p_event_type='meeting_started'");
  });
});
