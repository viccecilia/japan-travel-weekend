import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync("src/router/Router.tsx", "utf8");
const layout = readFileSync("src/app/operations/OperationsLayout.tsx", "utf8");
const departures = readFileSync("src/app/operations/DepartureCenter.tsx", "utf8");
const run = readFileSync("src/app/operations/RunCenter.tsx", "utf8");

describe("运营后台专属导航和筛选", () => {
  it("五个业务模块均由运营权限与统一布局承载", () => {
    for (const path of ["products", "departures", "run", "commissions", "marketing"]) {
      expect(router).toContain(`path="/app/operations/${path}"`);
    }
    expect(router).toContain("<RequireOperations><OperationsLayout>");
    expect(router).toContain('path="/app/operations/*"');
  });

  it("游客端仅作为新标签预览，不参与后台业务导航", () => {
    expect(layout).toContain('target="_blank"');
    expect(layout).toContain("预览游客端");
    expect(layout).not.toContain("返回乘客应用");
  });

  it("班次和运行页面将 URL 日期实际传入查询", () => {
    expect(departures).toContain("searchParams.get('date')");
    expect(departures).toContain("listDepartureCalendar(calendarWindow.from,calendarWindow.to)");
    expect(run).toMatch(/searchParams\.get\(["']date["']\)/);
    expect(run).toContain("loadRunBoard(date)");
  });
});
