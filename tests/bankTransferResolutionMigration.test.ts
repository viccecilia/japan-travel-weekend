import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bank transfer resolution migration", () => {
  const sql = readFileSync("supabase/migrations/202609030052_bank_transfer_resolution.sql", "utf8");
  it("requires operations access and records an idempotent audit decision", () => {
    expect(sql).toContain("if not public.is_operations()");
    expect(sql).toContain("unique(actor_id,idempotency_key)");
    expect(sql).toContain("idempotency parameter mismatch");
    expect(sql).toContain("manual_payment_decisions_operations_select");
  });
  it("confirms only a live hold and routes invalid inventory to review", () => {
    expect(sql).toContain("v_hold.status='held' and v_hold.expires_at>now()");
    expect(sql).toContain("manual_transfer_without_valid_inventory");
    expect(sql).toContain("'paid_order_ready','pending'");
    expect(sql).toContain("'payment_review','pending'");
  });
  it("rejection cancels the order and releases its held seats", () => {
    expect(sql).toContain("set status='cancelled'");
    expect(sql).toContain("set status='released'");
  });
});
