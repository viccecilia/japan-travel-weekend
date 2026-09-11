import {useState,type ReactNode} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {useApp} from '../store';
import {runtimeMode} from '../../shared/config/businessRules';

const navigation=[
  {label:'工作台',to:'/app/operations',match:(path:string)=>path==='/app/operations'},
  {label:'产品与班次',to:'/app/operations/products',match:(path:string)=>path.startsWith('/app/operations/products')||path.startsWith('/app/operations/departures')},
  {label:'订单与售后',to:'/app/operations?view=orders#orders-overview',match:(_:string,search:string)=>search.includes('view=orders')},
  {label:'调度与运行',to:'/app/operations/run',match:(path:string)=>path.startsWith('/app/operations/run')||path.startsWith('/app/operations/incidents')},
  {label:'司导与车辆',to:'/app/operations?view=resources#resource-registry',match:(_:string,search:string)=>search.includes('view=resources')},
  {label:'推广与财务',to:'/app/operations/commissions',match:(path:string)=>path.startsWith('/app/operations/commissions')},
  {label:'内容与营销',to:'/app/operations/marketing',match:(path:string)=>path.startsWith('/app/operations/marketing')},
  {label:'系统设置',to:'/app/operations/settings',match:(path:string)=>path.startsWith('/app/operations/settings')},
] as const;

const pageTitle=(pathname:string,search:string)=>{
  if(pathname.startsWith('/app/operations/products'))return '产品管理';
  if(pathname.startsWith('/app/operations/departures'))return '班次与价格';
  if(pathname.startsWith('/app/operations/run'))return '每日运行';
  if(pathname.startsWith('/app/operations/incidents'))return '运行异常';
  if(pathname.startsWith('/app/operations/commissions'))return '推广与财务';
  if(pathname.startsWith('/app/operations/marketing'))return '内容与营销';
  if(pathname.startsWith('/app/operations/settings'))return '系统设置';
  if(search.includes('view=orders'))return '订单与售后';
  if(search.includes('view=resources'))return '司导与车辆';
  return '工作台';
};

export function OperationsLayout({children}:{children:ReactNode}){
  const {state,services,clearIdentity}=useApp();
  const location=useLocation();
  const navigate=useNavigate();
  const [open,setOpen]=useState(false);
  const [signingOut,setSigningOut]=useState(false);
  const title=pageTitle(location.pathname,location.search);
  const signOut=async()=>{
    if(signingOut)return;
    setSigningOut(true);
    try{if(services)await services.signOut();clearIdentity();navigate('/app/login?returnTo=%2Fapp%2Foperations',{replace:true});}
    finally{setSigningOut(false)}
  };
  return <div className="operations-shell">
    <button className="operations-nav-scrim" aria-label="关闭后台导航" aria-hidden={!open} tabIndex={open?0:-1} data-open={open} onClick={()=>setOpen(false)}/>
    <aside className="operations-sidebar" data-open={open} aria-label="运营后台导航">
      <div className="operations-brand"><span>JT WEEKEND</span><b>运营管理后台</b></div>
      <nav id="operations-navigation">{navigation.map(item=>{const active=item.match(location.pathname,location.search);return <Link key={item.label} aria-current={active?'page':undefined} className={active?'active':''} to={item.to} onClick={()=>setOpen(false)}>{item.label}</Link>})}</nav>
      <a className="operations-passenger-link" href="/app" target="_blank" rel="noreferrer">预览游客端</a>
    </aside>
    <div className="operations-workspace">
      <header className="operations-topbar">
        <button className="operations-menu-button" aria-expanded={open} aria-controls="operations-navigation" onClick={()=>setOpen(value=>!value)}>菜单</button>
        <div><small>运营后台 / {title}</small><h1>{title}</h1></div>
        <div className="operations-account"><span>{runtimeMode==='production'?'测试环境':'开发环境'}</span><b>{state.user?.email??'未登录'}</b><button disabled={signingOut} onClick={()=>void signOut()}>{signingOut?'正在退出':'退出'}</button></div>
      </header>
      <div className="operations-content">{children}</div>
    </div>
  </div>;
}
