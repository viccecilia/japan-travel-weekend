import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261012145500_refund_commission_recovery_convergence.sql",
  "utf8",
);
const verification = readFileSync(
  "supabase/verification/v7_financial_convergence_regression.sql",
  "utf8",
);

describe("refund commission recovery convergence", () => {
  it("moves withdrawal-pending and paid commission into audited recovery before lifecycle refresh", () => {
    expect(migration).toContain("status in ('withdrawal_pending','locked','paid') then 'recovery_due'");
    expect(migration).toContain("a_reverse_cash_commission_after_refund_trigger");
    expect(migration).toContain("source_order_cancelled_or_final_refunded");
  });

  it("runs the regression through a completed, boarded public trip", () => {
    expect(verification).toContain("public.passenger_checkins");
    expect(verification).toContain("public.vehicle_group_journey_state");
    expect(verification).toContain("public.refresh_referral_lifecycle_for_order");
    expect(verification).toContain("capacity,planned_passengers");
    expect(verification).toContain("'withdrawal_pending'");
    expect(verification).toContain("'recovery_due'");
  });
});
