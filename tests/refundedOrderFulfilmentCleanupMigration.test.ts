import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('refunded order fulfilment cleanup',()=>{
  const sql=readFileSync('supabase/migrations/202609030049_refunded_order_fulfilment_cleanup.sql','utf8');
  it('limits vehicle-group membership to eligible paid orders',()=>{
    expect(sql).toContain("o.status in ('paid','confirmed')");
    expect(sql).toContain('public.is_vehicle_group_member');
  });
  it('removes refunded fulfilment access and returns capacity',()=>{
    for(const marker of ['deallocate_order_after_status_change_trigger','delete from public.vehicle_group_orders','set booked_seats=coalesce','set status=\'revoked\'','set revoked_at=coalesce','set stopped_at=now()'])expect(sql).toContain(marker);
  });
  it('does not allow public clients to call the cleanup function',()=>{
    expect(sql).toContain('revoke all on function public.deallocate_ineligible_order_fulfilment(uuid),public.deallocate_order_after_status_change() from public,anon,authenticated');
    expect(sql).not.toMatch(/grant execute on function public\.deallocate_ineligible_order_fulfilment\(uuid\) to authenticated/);
  });
});
