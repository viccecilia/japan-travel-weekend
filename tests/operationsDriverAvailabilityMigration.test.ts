import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261015041830_operations_driver_availability_window.sql",
  "utf8",
);

describe("运营补录司导可用时间", () => {
  it("只允许运营身份调用并限制时间范围", () => {
    expect(sql).toContain("if not public.is_operations()");
    expect(sql).toContain("p_ends_at <= p_starts_at");
    expect(sql).toContain("interval '31 days'");
  });

  it("追加时间窗并保留审计", () => {
    expect(sql).toContain("insert into public.driver_availability_windows");
    expect(sql).toContain("'availability_window'");
    expect(sql).toContain("insert into public.account_audit_events");
  });

  it("撤销公开和匿名调用权限", () => {
    expect(sql).toContain("from public,anon");
    expect(sql).toContain("to authenticated,service_role");
  });
});
