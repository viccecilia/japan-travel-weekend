import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {SupabaseAccountProfileRepository} from '../src/shared/integrations/supabaseProduction';

describe('account deletion request workflow',()=>{
  const sql=readFileSync('supabase/migrations/202609030054_account_deletion_requests.sql','utf8');
  it('keeps deletion asynchronous, private and blocked behind an exact confirmation',()=>{
    expect(sql).toContain("p_confirmation<>'删除我的账户'");
    expect(sql).toContain('account_deletion_owner_read');
    expect(sql).toContain('account_deletion_operations_read');
    expect(sql).toContain("status in ('paid','confirmed','payment_review')");
    expect(sql).not.toMatch(/delete from public\.(profiles|orders|passengers)/);
  });
  it('allows owners to cancel only before operations review and restricts operations decisions',()=>{
    expect(sql).toContain("status in ('requested','deferred_active_booking')");
    expect(sql).toContain("p_decision not in ('reviewing','rejected')");
    expect(sql).toContain('if not public.is_operations()');
  });
  it('client submits only confirmation and an optional bounded reason through RPC',async()=>{
    const rpc=vi.fn(async()=>({data:{id:'request-1',status:'requested'},error:null}));
    const repository=new SupabaseAccountProfileRepository({rpc} as never);
    await expect(repository.requestOwnDeletion('删除我的账户','不再使用')).resolves.toMatchObject({data:{id:'request-1'},error:null});
    expect(rpc).toHaveBeenCalledWith('request_own_account_deletion',{p_confirmation:'删除我的账户',p_reason:'不再使用'});
  });
});
