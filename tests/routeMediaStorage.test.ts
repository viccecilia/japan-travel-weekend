import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SupabaseOperationsRepository } from "../src/shared/integrations/supabaseOperations";
import { persistedItinerary } from "../src/app/operations/productDraft";

const sql = readFileSync("supabase/migrations/202609100117_route_media_storage.sql", "utf8");
describe("路线图片和景点维护", () => {
  it("图片桶公开读取且只有运营账号能写入", () => {
    expect(sql).toContain("'route-media'");
    expect(sql).toContain("10485760");
    expect(sql).toContain("image/webp");
    expect(sql).toMatch(/for select to public/);
    expect((sql.match(/public\.is_operations\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("运营端执行真实存储上传并限制格式和大小", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const bucket = { upload, getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://media.test/image.webp" } }) };
    const client = { storage: { from: vi.fn().mockReturnValue(bucket) } };
    const operations = new SupabaseOperationsRepository(client as never);
    const valid = new File(["image"], "cover.webp", { type: "image/webp" });
    await expect(operations.uploadProductImage("trip-1", valid)).resolves.toMatchObject({ url: "https://media.test/image.webp", error: null });
    expect(client.storage.from).toHaveBeenCalledWith("route-media");
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^trip-1\/.+\.webp$/), valid, { contentType: "image/webp", upsert: false });
    const invalid = new File(["video"], "clip.mp4", { type: "video/mp4" });
    await expect(operations.uploadProductImage("trip-1", invalid)).resolves.toMatchObject({ url: null, error: expect.stringContaining("JPG") });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("景点保存移除编辑器临时标识并保留业务扩展字段", () => {
    const result = persistedItinerary([{editorId: "editor-only", id: "stop-1", title: "清水寺", gallery: ["/images/one.webp"], customRule: {meeting: true}}]);
    expect(result).toEqual([{id: "stop-1", title: "清水寺", gallery: ["/images/one.webp"], customRule: {meeting: true}}]);
    expect(result[0]).not.toHaveProperty("editorId");
  });
});
