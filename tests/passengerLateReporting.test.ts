import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

describe('passenger late reporting migration',()=>{
  const sql=fs.readFileSync('supabase/migrations/202609030045_passenger_late_reporting.sql','utf8');
  it('persists only allowed delay buckets and exposes them through attendance',()=>{
    expect(sql).toContain('late_minutes in (5,10,15)');
    expect(sql).toContain('report_own_late_arrival');
    expect(sql).toContain('get_vehicle_group_attendance');
  });
  it('checks ownership and emits an idempotent important room message',()=>{
    expect(sql).toContain('o.account_id=auth.uid()');
    expect(sql).toContain('client_message_id=p_idempotency_key');
    expect(sql).toContain("important)");
  });
});
