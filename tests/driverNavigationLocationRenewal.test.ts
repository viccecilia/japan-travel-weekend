import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202609100112_driver_navigation_and_location_renewal.sql",
  "utf8",
);
const portal = readFileSync("src/app/StaffPortal.tsx", "utf8");
const integration = readFileSync(
  "src/shared/integrations/supabaseProduction.ts",
  "utf8",
);

describe("司导导航与定位会话续期", () => {
  it("仅允许已分配工作人员建立短期定位会话，并撤销旧发布接口", () => {
    expect(migration).toContain("public.is_group_staff(p_vehicle_group)");
    expect(migration).toContain("p_minutes not between 15 and 30");
    expect(migration).toMatch(
      /revoke all on function[\s\S]*public\.publish_driver_location[\s\S]*from public,anon,authenticated/,
    );
    expect(integration).toContain("start_driver_location_session_v2");
  });

  it("在过期前续期，连续失败时停止采集", () => {
    expect(portal).toContain("getTime()-Date.now()<2*60_000");
    expect(portal).toContain("locationFailures.current>=2");
    expect(portal).toContain("采集已安全停止");
  });

  it("为集合点和线路节点提供真实 Google Maps 导航链接", () => {
    expect(portal).toContain("导航到今日集合点");
    expect(portal).toContain("导航到此站");
    expect((portal.match(/https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
