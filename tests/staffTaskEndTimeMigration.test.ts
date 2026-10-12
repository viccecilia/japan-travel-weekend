import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/20261012133709_staff_task_end_time_for_leave_conflicts.sql','utf8');

describe('staff task end time projection',()=>{
  it('adds the real departure end time to the authorized staff task RPC',()=>{
    expect(sql).toContain('departs_at timestamptz,ends_at timestamptz,chat_opens_at');
    expect(sql).toContain('d.departs_at,d.ends_at,d.chat_opens_at');
    expect(sql).toContain('where sa.staff_id=auth.uid()');
    expect(sql).toContain('grant execute on function public.get_staff_portal_tasks() to authenticated,service_role');
  });
});
