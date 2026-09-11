import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609110124_staff_assignment_acknowledgement.sql','utf8').toLowerCase();

describe('staff assignment acknowledgement migration',()=>{
  it('persists an idempotent acknowledgement owned by the signed-in staff member',()=>{
    expect(sql).toContain('create table if not exists public.staff_assignment_acknowledgements');
    expect(sql).toContain('sa.staff_id=auth.uid()');
    expect(sql).toContain('sa.revoked_at is null');
    expect(sql).toContain('public.is_vehicle_group_executable(sa.vehicle_group_id)');
    expect(sql).toContain('on conflict(staff_assignment_id) do nothing');
  });
  it('exposes acknowledgement and actual team assignment in the staff task projection',()=>{
    for(const marker of ['assignment_acknowledged','assignment_acknowledged_at','driver_name','guide_name','meeting_at'])expect(sql).toContain(marker);
  });
});
