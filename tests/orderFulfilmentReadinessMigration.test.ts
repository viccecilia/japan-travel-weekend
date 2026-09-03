import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
describe('order fulfilment readiness projection',()=>{
  const sql=readFileSync('supabase/migrations/202609030048_order_fulfilment_readiness.sql','utf8');
  it('requires payment, vehicle group and room before boarding is ready',()=>{for(const marker of ["o.status in ('paid','confirmed')",'vgo.vehicle_group_id is not null',"tr.status in ('frozen','open')",'boarding_ready boolean'])expect(sql).toContain(marker)});
  it('projects only the authenticated order owner',()=>{expect(sql).toContain('o.account_id=auth.uid()');expect(sql).not.toMatch(/passenger_private|assistance_private|phone|email/i)});
});
