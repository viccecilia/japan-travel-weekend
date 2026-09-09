import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202609080076_initial_staff_and_vehicle_registry.sql",
  "utf8",
);

describe("初始司导和车辆档案", () => {
  it("录入六名司导且私人电话不复用为游客公开电话", () => {
    for (const code of ["12225", "12232", "12266", "12257", "12256", "12293"])
      expect(sql).toContain(`'${code}'`);
    expect(sql).toContain("private_phone");
    expect(sql).not.toContain("public_phone,languages");
  });

  it("录入六辆车辆并将待车检车辆设为维修状态", () => {
    for (const registration of ["7707", "7577", "7286", "7312", "7621", "7634"])
      expect(sql).toContain(registration);
    expect(sql).toContain("'maintenance'");
    expect(sql).toContain("inspection_required");
  });

  it("座位数未确认前不允许加入自动派单", () => {
    expect(sql).toContain("'unclassified-manual'");
    expect(sql).toContain("999,false");
    expect(sql).toContain("'inactive'");
  });
});
