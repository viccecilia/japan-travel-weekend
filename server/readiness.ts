import type { SupabaseClient } from "@supabase/supabase-js";

export type ApiReadiness = {
  ok: boolean;
  mode: "test"|"live";
  checks: {
    database: boolean;
    stripeModeSafe: boolean;
    webhookSecret: boolean;
    notificationReceiptSecret: boolean;
  };
};

export async function checkApiReadiness(
  client: Pick<SupabaseClient, "from"> | null,
  env: Partial<Record<"STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "NOTIFICATION_WEBHOOK_SECRET"|"JTW_STRIPE_MODE"|"JTW_PRODUCTION_PAYMENT_AUTHORIZED", string>>,
): Promise<ApiReadiness> {
  let database: boolean;
  try {
    if (!client) throw new Error("database client unavailable");
    const { error } = await client.from("trip_attendance_config").select("singleton").limit(1);
    database = !error;
  } catch {
    database = false;
  }
  const mode=env.JTW_STRIPE_MODE==='live'?'live':'test';
  const stripeModeSafe = mode==='test'
    ? env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true
    : env.JTW_PRODUCTION_PAYMENT_AUTHORIZED==='true'&&env.STRIPE_SECRET_KEY?.startsWith('sk_live_')===true;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") === true;
  const notificationReceiptSecret=(env.NOTIFICATION_WEBHOOK_SECRET?.length??0)>=32;
  const checks = { database, stripeModeSafe, webhookSecret, notificationReceiptSecret };
  return { ok: Object.values(checks).every(Boolean), mode, checks };
}

export const checkTestApiReadiness=checkApiReadiness;
