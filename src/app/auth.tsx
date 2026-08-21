/* eslint-disable react-refresh/only-export-components */
import type {ReactNode} from 'react';
import {Navigate,useLocation} from 'react-router-dom';
import {useApp} from './store';

export function safeReturnTo(value:string|null|undefined){
  if(!value)return '/app';
  try{
    const target=new URL(value,'https://app.local.invalid');
    if(target.origin!=='https://app.local.invalid')return '/app';
    if(target.pathname==='/app/login'||!(target.pathname==='/app'||target.pathname.startsWith('/app/')))return '/app';
    return `${target.pathname}${target.search}${target.hash}`;
  }catch{return '/app';}
}

export function RequireAccount({children}:{children:ReactNode}){
  const {state,authResolved}=useApp();const location=useLocation();
  if(!authResolved)return <main className="empty-card" role="status"><b>正在恢复账户会话</b><p>请稍候，正在安全确认登录状态。</p></main>;
  if(!state.user){const returnTo=safeReturnTo(`${location.pathname}${location.search}`);return <Navigate replace to={`/app/login?returnTo=${encodeURIComponent(returnTo)}`}/>;}
  return children;
}

export function LegacyAppRedirect(){
  const location=useLocation();const suffix=location.pathname.slice('/app-demo'.length);return <Navigate replace to={`/app${suffix}${location.search}${location.hash}`}/>;
}
