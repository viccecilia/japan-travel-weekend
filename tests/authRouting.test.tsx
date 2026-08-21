import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {safeReturnTo} from '../src/app/auth';
import {Router} from '../src/router/Router';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);
function LocationProbe(){const location=useLocation();return <output data-testid="location">{location.pathname}{location.search}</output>}
function renderRoute(path:string,services:ProductionBrowserServices|null=null){return render(<MemoryRouter initialEntries={[path]}><AppProvider services={services}><LocationProbe/><Router/></AppProvider></MemoryRouter>)}
function clientWithUser(user:{id:string;email:string}|null,getUser?:()=>Promise<unknown>){
  return {auth:{getUser:getUser??(async()=>({data:{user},error:null})),getSession:async()=>({data:{session:null}})},from:()=>({select:()=>({order:async()=>({data:[],error:null})})})} as unknown as SupabaseClient;
}

describe('正式账户路由守卫',()=>{
  it('未登录访问私有页面重定向登录并保存内部 returnTo',async()=>{
    renderRoute('/app/orders?tab=current');
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/app/login?returnTo=%2Fapp%2Forders%3Ftab%3Dcurrent'));
    expect(screen.queryByText('暂无订单')).not.toBeInTheDocument();
  });
  it('returnTo 只允许 App 内部路径',()=>{
    expect(safeReturnTo('/app/orders?tab=current')).toBe('/app/orders?tab=current');
    for(const unsafe of ['https://evil.example/app','//evil.example/app','/trips','/app/login','javascript:alert(1)'])expect(safeReturnTo(unsafe)).toBe('/app');
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
