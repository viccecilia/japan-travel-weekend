import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(join(process.cwd(),'supabase','migrations','20261005171500_sync_account_profile_display_name.sql'),'utf8');

describe('完整账户资料显示名同步',()=>{
  it('将显示名同步到聊天室使用的公开资料与司机资源',()=>{
    expect(sql).toContain('update public.profiles');
    expect(sql).toContain('set display_name=v_name,updated_at=now()');
    expect(sql).toContain('update public.driver_resources');
    expect(sql).toContain('where account_id=v_account');
    expect(sql).toContain('from public.account_private_profiles ap');
    expect(sql).toContain('ap.updated_at>dr.updated_at');
  });

  it('保留本人鉴权、同意记录和最小 RPC 权限',()=>{
    expect(sql).toContain('v_account uuid:=auth.uid()');
    expect(sql).toContain("raise exception 'authentication required'");
    expect(sql).toContain("raise exception 'consent required'");
    expect(sql).toContain('revoke all on function public.update_own_account_profile');
    expect(sql).toContain('grant execute on function public.update_own_account_profile');
  });
});
