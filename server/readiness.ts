import type { SupabaseClient } from "@supabase/supabase-js";

export type TestApiReadiness = {
  ok: boolean;
  mode: "test";
  checks: {
    database: boolean;
    stripeTestMode: boolean;
    webhookSecret: boolean;
    notificationReceiptSecret: boolean;
  };
};

export async function checkTestApiReadiness(
  client: Pick<SupabaseClient, "from"> | null,
  env: Partial<Record<"STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "NOTIFICATION_WEBHOOK_SECRET", string>>,
): Promise<TestApiReadiness> {
  let database: boolean;
  try {
    if (!client) throw new Error("database client unavailable");
    const { error } = await client.from("trip_attendance_config").select("singleton").limit(1);
    database = !error;
  } catch {
    database = false;
  }
  const stripeTestMode = env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") === true;
  const notificationReceiptSecret=(env.NOTIFICATION_WEBHOOK_SECRET?.length??0)>=32;
  const checks = { database, stripeTestMode, webhookSecret, notificationReceiptSecret };
  return { ok: Object.values(checks).every(Boolean), mode: "test", checks };
}
