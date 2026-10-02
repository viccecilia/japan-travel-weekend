import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(name:string)=>readFileSync(`supabase/migrations/${name}`,'utf8');

describe('passenger fixture visibility is enforced by RLS',()=>{
  it('keeps notifications scoped to their recipient or operations',()=>{
    const sql=read('202608250015_notification_outbox.sql');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('recipient_id=auth.uid() or public.is_operations()');
  });

  it('keeps Travel Moments submissions scoped to their owner or operations',()=>{
    const sql=read('20260928082633_phase41_travel_moment_submission_eligibility.sql');
    expect(sql).toContain('account_id=auth.uid() or public.is_operations()');
  });

  it('keeps trip-room photos inside the member vehicle group',()=>{
    const sql=read('20260921014907_private_trip_chat_photos.sql');
    expect(sql).toContain('public.can_receive_vehicle_group(r.vehicle_group_id)');
  });
});
