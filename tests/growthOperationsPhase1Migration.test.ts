import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260926043656_growth_operations_phase1.sql",
  "utf8",
);

describe("Growth Operations V1 / Phase 1 migration contract", () => {
  it("extends existing referral rows with a permanent, cycle-safe source tree", () => {
    expect(sql).toContain("create table if not exists public.referral_sources");
    expect(sql).toContain("parent_source_id uuid references public.referral_sources");
    expect(sql).toContain("root_source_id uuid references public.referral_sources");
    expect(sql).toContain("referral parent is permanent");
    expect(sql).toContain("referral cycle is not allowed");
    expect(sql).toContain("self referral is not allowed");
    expect(sql).toContain("get_referral_descendants");
  });

  it("records the referral funnel instead of treating registration as success", () => {
    expect(sql).toContain("create table if not exists public.referral_lifecycles");
    for (const status of [
      "registered",
      "first_order_created",
      "first_payment_completed",
      "first_trip_completed",
      "valid_referral",
      "cancelled",
      "refunded",
      "invalid",
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toContain("pc.status='boarded'");
    expect(sql).toContain("coalesce(d.sales_scope,'public')='public'");
    expect(sql).toContain("coalesce(t.publication_scope,'public')='public'");
  });

  it("automatically unlocks only after ten valid direct referrals and preserves company grants", () => {
    expect(sql).toContain("v_valid_count>=10");
    expect(sql).toContain("'auto_unlocked'");
    expect(sql).toContain("'company_granted'");
    expect(sql).toContain("grant_company_ambassador");
    expect(sql).toContain("grant_company_referral_source");
    expect(sql).toContain("sync_staff_ambassador_qualification");
    expect(sql).toContain("perform public.ensure_referral_code(new.account_id)");
    expect(sql).toContain("qualification_achieved_at");
    expect(sql).toContain("revoked_reason");
    expect(sql).not.toContain("when public.ambassador_qualifications.source='auto_unlocked' then 'pending'");
  });

  it("keeps cash in the existing cash ledger and coupons separately traceable", () => {
    expect(sql).toContain("alter table public.cash_commission_entries");
    expect(sql).toContain("referred_account_id");
    expect(sql).toContain("eligible_amount_jpy");
    expect(sql).toContain("source_trip_id");
    expect(sql).toContain("source_event_id");
    expect(sql).toContain("face_value_jpy");
    expect(sql).toContain("remaining_value_jpy");
    expect(sql).toContain("issue_travel_reward_coupon");
    expect(sql).toContain("'travel_moment'");
  });

  it("enforces the monthly 10000 JPY withdrawal rule with idempotency", () => {
    expect(sql).toContain("commission_payout_one_per_natural_month");
    expect(sql).toContain("one payout request per natural month");
    expect(sql).toContain("minimum payout is 10000 JPY");
    expect(sql).toContain("status='carried_over'");
    expect(sql).toContain("status='withdrawal_pending'");
    expect(sql).toContain("idempotency_key=p_idempotency_key");
  });

  it("keeps duplicate payment and completion callbacks idempotent and invalidates refunded rewards", () => {
    expect(sql).toContain("on conflict(source_order_id) do nothing");
    expect(sql).toContain("source_order_cancelled_or_final_refunded");
    expect(sql).toContain("status='invalid'");
    expect(sql).toContain("create_pending_commission_after_payment");
    expect(sql).toContain("settle_cash_commissions_for_completed_group");
  });
});
