import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("车队座位口径",()=>{
  it("当前只自动启用10/14座，20座以上保持手动",()=>{
    const sql=readFileSync("supabase/migrations/202609070073_fleet_capacity_convention.sql","utf8");
    expect(sql).toContain("'vehicle-10','10座车（含司机，游客9席）',9");
    expect(sql).toContain("'vehicle-14','14座车（含司机，游客13席）',13");
    expect(sql).toContain("'vehicle-20-manual','20座以上车辆（手动派单）',19,60,false");
    expect(sql).toContain("'large-bus-manual','大巴车（手动派单）',44,100,false");
  });
});
