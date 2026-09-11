import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/202609110122_v8s1_cancelled_staff_execution_boundary.sql'),'utf8');

describe('V8-S.1 cancelled assignment boundary',()=>{
  it('maps departure or revoked dispatch state to a read-only cancelled task',()=>{
    expect(sql).toContain("d.status<>'cancelled'");
    expect(sql).toContain("dt.status='cancelled'");
    expect(sql).toContain("then 'cancelled'");
    expect(sql).toContain("then 'closed'");
  });
  it('rejects stale direct writes for execution, check-in, journey and location',()=>{
    for(const trigger of ['guard_cancelled_staff_execution','guard_cancelled_passenger_checkin','guard_cancelled_journey_state','guard_cancelled_location_point'])expect(sql).toContain(trigger);
    expect(sql).toContain("raise exception 'cancelled assignment is read only'");
  });
  it('stops runtime resources without deleting history',()=>{
    expect(sql).toContain("update public.trip_rooms set status='closed'");
    expect(sql).toContain('update public.driver_location_sessions');
    expect(sql).toContain("update public.vehicle_group_meeting_state set status='cancelled'");
    expect(sql).toContain('close_revoked_dispatch_staff_runtime_trigger');
    expect(sql).not.toMatch(/delete\s+from\s+public\.(staff_execution_events|passenger_checkins|driver_location_points)/i);
  });
});
