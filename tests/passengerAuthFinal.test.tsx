import {readFileSync} from 'node:fs';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {safePassengerReturnTo} from '../src/app/auth';
import {passengerAuthPagesCopy} from '../src/shared/i18n/passengerLocale';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';
import {SupabaseAuthRepository} from '../src/shared/integrations/supabaseProduction';
import {Router} from '../src/router/Router';

afterEach(cleanup);

function LocationProbe(){const location=useLocation();return <output data-testid="location">{location.pathname}{location.search}</output>}
function makeClient({session=false,user=null}:{session?:boolean;user?:{id:string;email:string}|null}={}){
  const signUp=vi.fn(async()=>({data:{user:{id:'new-passenger',email:'new@example.invalid'},session:session?{access_token:'test'}:null},error:null}));
  const client={
    auth:{signUp,getUser:vi.fn(async()=>({data:{user},error:null})),getSession:vi.fn(async()=>({data:{session:null},error:null})),signInWithPassword:vi.fn(async()=>({data:{user},error:null})),resetPasswordForEmail:vi.fn(async()=>({data:{},error:null})),updateUser:vi.fn(async()=>({data:{},error:null})),signOut:vi.fn(async()=>({error:null})),onAuthStateChange:vi.fn(()=>({data:{subscription:{unsubscribe:vi.fn()}}}))},
    rpc:vi.fn(async(name:string)=>name==='get_own_access_destination'?{data:[{destination:'passenger'}],error:null}:{data:[],error:null}),
    from:vi.fn(()=>({select:()=>({order:async()=>({data:[],error:null})})})),
  } as unknown as SupabaseClient;
  return {client,signUp};
}
function renderRoute(path:string,services?:ProductionBrowserServices){return render(<MemoryRouter initialEntries={[path]}><AppProvider services={services??new ProductionBrowserServices(makeClient().client,undefined)}><LocationProbe/><Router/></AppProvider></MemoryRouter>)}

describe('Passenger Auth Final Polish',()=>{
  it('登录、注册和忘记密码页面不渲染顶部返回箭头',async()=>{
    for(const path of ['/app/login','/app/create-account','/app/forgot-password']){
      const view=renderRoute(path);
      await screen.findByRole('banner');
      expect(document.querySelector('.passenger-page-back')).toBeNull();
      view.unmount();
    }
  });

  it('登录页正常显示忘记密码和创建账户入口',async()=>{
    renderRoute('/app/login?returnTo=%2Fapp%2Forders%3Ftab%3Dcurrent');
    expect(await screen.findByRole('heading',{name:'从关西周末出发'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:/忘记密码/})).toHaveAttribute('href','/app/forgot-password?returnTo=%2Fapp%2Forders%3Ftab%3Dcurrent');
    expect(screen.getByRole('link',{name:'创建账户'})).toHaveAttribute('href','/app/create-account?returnTo=%2Fapp%2Forders%3Ftab%3Dcurrent');
  });

  it('注册页不显示账户类型、游客、司机或导游选择器',async()=>{
    renderRoute('/app/create-account');
    expect(await screen.findByRole('heading',{name:'创建账户'})).toBeInTheDocument();
    expect(screen.queryByLabelText('账户类型')).not.toBeInTheDocument();
    expect(screen.queryByText('司机申请')).not.toBeInTheDocument();
    expect(screen.queryByText('导游申请')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'登录账户'})).toBeInTheDocument();
  });

  it('Login 到 Register 再回 Login 均保留合法 returnTo',async()=>{
    renderRoute('/app/create-account?returnTo=%2Fapp%2Fbooking%2Froute-a%3FdepartureId%3Ddep-1');
    expect(await screen.findByRole('link',{name:'登录账户'})).toHaveAttribute('href','/app/login?returnTo=%2Fapp%2Fbooking%2Froute-a%3FdepartureId%3Ddep-1');
  });

  it('注册成功的 Passenger 会话恢复原目标页面并保留推荐码',async()=>{
    const {client,signUp}=makeClient({session:true});
    renderRoute('/app/create-account?returnTo=%2Fapp%2Forders&ref=FRIEND_2026',new ProductionBrowserServices(client,undefined));
    fireEvent.change(await screen.findByLabelText('姓名'),{target:{value:'Traveler'}});
    fireEvent.change(screen.getByLabelText('电子邮箱'),{target:{value:'new@example.invalid'}});
    fireEvent.change(screen.getByLabelText('密码'),{target:{value:'SecurePassword1'}});
    fireEvent.change(screen.getByLabelText('再次输入密码'),{target:{value:'SecurePassword1'}});
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'创建账户'}));
    await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('/app/orders'));
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({options:expect.objectContaining({data:{display_name:'Traveler',referral_code:'FRIEND_2026'}})}));
    expect(JSON.stringify(signUp.mock.calls)).not.toContain('requested_account_type');
  });

  it('Passenger returnTo 拒绝外部、畸形和工作人员目标',()=>{
    for(const unsafe of ['https://evil.example','http://evil.example','//evil.example','javascript:alert(1)','data:text/html,x','/staff','/app/operations','/app/auth/callback'])expect(safePassengerReturnTo(unsafe)).toBe('/app');
    expect(safePassengerReturnTo('/app/messages?room=1')).toBe('/app/messages?room=1');
  });

  it('公开 signup 仓库不发送任何角色 metadata',async()=>{
    const {client,signUp}=makeClient();const repository=new SupabaseAuthRepository(client,'https://travel.example/');
    await repository.signUp('new@example.invalid','SecurePassword1','Traveler','FRIEND_2026','/app/orders');
    expect(signUp).toHaveBeenCalledWith({email:'new@example.invalid',password:'SecurePassword1',options:{emailRedirectTo:'https://travel.example/app/auth/callback?returnTo=%2Fapp%2Forders',data:{display_name:'Traveler',referral_code:'FRIEND_2026'}}});
    expect(JSON.stringify(signUp.mock.calls)).not.toMatch(/driver|guide|operations|staff|requested_account_type/);
  });

  it('数据库触发器忽略伪造 role，只创建 Passenger 且保留后台 provisioning',()=>{
    const sql=readFileSync('supabase/migrations/20261009043507_passenger_public_signup_role_boundary.sql','utf8');
    expect(sql).toContain("values(new.id,applicant,'passenger')");
    expect(sql).not.toContain('requested_account_type');
    expect(sql).not.toContain('staff_account_applications');
    expect(sql).not.toContain('operations_review_staff_application');
    expect(sql).toContain('apply_referral_registration');
  });

  it('中日英西认证关键文案均有正式翻译',()=>{
    expect(passengerAuthPagesCopy['zh-CN'].createTitle).toBe('创建账户');
    expect(passengerAuthPagesCopy.ja.createTitle).toBe('アカウント作成');
    expect(passengerAuthPagesCopy.en.createTitle).toBe('Create account');
    expect(passengerAuthPagesCopy.es.createTitle).toBe('Crear una cuenta');
    for(const locale of ['zh-CN','ja','en','es'] as const)for(const key of ['email','password','confirmPassword','showPassword','forgotTitle','backLogin'] as const)expect(passengerAuthPagesCopy[locale][key].trim()).not.toBe('');
  });

  it('认证页面不安装浏览器返回陷阱',()=>{
    const source=readFileSync('src/app/AuthPages.tsx','utf8');
    expect(source).not.toMatch(/popstate|beforeunload|pushState|preventDefault\(\).*history/);
  });
});
