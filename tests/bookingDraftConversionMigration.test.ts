import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
describe('booking draft to inventory order conversion',()=>{
  const sql=readFileSync('supabase/migrations/202609030046_booking_draft_order_conversion.sql','utf8');
  it('locks and validates the owned accepted unexpired draft before inventory reservation',()=>{for(const marker of ['account_id=p_account for update','accepted_cancellation','accepted_terms','expires_at<=now()',"operational_review_status='unavailable'",'v_draft.departure_id<>p_departure','v_draft.seat_impact<>p_seats','reserve_inventory(v_draft.departure_id,p_account,v_draft.seat_impact'])expect(sql).toContain(marker)});
  it('links one draft to one order and rejects changed idempotency',()=>{expect(sql).toContain('converted_order_id uuid unique');expect(sql).toContain('draft conversion idempotency mismatch');expect(sql).toContain("status='converted'")});
  it('is service-role only',()=>{expect(sql).toContain("current_user not in ('service_role','postgres')");expect(sql).toContain('to service_role');expect(sql).not.toMatch(/to authenticated/) });
  it('payment setup failure releases inventory and safely reopens the draft',()=>{expect(sql).toContain("status='released'");expect(sql).toContain("status='payment_not_started',converted_order_id=null,converted_at=null")});
  it('has rollback-only remote regression evidence',()=>{const regression=readFileSync('supabase/verification/booking_draft_conversion_regression.sql','utf8');for(const marker of ['FAIL mismatched seat count accepted','FAIL draft was not linked atomically','FAIL idempotent conversion changed order','FAIL compensation did not reopen draft','FAIL paid passenger manifest count','FAIL assistance projection mismatch','rollback;'])expect(regression).toContain(marker)});
});
