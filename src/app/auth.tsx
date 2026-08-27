/* eslint-disable react-refresh/only-export-components */
import {useEffect,useState,type ReactNode} from 'react';
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

export function RequireOperations({children}:{children:ReactNode}){
  const {state,authResolved,services}=useApp();const location=useLocation();const [roleResult,setRoleResult]=useState<{account:string;role:'operations'|'denied'}|null>(null);const account=state.user?.email??'';
  useEffect(()=>{let active=true;if(!authResolved||!account||!services)return()=>{active=false};void services.currentRole().then(value=>{if(active)setRoleResult({account,role:value==='operations'?'operations':'denied'})});return()=>{active=false}},[authResolved,account,services]);
  const role=roleResult?.account===account?roleResult.role:'loading';
  if(!authResolved||role==='loading')return <main className="empty-card" role="status"><b>正在验证运营权限</b><p>后台数据只对运营账户开放。</p></main>;
  if(!state.user){const returnTo=safeReturnTo(`${location.pathname}${location.search}`);return <Navigate replace to={`/app/login?returnTo=${encodeURIComponent(returnTo)}`}/>}
  if(role!=='operations')return <main className="empty-card"><b>无权访问运营后台</b><p>当前账户不是运营角色。</p></main>;
  return children;
}

export function LegacyAppRedirect(){
  const location=useLocation();const suffix=location.pathname.slice('/app-demo'.length);return <Navigate replace to={`/app${suffix}${location.search}${location.hash}`}/>;
}
