import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync(
  "supabase/migrations/202609030038_delay_and_attendance_summary.sql",
  "utf8",
);
describe("延误与签到汇总", () => {
  it("延误记录有范围、原因、幂等和审计", () => {
    expect(sql).toContain("delay_minutes integer");
    expect(sql).toContain("unique(reported_by,idempotency_key)");
    expect(sql).toContain("'delay_reported'");
  });
  it("群聊与每张已付款订单都进入必要通知队列", () => {
    expect(sql).toContain("'traffic_delay'");
    expect(sql).toContain("'departure-delayed'");
    expect(sql).toContain("o.status in ('paid','confirmed')");
    expect(sql).toContain("on conflict(event_id) do nothing");
  });
  it("签到汇总不返回乘客身份或联系方式", () => {
    const summary = sql.slice(
      sql.indexOf("get_vehicle_group_attendance_summary"),
    );
    expect(summary).toContain("all_present boolean");
    expect(summary).not.toMatch(/passenger_label|phone|email|contact_name/);
  });
});
