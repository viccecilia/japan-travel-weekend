import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const financial = readFileSync("supabase/migrations/202609110119_v7_financial_convergence.sql", "utf8");
const staff = readFileSync("supabase/migrations/202609110120_v7_staff_portal_and_ambassador.sql", "utf8");

describe("V7 financial convergence migration contract", () => {
  it("records approved eligibility instead of deriving it from role or coupon count", () => {
    expect(financial).toContain("ambassador_qualifications");
    expect(staff).toContain("operations_review_ambassador");
    expect(staff).toContain("sync_staff_ambassador_qualification");
  });

  it("creates pending commission at payment and unlocks it only on completion", () => {
    expect(financial).toContain("create_pending_commission_after_payment_trigger");
    expect(financial).toContain("status='pending'");
    expect(financial).toContain("status='available'");
    expect(financial).toContain("commission_basis_for_order");
  });

  it("does not reject a refund because a commission is locked or paid", () => {
    expect(financial).not.toContain("commission already included in payout");
    expect(financial).toContain("'recovery_due'");
    expect(financial).toContain("recompute_order_refund_total_trigger");
    expect(financial).toContain("suppress_duplicate_refund_notification_trigger");
  });

  it("keeps the newcomer coupon but removes the new inviter coupon", () => {
    const registration = financial.slice(financial.indexOf("create or replace function public.apply_referral_registration"));
    expect(registration).toContain("values(p_invitee");
    expect(registration).not.toContain("values(inviter,relation,'inviter'");
    expect(registration).toContain("cash-referral-v2");
  });
});
