import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/202609110123_harden_account_access_destination.sql'),'utf8');

describe('三端账户目标权限迁移',()=>{
  it('只有已批准且可用的司导返回 staff，停用状态返回 staff_blocked',()=>{
    expect(sql).toContain("a.status='approved'");
    expect(sql).toContain("dr.status='available'");
    expect(sql).toContain("a.status in ('rejected','suspended')");
    expect(sql).toContain("then 'staff_blocked'");
  });
  it('只向认证身份开放账户目标 RPC',()=>{
    expect(sql).toContain('revoke all on function public.get_own_access_destination() from public,anon');
    expect(sql).toContain('grant execute on function public.get_own_access_destination() to authenticated,service_role');
  });
});
