import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202608310027_staff_direct_contact.sql','utf8');

describe('工作人员直接电话联系边界',()=>{
  it('电话只存私密表且普通客户端没有表权限',()=>{
    expect(sql).toContain('order_contact_private');
    expect(sql).toContain('passenger_contact_access_audit');
    expect(sql).toMatch(/revoke all on public\.order_contact_private,public\.passenger_contact_access_audit from public,anon,authenticated/i);
    expect(sql).toMatch(/grant all on public\.order_contact_private,public\.passenger_contact_access_audit to service_role/i);
  });
  it('仅本车工作人员或运营可取号，并受集中联系时间限制',()=>{
    expect(sql).toContain('public.is_group_staff(p_vehicle_group)');
    expect(sql).toContain('public.is_operations()');
    expect(sql).toContain('staff_contact_minutes_after');
    expect(sql).toContain('contact details not yet available');
    expect(sql).toContain("purpose='attendance_contact'");
  });
});
