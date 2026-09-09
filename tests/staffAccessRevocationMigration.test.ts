import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(join(process.cwd(),'supabase','migrations','202609090088_revoke_inactive_staff_access.sql'),'utf8');

describe('U0 staff access revocation migration',()=>{
  it('requires an active role, active resource and a non-revoked assignment',()=>{
    expect(sql).toContain('sa.revoked_at is null');
    expect(sql).toContain("p.role in ('driver','guide','operations')");
    expect(sql).toContain("dr.status='available'");
    expect(sql).toContain('public.is_group_staff(vg.id)');
  });
  it('keeps history while revoking every live assignment',()=>{
    expect(sql).toContain('add column if not exists revoked_at');
    expect(sql).toMatch(/update public\.staff_assignments[\s\S]*where staff_id=p_account and revoked_at is null/);
    expect(sql).toMatch(/p_decision in \('rejected','suspended'\)[\s\S]*update public\.staff_assignments/);
    expect(sql).toContain("'staff_access_revoked'");
  });
  it('does not leave assistance access on a direct stale assignment join',()=>{
    expect(sql).toMatch(/can_read_assistance_projection[\s\S]*public\.is_group_staff\(vgo\.vehicle_group_id\)/);
  });
});
