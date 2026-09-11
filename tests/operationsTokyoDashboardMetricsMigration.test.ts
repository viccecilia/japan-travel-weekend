import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202609110125_operations_tokyo_dashboard_metrics.sql",
  "utf8",
);

describe("125 运营工作台日本日期统计", () => {
  it("按服务日期查询完整班次，不再由历史前 30 条截断", () => {
    expect(sql).toContain("at time zone 'Asia/Tokyo'");
    expect(sql).toContain("between p_from and p_to");
    expect(sql).not.toMatch(/limit\s+30/i);
  });

  it("付款指标按成功支付事件发生日计算且保持运营权限", () => {
    expect(sql).toContain("pe.status='succeeded'");
    expect(sql).toContain("pe.event_created_at at time zone 'Asia/Tokyo'");
    expect(sql).toContain("where public.is_operations()");
    expect(sql).toContain("revoke all on function public.get_operations_payment_metrics(date)");
  });

  it("提供数据库迁移版本供前端和 API 构建版本交叉核对", () => {
    expect(sql).toContain("get_operations_system_release_info");
    expect(sql).toContain("'202609110125'");
  });
});
