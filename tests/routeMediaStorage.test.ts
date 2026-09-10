import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609100117_route_media_storage.sql", "utf8");
const ui = readFileSync("src/app/operations/ProductCenter.tsx", "utf8");
const repository = readFileSync("src/shared/integrations/supabaseOperations.ts", "utf8");

describe("路线图片和景点维护", () => {
  it("图片桶公开读取且只有运营账号能写入", () => {
    expect(sql).toContain("'route-media'");
    expect(sql).toContain("10485760");
    expect(sql).toContain("image/webp");
    expect(sql).toMatch(/for select to public/);
    expect((sql.match(/public\.is_operations\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("运营端执行真实存储上传并限制格式和大小", () => {
    expect(repository).toContain('from("route-media").upload');
    expect(repository).toContain("10 * 1024 * 1024");
    expect(ui).toContain('name="heroFile"');
    expect(ui).toContain('name="galleryFiles"');
  });

  it("景点支持增删和排序且保留扩展字段", () => {
    for (const label of ["添加景点", "上移", "下移", "删除", "景点介绍", "图片 URL"]) expect(ui).toContain(label);
    expect(ui).toContain("...item");
    expect(ui).toContain('name="itinerary"');
  });
});
