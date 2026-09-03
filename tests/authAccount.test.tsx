import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {ForgotPassword} from '../src/app/AuthPages';
import {Router} from '../src/router/Router';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';
import {SupabaseAuthRepository} from '../src/shared/integrations/supabaseProduction';

afterEach(cleanup);

function authClient(overrides:Record<string,unknown>={}){
  return {auth:{
    signUp:vi.fn(async()=>({data:{user:{email:'person@example.invalid'},session:null},error:null})),
    resetPasswordForEmail:vi.fn(async()=>({data:{},error:null})),
    updateUser:vi.fn(async()=>({data:{},error:null})),
    signInWithPassword:vi.fn(async()=>({data:{},error:null})),
    getUser:vi.fn(async()=>({data:{user:null},error:null})),
    signOut:vi.fn(async()=>({error:null})),
    onAuthStateChange:vi.fn(()=>({data:{subscription:{unsubscribe:vi.fn()}}})),
    ...overrides,
  },from:()=>({select:()=>({order:async()=>({data:[],error:null})})})} as unknown as SupabaseClient;
}

describe('正式账户服务契约',()=>{
  it('注册与重置邮件只能使用受控同源路径',async()=>{
    const client=authClient();const repository=new SupabaseAuthRepository(client,'https://travel.example/');
    await repository.signUp('person@example.invalid','SecurePassword1');
    await repository.requestPasswordReset('person@example.invalid');
    expect(client.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({options:{emailRedirectTo:'https://travel.example/app/auth/callback'}}));
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('person@example.invalid',{redirectTo:'https://travel.example/app/reset-password'});
  });
  it('拒绝带路径、查询或非网页协议的应用 origin',async()=>{
    for(const origin of ['https://travel.example/evil','https://travel.example/?next=evil','javascript:alert(1)']){
      const client=authClient();const repository=new SupabaseAuthRepository(client,origin);
      expect(await repository.signUp('person@example.invalid','SecurePassword1')).toBeNull();
      expect(client.auth.signUp).not.toHaveBeenCalled();
    }
  });
  it('密码重置不暴露账户是否存在，缺配置时关闭',async()=>{
    const client=authClient({resetPasswordForEmail:vi.fn(async()=>({data:{},error:{message:'user not found'}}))});
    expect(await new SupabaseAuthRepository(client,'https://travel.example/').requestPasswordReset('missing@example.invalid')).toBe(true);
    const unavailable=new SupabaseAuthRepository(null,'https://travel.example/');
    expect(await unavailable.requestPasswordReset('missing@example.invalid')).toBe(false);
    expect(await unavailable.updatePassword('SecurePassword1')).toBe(false);
    expect(await unavailable.signUp('missing@example.invalid','SecurePassword1')).toBeNull();
  });
  it('订阅会话失效并可解除订阅',()=>{
    const unsubscribe=vi.fn();let listener:((event:string,session:{user:{email:string}}|null)=>void)|undefined;
    const client=authClient({onAuthStateChange:vi.fn((callback)=>{listener=callback;return {data:{subscription:{unsubscribe}}}})});
    const handler=vi.fn();const stop=new SupabaseAuthRepository(client).onAuthStateChange(handler);
    listener?.('SIGNED_OUT',null);listener?.('SIGNED_IN',{user:{email:'person@example.invalid'}});
    expect(handler).toHaveBeenNthCalledWith(1,'SIGNED_OUT',null);
    expect(handler).toHaveBeenNthCalledWith(2,'SIGNED_IN',{email:'person@example.invalid'});
    stop();expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('账户页面',()=>{
  it('忘记密码始终显示防枚举说明',async()=>{
    const client=authClient({resetPasswordForEmail:vi.fn(async()=>({data:{},error:{message:'not found'}}))});
    const services=new ProductionBrowserServices(client,undefined);
    render(<MemoryRouter><AppProvider services={services}><ForgotPassword/></AppProvider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('电子邮箱'),{target:{value:'missing@example.invalid'}});
    fireEvent.click(screen.getByRole('button',{name:'发送重置说明'}));
    await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('如果该邮箱关联可用账户'));
    expect(screen.getByRole('status')).not.toHaveTextContent(/不存在|未注册|已注册/);
  });
  it('未配置时不伪装发送重置邮件',()=>{
    render(<MemoryRouter><AppProvider services={null}><ForgotPassword/></AppProvider></MemoryRouter>);
    expect(screen.getByRole('button',{name:'发送重置说明'})).toBeDisabled();
  });
  it('退出只清除当前会话并返回登录页',async()=>{
    const signOut=vi.fn(async()=>({error:null}));
    const client=authClient({getUser:vi.fn(async()=>({data:{user:{id:'account-1',email:'person@example.invalid'}},error:null})),signOut});
    render(<MemoryRouter initialEntries={['/app/profile']}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Router/></AppProvider></MemoryRouter>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'退出账户'})).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button',{name:'退出账户'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'登录账户'})).toBeInTheDocument());
    expect(signOut).toHaveBeenCalledOnce();
  });
  it('账户删除必须输入完整确认语句且只提交申请',async()=>{
    const rpc=vi.fn((name:string)=>name==='get_own_account_profile'?{maybeSingle:async()=>({data:null,error:null})}:Promise.resolve({data:{id:'delete-request-1',status:'requested',requested_at:'2026-09-03T00:00:00Z'},error:null}));
    const client=authClient({getUser:vi.fn(async()=>({data:{user:{id:'account-1',email:'person@example.invalid'}},error:null}))});
    (client as unknown as {rpc:typeof rpc}).rpc=rpc;
    render(<MemoryRouter initialEntries={['/app/profile']}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Router/></AppProvider></MemoryRouter>);
    const submit=await screen.findByRole('button',{name:'提交账户删除申请'});expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('请输入“删除我的账户”确认'),{target:{value:'删除我的账户'}});fireEvent.click(submit);
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('request_own_account_deletion',{p_confirmation:'删除我的账户',p_reason:null}));
    expect(screen.getByText('删除申请已登记，尚未实际删除账户。')).toBeInTheDocument();
  });
  it('会话过期立即关闭私有页面并返回登录',async()=>{
    let listener:((event:string,session:{user:{email:string}}|null)=>void)|undefined;
    const client=authClient({
      getUser:vi.fn(async()=>({data:{user:{id:'account-1',email:'person@example.invalid'}},error:null})),
      onAuthStateChange:vi.fn((callback)=>{listener=callback;return {data:{subscription:{unsubscribe:vi.fn()}}}}),
    });
    render(<MemoryRouter initialEntries={['/app/orders']}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Router/></AppProvider></MemoryRouter>);
    await waitFor(()=>expect(screen.getByRole('heading',{name:'我的行程'})).toBeInTheDocument());
    act(()=>listener?.('SIGNED_OUT',null));
    await waitFor(()=>expect(screen.getByRole('button',{name:'登录账户'})).toBeInTheDocument());
  });
});
