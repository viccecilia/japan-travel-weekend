import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('ephemeral operational data retention',()=>{
  const sql=readFileSync('supabase/migrations/202609030055_ephemeral_data_retention.sql','utf8');
  it('purges only records whose existing explicit retention or expiry has elapsed',()=>{
    for(const marker of ['boarding_verification_attempts where retain_until<=p_now','boarding_credentials where expires_at<=p_now','driver_location_sessions where expires_at<=p_now','location_shares where expires_at<=p_now'])expect(sql).toContain(marker);
    expect(sql).not.toMatch(/delete from public\.(orders|passengers|payment_events|trip_room_messages|notification_outbox)/);
  });
  it('is callable only by the trusted scheduler with bounded clock input',()=>{
    expect(sql).toContain("current_user not in ('service_role','postgres')");
    expect(sql).toContain("p_now>now()+interval '5 minutes'");
    expect(sql).toContain('grant execute on function public.purge_expired_ephemeral_data(timestamptz) to service_role');
  });
});
