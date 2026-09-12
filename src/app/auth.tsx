/* eslint-disable react-refresh/only-export-components */
import {useEffect,useState,type ReactNode} from 'react';
import {Navigate,useLocation} from 'react-router-dom';
import {useApp} from './store';
import {runtimeMode} from '../shared/config/businessRules';

export const testGuestMode=runtimeMode==='demo';

export const isOperationsPath=(pathname:string)=>pathname==='/app/operations'||pathname.startsWith('/app/operations/');
export const isStaffPath=(pathname:string)=>pathname==='/staff'||pathname.startsWith('/staff/');

export type LoginSurface='passenger'|'staff'|'operations';
export function loginSurfaceForReturnTo(returnTo:string):LoginSurface{
  const pathname=new URL(safeReturnTo(returnTo),'https://app.local.invalid').pathname;
  return isOperationsPath(pathname)?'operations':isStaffPath(pathname)?'staff':'passenger';
}

export const accessDestinationPath=(destination:string|null|undefined)=>destination==='operations'?'/app/operations':destination==='staff'?'/staff':destination==='staff_pending'||destination==='staff_blocked'?'/app/account-status':'/app';

const passengerOnlyPaths=['/app/passengers','/app/checkout','/app/payment','/app/payment-result','/app/orders','/app/my-trip','/app/ai-guide','/app/private-groups','/app/boarding-pass','/app/rewards','/app/referral','/app/profile'];
export const isPassengerOnlyPath=(value:string)=>passengerOnlyPaths.some(path=>value===path||value.startsWith(`${path}/`)||value.startsWith(`${path}?`));
export const passengerAccountBoundaryPath=(returnTo:string)=>`/app/account-status?reason=passenger-required&returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;

export function safeReturnTo(value:string|null|undefined){
  if(!value)return '/app';
  try{
    const target=new URL(value,'https://app.local.invalid');
    if(target.origin!=='https://app.local.invalid')return '/app';
    const allowed=target.pathname==='/app'||target.pathname.startsWith('/app/')||target.pathname==='/staff'||target.pathname.startsWith('/staff/');
    if(target.pathname==='/app/login'||!allowed)return '/app';
    return `${target.pathname}${target.search}${target.hash}`;
  }catch{return '/app';}
}

export function referralCodeFromSearch(search:string){
  const params=new URLSearchParams(search);
  const raw=(params.get('ref')??params.get('referral')??'').trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(raw)?raw:'';
}

export function RequireAccount({children}:{children:ReactNode}){
  const {state,authResolved,services}=useApp();const location=useLocation();const account=state.user?.email??'';const [destinationResult,setDestinationResult]=useState<{account:string;destination:string|null}|null>(null);
  const [destinationResolved,setDestinationResolved]=useState<boolean>(false);
  useEffect(()=>{
    let active=true;
    setDestinationResolved(false);
    if(authResolved&&account&&services){
      void services.currentAccessDestination().then(value=>{
        if(!active)return;
        setDestinationResult({account,destination:value});
        setDestinationResolved(true);
      }).catch(()=>{
        if(!active)return;
        setDestinationResult({account,destination:null});
        setDestinationResolved(true);
      });
    }
    return()=>{active=false};
  },[authResolved,account,services]);
  if(testGuestMode)return children;
  if(!authResolved)return <main className="empty-card" role="status"><b>正在恢复账户会话</b><p>请稍候，正在安全确认登录状态。</p></main>;
  if(!state.user){const returnTo=safeReturnTo(`${location.pathname}${location.search}`);return <Navigate replace to={`/app/login?returnTo=${encodeURIComponent(returnTo)}`}/>;}
  const destination=destinationResult?.account===account?destinationResult.destination:null;
  if(services&&!destinationResolved)return <main className="empty-card" role="status"><b>正在验证账户类型</b><p>一个账户只能进入对应工作区。</p></main>;
  if(services&&destination===null)return <main className="empty-card" role="status"><b>账户类型校验失败</b><p>暂时无法确认当前账户访问权限，请稍后重试或重新登录。</p></main>;
  const roleProtected=isStaffPath(location.pathname)||isOperationsPath(location.pathname);
  if(services&&!roleProtected&&location.pathname!=="/app/account-status"&&destination!=="passenger")return <Navigate replace to={passengerAccountBoundaryPath(`${location.pathname}${location.search}`)}/>;
  return children;
}

export function RequireOperations({children}:{children:ReactNode}){
  const {state,authResolved,services}=useApp();const location=useLocation();const [roleResult,setRoleResult]=useState<{account:string;role:'operations'|'denied'}|null>(null);const account=state.user?.email??'';
  useEffect(()=>{let active=true;if(!authResolved||!account||!services)return()=>{active=false};void services.currentAccessDestination().then(value=>{if(active)setRoleResult({account,role:value==='operations'?'operations':'denied'})}).catch(()=>{if(active)setRoleResult({account,role:'denied'})});return()=>{active=false}},[authResolved,account,services]);
  if(testGuestMode)return children;
  const role=roleResult?.account===account?roleResult.role:'loading';
  if(!authResolved||role==='loading')return <main className="empty-card" role="status"><b>正在验证运营权限</b><p>后台数据只对运营账户开放。</p></main>;
  if(!state.user){const returnTo=safeReturnTo(`${location.pathname}${location.search}`);return <Navigate replace to={`/app/login?returnTo=${encodeURIComponent(returnTo)}`}/>}
  if(role!=='operations')return <main className="empty-card"><b>无权访问运营后台</b><p>当前账户不是运营角色。</p></main>;
  return children;
}

export function RequireStaff({children}:{children:ReactNode}){
  const {state,authResolved,services}=useApp();
  const location=useLocation();
  const account=state.user?.email??'';
  const [access,setAccess]=useState<{account:string;destination:string|null}|null>(null);
  useEffect(()=>{
    let active=true;
    if(!authResolved||!account||!services)return()=>{active=false};
    void services.currentAccessDestination().then(destination=>{
      if(!active)return;
      setAccess({account,destination});
    }).catch(()=>{if(active)setAccess({account,destination:null});});
    return()=>{active=false};
  },[authResolved,account,services]);
  if(testGuestMode)return children;
  if(!authResolved)return <main className="empty-card" role="status"><b>正在恢复账户会话</b><p>请稍候，正在安全确认登录状态。</p></main>;
  if(!state.user){const returnTo=safeReturnTo(`${location.pathname}${location.search}`);return <Navigate replace to={`/app/login?returnTo=${encodeURIComponent(returnTo)}`}/>;}
  if(!services)return <main className="empty-card"><b>无权访问工作人员端</b><p>本地乘客账户不能进入工作人员端。请使用由运营分配的工作人员账户登录。</p></main>;
  if(access?.account!==account)return <main className="empty-card" role="status"><b>正在验证工作人员权限</b><p>只会读取当前账户被分配的车辆与团组。</p></main>;
  if(access.destination==='staff_pending')return <main className="empty-card"><b>司导资格正在审核</b><p>审核通过后即可进入司导端。如需了解进度，请联系运营调度。</p><a className="button full" href="/app/support">联系运营</a></main>;
  if(access.destination==='staff_blocked')return <main className="empty-card"><b>司导账号已停用</b><p>该账号当前不能查看任务或执行履约操作。如有疑问，请联系运营调度。</p><a className="button full" href="/app/support">联系运营</a></main>;
  if(access.destination!=='staff'&&access.destination!=='operations')return <main className="empty-card"><b>无权访问工作人员端</b><p>当前账户没有已批准的司导权限。请切换至获批司导账号。</p></main>;
  return children;
}

export function LegacyAppRedirect(){
  const location=useLocation();const suffix=location.pathname.slice('/app-demo'.length);return <Navigate replace to={`/app${suffix}${location.search}${location.hash}`}/>;
}
