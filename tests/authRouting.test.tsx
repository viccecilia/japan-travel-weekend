import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {loginSurfaceForReturnTo,referralCodeFromSearch,safeReturnTo} from '../src/app/auth';
import {Router} from '../src/router/Router';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);
function LocationProbe(){const location=useLocation();return <output data-testid="location">{location.pathname}{location.search}</output>}
function renderRoute(path:string,services:ProductionBrowserServices|null=null){return render(<MemoryRouter initialEntries={[path]}><AppProvider services={services}><LocationProbe/><Router/></AppProvider></MemoryRouter>)}
function clientWithUser(user:{id:string;email:string}|null,getUser?:()=>Promise<unknown>){
  return {auth:{getUser:getUser??(async()=>({data:{user},error:null})),getSession:async()=>({data:{session:null}})},from:()=>({select:()=>({order:async()=>({data:[],error:null})})})} as unknown as SupabaseClient;
}

describe('正式账户路由守卫',()=>{
  it('按 returnTo 识别游客、司导和管理登录入口',()=>{
    expect(loginSurfaceForReturnTo('/app/orders')).toBe('passenger');
    expect(loginSurfaceForReturnTo('/staff/messages')).toBe('staff');
    expect(loginSurfaceForReturnTo('/app/operations/products')).toBe('operations');
  });
  it('未登录访问私有页面重定向登录并保存内部 returnTo',async()=>{
    renderRoute('/app/orders?tab=current');
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/app/login?returnTo=%2Fapp%2Forders%3Ftab%3Dcurrent'));
    expect(screen.queryByText('暂无订单')).not.toBeInTheDocument();
  });
  it('本地乘客账户不能进入工作人员端',async()=>{
    renderRoute('/staff');
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toContain('/app/login'));
  });
  it('已登录但没有工作人员角色或任务时拒绝工作人员端',async()=>{
    const user={id:'passenger-1',email:'passenger@example.invalid'};
    const client={
      auth:{getUser:async()=>({data:{user},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'passenger'},error:null})})})}),
      rpc:async(name:string)=>name==='get_staff_portal_tasks'?{data:[],error:null}:{data:null,error:null},
    } as unknown as SupabaseClient;
    renderRoute('/staff',new ProductionBrowserServices(client,undefined));
    expect(await screen.findByText('无权访问工作人员端')).toBeInTheDocument();
    expect(screen.queryByText('今日履约')).not.toBeInTheDocument();
  });
  it('工作人员会话进入游客预约流程时停在账户边界，不跳转 Staff',async()=>{
    const user={id:'staff-1',email:'staff@example.invalid'};
    const client={
      auth:{getUser:async()=>({data:{user},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},
      from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'driver'},error:null})})})}),
      rpc:async(name:string)=>name==='get_own_access_destination'?{data:[{destination:'staff'}],error:null}:name==='get_staff_portal_tasks'?{data:[],error:null}:{data:null,error:null},
    } as unknown as SupabaseClient;
    renderRoute('/app/passengers',new ProductionBrowserServices(client,undefined));
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toContain('/app/account-status?reason=passenger-required'));
    expect(screen.getByTestId('location').textContent).not.toBe('/staff');
    expect(await screen.findByText('当前是工作人员账号，不能用于游客预约')).toBeInTheDocument();
  });

  it('工作人员从游客预约登录时显示账号切换提示，不跳转 Staff',async()=>{
    const user={id:'staff-2',email:'staff2@example.invalid'};
    const client={
      auth:{getUser:async()=>({data:{user},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},
      from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'driver'},error:null})})})}),
      rpc:async(name:string)=>name==='get_own_access_destination'?{data:[{destination:'staff'}],error:null}:name==='get_staff_portal_tasks'?{data:[],error:null}:{data:null,error:null},
    } as unknown as SupabaseClient;
    renderRoute('/app/login?returnTo=%2Fapp%2Fpassengers',new ProductionBrowserServices(client,undefined));
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toContain('/app/account-status?reason=passenger-required'));
    expect(screen.getByTestId('location').textContent).not.toBe('/staff');
  });
  it('returnTo 只允许 App 内部路径',()=>{
    expect(safeReturnTo('/app/orders?tab=current')).toBe('/app/orders?tab=current');
    expect(safeReturnTo('/staff?day=tomorrow')).toBe('/staff?day=tomorrow');
    for(const unsafe of ['https://evil.example/app','//evil.example/app','/trips','/app/login','javascript:alert(1)'])expect(safeReturnTo(unsafe)).toBe('/app');
  });
  it('邀请链接只接受规范化的推荐码',()=>{
    expect(referralCodeFromSearch('?ref=jt_friend-88')).toBe('JT_FRIEND-88');
    expect(referralCodeFromSearch('?referral=ABC123')).toBe('ABC123');
    for(const unsafe of ['?ref=<script>','?ref=ab','?ref=has%20space','?ref='])expect(referralCodeFromSearch(unsafe)).toBe('');
  });
  it('邀请链接自动填写注册页推荐码',()=>{
    const services=new ProductionBrowserServices(clientWithUser(null),undefined);
    renderRoute('/app/create-account?ref=friend_2026',services);
    expect(screen.getByLabelText(/推荐码/)).toHaveValue('FRIEND_2026');
    expect(screen.getByText('已从邀请链接自动填写')).toBeInTheDocument();
  });
  it('Supabase 会话恢复期间只显示加载状态，不闪出私有页面',async()=>{
    let resolve!: (value:unknown)=>void;const pending=new Promise<unknown>(done=>{resolve=done});
    const services=new ProductionBrowserServices(clientWithUser(null,()=>pending),undefined);
    renderRoute('/app/orders',services);
    expect(screen.getByText('正在恢复账户会话')).toBeInTheDocument();
    expect(screen.queryByText('暂无订单')).not.toBeInTheDocument();
    resolve({data:{user:null},error:null});
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toContain('/app/login'));
  });
  it('已登录访问 login 仅返回批准的内部路径',async()=>{
    const services=new ProductionBrowserServices(clientWithUser({id:'account-1',email:'safe@example.invalid'}),undefined);
    renderRoute('/app/login?returnTo=%2Fapp%2Forders',services);
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/app/orders'));
    cleanup();
    renderRoute('/app/login?returnTo=https%3A%2F%2Fevil.example',services);
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/app'));
  });
  it('旧公开 app-demo 路径只做兼容重定向',async()=>{
    renderRoute('/app-demo/trips?from=legacy');
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/app/trips?from=legacy'));
  });
  it('认证回调只从 SDK 会话恢复用户并拒绝外部 returnTo',async()=>{
    const services=new ProductionBrowserServices(clientWithUser({id:'account-1',email:'safe@example.invalid'}),undefined);
    renderRoute('/app/auth/callback?returnTo=https%3A%2F%2Fevil.example',services);
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/app'));
  });
  it('重置密码服务未配置时明确关闭',()=>{
    renderRoute('/app/reset-password');
    expect(screen.getByText('账户服务暂未开放')).toBeInTheDocument();
    expect(screen.getByText('当前不会创建账户、发送邮件或修改密码。')).toBeInTheDocument();
  });
});
