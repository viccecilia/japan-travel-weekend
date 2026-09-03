import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
describe('paid order passenger manifest',()=>{
  const sql=readFileSync('supabase/migrations/202609030047_paid_order_passenger_manifest.sql','utf8');
  it('materializes exactly one idempotent passenger row per paid seat',()=>{for(const marker of ['source_index integer','passengers_order_source_index_key','generate_series(1,v_draft.adults)','generate_series(1,v_draft.children)','generate_series(1,v_draft.infants)','paid manifest count mismatch'])expect(sql).toContain(marker)});
  it('runs only after a paid or confirmed transition',()=>{expect(sql).toContain("after update of status on public.orders");expect(sql).toContain("new.status in ('paid','confirmed')")});
  it('projects only operational assistance fields for assigned staff',()=>{for(const marker of ['passenger_assistance_staff_projection','childSeatCount','accessibleVehicle','staffAssistance','largeLuggage','serviceDog'])expect(sql).toContain(marker);expect(sql).not.toMatch(/phone|emergency|dietary|notes/i)});
  it('keeps the callable manifest function service-role only',()=>{expect(sql).toContain('to service_role');expect(sql).not.toMatch(/grant execute[\s\S]*to authenticated/)});
});
