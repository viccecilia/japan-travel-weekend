import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("V7 controlled departure cancellation", () => {
  const sql = readFileSync("supabase/migrations/202609110121_v7_controlled_departure_cancellation.sql", "utf8");
  const ui = readFileSync("src/app/operations/DepartureCenter.tsx", "utf8");

  it("blocks the generic cancellation path and creates refund review work", () => {
    expect(sql).toContain("use controlled departure cancellation");
    expect(sql).toContain("operations_cancel_departure");
    expect(sql).toContain("order_cancellation_requests");
    expect(sql).toContain("departure-cancelled");
  });

  it("exposes cancellation as a separate confirmed operation", () => {
    expect(ui).toContain("受控取消班次");
    expect(ui).toContain("cancelDeparture");
    expect(ui).not.toContain('["draft", "open", "closed", "cancelled"]');
  });
});
