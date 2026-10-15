import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261015045120_operations_assign_group_guide.sql",
  "utf8",
);

describe("运营分配车组导游", () => {
  it("只允许运营给已审核且有效的导游账号分配车组", () => {
    expect(sql).toContain("if not public.is_operations()");
    expect(sql).toContain("role='guide'");
    expect(sql).toContain("status='available'");
    expect(sql).toContain("service_role in ('guide','driver_guide')");
  });

  it("恢复既有分配时清除撤销状态", () => {
    expect(sql).toContain("on conflict(vehicle_group_id,staff_id) do update");
    expect(sql).toContain("revoked_at=null");
  });

  it("不开放给公开或匿名角色", () => {
    expect(sql).toContain("from public,anon");
    expect(sql).toContain("to authenticated,service_role");
  });
});
