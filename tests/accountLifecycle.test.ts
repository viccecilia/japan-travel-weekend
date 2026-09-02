import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it,vi} from 'vitest';
import {SupabaseAccountProfileRepository,SupabaseOrderRepository} from '../src/shared/integrations/supabaseProduction';

const sql=readFileSync(join(process.cwd(),'supabase','migrations','202609020029_account_profiles_and_draft_lifecycle.sql'),'utf8');

describe('真实账户资料与草稿生命周期',()=>{
  it('角色仍由服务端控制且私密资料不能直接写入',()=>{
    expect(sql).toContain('account_private_profiles');
    expect(sql).toContain('revoke all on public.account_private_profiles,public.account_audit_events from public,anon,authenticated');
    expect(sql).toContain('account_id=auth.uid()');
    expect(sql).not.toMatch(/update public\.profiles[\s\S]{0,120}role/);
  });

  it('审计元数据禁止密码、token、电话和健康备注',()=>{
    for(const field of ['phone','emergency_phone','password','token','private_notes','health'])expect(sql).toContain(`'${field}'`);
    expect(sql).toContain("'profile_updated'");
    expect(sql).toContain("'draft_abandoned'");
    expect(sql).toContain("'draft_expired'");
  });

  it('资料更新只调用本人受控 RPC',async()=>{
    const rpc=vi.fn(async()=>({data:null,error:null}));
    const repository=new SupabaseAccountProfileRepository({rpc} as never);
    expect(await repository.updateOwn({displayName:'TEST 乘客',phone:'TEST-PHONE',emergencyName:'TEST 联系人',emergencyPhone:'TEST-EMERGENCY',acceptedTerms:true,acceptedPrivacy:true})).toEqual({ok:true,error:null});
    expect(rpc).toHaveBeenCalledWith('update_own_account_profile',expect.objectContaining({p_display_name:'TEST 乘客'}));
  });

  it('读取草稿前由服务端标记过期，放弃也只调用本人 RPC',async()=>{
    const order={order:vi.fn(()=>({data:[],error:null}))};
    const select=vi.fn(()=>order);
    const rpc=vi.fn(async(name:string)=>({data:name==='abandon_own_booking_draft'?true:0,error:null}));
    const repository=new SupabaseOrderRepository({rpc,from:vi.fn(()=>({select}))} as never);
    expect((await repository.loadOwnDrafts()).error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('expire_own_booking_drafts');
    expect(await repository.abandonOwnDraft('draft-test')).toEqual({ok:true,error:null});
    expect(rpc).toHaveBeenCalledWith('abandon_own_booking_draft',{p_draft:'draft-test'});
  });
});
