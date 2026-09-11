import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609110126_staff_assignment_version_acknowledgement.sql", "utf8").toLowerCase();

describe("126 司导派班按版本确认", () => {
  it("确认记录绑定班次版本，改期后旧确认自动失效", () => {
    expect(sql).toContain("departure_schedule_version");
    expect(sql).toContain("ack.departure_schedule_version=d.schedule_version");
    expect(sql).toContain("then ack.acknowledged_at else null");
  });
  it("重复确认保持幂等，版本变化才刷新确认时间", () => {
    expect(sql).toContain("on conflict(staff_assignment_id) do update");
    expect(sql).toContain("is distinct from excluded.departure_schedule_version");
  });
  it("取消或撤销后的任务无法确认", () => {
    expect(sql).toContain("public.is_vehicle_group_executable(sa.vehicle_group_id)");
    expect(sql).toContain("assignment is not available for acknowledgement");
  });
});
