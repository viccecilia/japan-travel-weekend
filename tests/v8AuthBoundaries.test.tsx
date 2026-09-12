import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {isOperationsPath,RequireAccount,RequireOperations,RequireStaff} from '../src/app/auth';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);

type Destination='passenger'|'staff'|'operations'|'staff_pending'|'staff_blocked'|null;

function servicesFor(destination:Destination,email='account@example.invalid'){
  return {
    currentUser:async()=>({id:'account-id',email}),
    currentAccessDestination:async()=>destination,
    onAuthStateChange:()=>()=>undefined,
    loadSellableDepartures:async()=>({data:[],error:null}),
  } as unknown as ProductionBrowserServices;
}

function operationsAt(path:string,destination:Destination){
  return render(<MemoryRouter initialEntries={[path]}><AppProvider services={servicesFor(destination)}><RequireAccount><RequireOperations><div>运营页面已授权</div></RequireOperations></RequireAccount></AppProvider></MemoryRouter>);
}

function staffAt(path:string,destination:Destination){
  return render(<MemoryRouter initialEntries={[path]}><AppProvider services={servicesFor(destination)}><RequireAccount><RequireStaff><div>司导页面已授权</div></RequireStaff></RequireAccount></AppProvider></MemoryRouter>);
}

function failingServicesFor(){
  return {
    currentUser:async()=>({id:'account-id',email:'account@example.invalid'}),
    currentAccessDestination:async()=>{throw new Error('network down');},
    onAuthStateChange:()=>()=>undefined,
    loadSellableDepartures:async()=>({data:[],error:null}),
  } as unknown as ProductionBrowserServices;
}

describe('V8 角色边界与深链',()=>{
  it('后台首页和全部子路径使用同一运营边界',()=>{
    for(const path of ['/app/operations','/app/operations/products','/app/operations/departures','/app/operations/run','/app/operations/commissions','/app/operations/orders/one'])expect(isOperationsPath(path)).toBe(true);
    for(const path of ['/app','/app/orders','/staff','/app/operations-fake'])expect(isOperationsPath(path)).toBe(false);
  });

  it.each(['/app/operations','/app/operations/products','/app/operations/departures','/app/operations/run','/app/operations/commissions'])('运营账户可刷新或直接打开 %s',async path=>{
    operationsAt(path,'operations');
    expect(await screen.findByText('运营页面已授权')).toBeInTheDocument();
  });

  it.each(['passenger','staff','staff_pending','staff_blocked'] as const)('%s 账户不能进入运营子页面',async destination=>{
    operationsAt('/app/operations/products',destination);
    expect(await screen.findByText('无权访问运营后台')).toBeInTheDocument();
    expect(screen.queryByText('运营页面已授权')).not.toBeInTheDocument();
  });

  it('获批司导可进入司导资料，停用司导即使旧角色仍存在也会被拒绝',async()=>{
    staffAt('/staff/profile','staff');
    expect(await screen.findByText('司导页面已授权')).toBeInTheDocument();
    cleanup();
    staffAt('/staff/profile','staff_blocked');
    expect(await screen.findByText('司导账号已停用')).toBeInTheDocument();
  });

  it('权限接口异常时不应一直显示“正在验证账户类型”',async()=>{
    render(<MemoryRouter initialEntries={['/app/profile']}><AppProvider services={failingServicesFor()}><RequireAccount><div>可访问</div></RequireAccount></AppProvider></MemoryRouter>);
    expect(await screen.findByText('账户类型校验失败')).toBeInTheDocument();
    expect(screen.queryByText('正在验证账户类型')).not.toBeInTheDocument();
  });

  it('游客不能进入司导页面，运营仍可进入受控工作人员页面',async()=>{
    staffAt('/staff/messages','passenger');
    expect(await screen.findByText('无权访问工作人员端')).toBeInTheDocument();
    cleanup();
    staffAt('/staff/messages','operations');
    await waitFor(()=>expect(screen.getByText('司导页面已授权')).toBeInTheDocument());
  });
});
