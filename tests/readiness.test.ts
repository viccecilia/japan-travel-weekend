import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkTestApiReadiness } from "../server/readiness";

const client = (error: unknown = null) => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({ limit: vi.fn(async () => ({ error })) })),
  })),
}) as unknown as Pick<SupabaseClient, "from">;

describe("测试 API 就绪探针", () => {
  it("数据库与 Stripe 测试配置全部正常才 ready", async () => {
    const supabase = client();
    await expect(checkTestApiReadiness(supabase, {
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      NOTIFICATION_WEBHOOK_SECRET: "test-notification-secret-at-least-32-characters",
    })).resolves.toEqual({
      ok: true,
      mode: "test",
      checks: { database: true, stripeModeSafe: true, webhookSecret: true, notificationReceiptSecret: true },
    });
    expect(supabase.from).toHaveBeenCalledWith("trip_attendance_config");
  });

  it("数据库失败或 live key 均 fail closed 且不泄露配置值", async () => {
    const result = await checkTestApiReadiness(client(new Error("offline")), {
      STRIPE_SECRET_KEY: "sk_live_forbidden",
      STRIPE_WEBHOOK_SECRET: "",
    });
    expect(result.ok).toBe(false);
    expect(result.checks).toEqual({ database: false, stripeModeSafe: false, webhookSecret: false, notificationReceiptSecret: false });
    expect(JSON.stringify(result)).not.toContain("sk_live_forbidden");
  });
  it('正式密钥必须同时具备明确生产付款授权',async()=>{
    const base={STRIPE_SECRET_KEY:'sk_live_example',STRIPE_WEBHOOK_SECRET:'whsec_example',NOTIFICATION_WEBHOOK_SECRET:'notification-secret-at-least-32-characters',JTW_STRIPE_MODE:'live'};
    expect((await checkTestApiReadiness(client(),base)).checks.stripeModeSafe).toBe(false);
    expect((await checkTestApiReadiness(client(),{...base,JTW_PRODUCTION_PAYMENT_AUTHORIZED:'true'})).checks.stripeModeSafe).toBe(true);
  });

  it("Supabase 客户端未创建时明确不就绪", async () => {
    const result = await checkTestApiReadiness(null, {
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      NOTIFICATION_WEBHOOK_SECRET: "test-notification-secret-at-least-32-characters",
    });
    expect(result.ok).toBe(false);
    expect(result.checks.database).toBe(false);
  });
});
