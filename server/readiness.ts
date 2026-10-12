import type { SupabaseClient } from "@supabase/supabase-js";
import {resolvePaymentConfig,type PaymentEnvironment} from './paymentConfig.js';

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
  env: PaymentEnvironment&Partial<Record<"NOTIFICATION_WEBHOOK_SECRET", string>>,
): Promise<ApiReadiness> {
  let database: boolean;
  try {
    if (!client) throw new Error("database client unavailable");
    const { error } = await client.from("trip_attendance_config").select("singleton").limit(1);
    database = !error;
  } catch {
    database = false;
  }
  const payment=resolvePaymentConfig(env);
  const mode=payment.effectiveMode;
  const stripeModeSafe = payment.modeSafe&&payment.secretKeySafe;
  const webhookSecret = payment.webhookSecretSafe;
  const notificationReceiptSecret=(env.NOTIFICATION_WEBHOOK_SECRET?.length??0)>=32;
  const checks = { database, stripeModeSafe, webhookSecret, notificationReceiptSecret };
  return { ok: Object.values(checks).every(Boolean), mode, checks };
}

export const checkTestApiReadiness=checkApiReadiness;
