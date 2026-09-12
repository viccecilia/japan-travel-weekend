import {useMemo,useState,type ReactNode} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {useApp} from '../store';
import {runtimeMode} from '../../shared/config/businessRules';
import {stripeMode} from '../../shared/integrations/stripeClient';

type NavigationChild={label:string;to:string;match?:(pathname:string,search:string)=>boolean};
type NavigationGroup={label:string;children:NavigationChild[]};
const navigation:NavigationGroup[]=[
  {label:'工作台',children:[{label:'今日概况',to:'/app/operations'},{label:'待办与异常',to:'/app/operations/incidents'}]},
  {label:'产品与班次',children:[{label:'产品管理',to:'/app/operations/products'},{label:'班次日历',to:'/app/operations/departures'},{label:'价格与销售时间',to:'/app/operations/departures?panel=pricing'}]},
  {label:'素材与营销',children:[{label:'首页推荐',to:'/app/operations/marketing'},{label:'季节专题',to:'/app/operations/marketing?panel=seasonal'}]},
  {label:'订单与售后',children:[{label:'全部订单',to:'/app/operations/orders',match:(pathname,search)=>pathname==='/app/operations/orders'&&!new URLSearchParams(search).has('afterSale')},{label:'取消退款',to:'/app/operations/orders?afterSale=refund_pending'}]},
  {label:'调度与运行',children:[{label:'当日运行',to:'/app/operations/run'},{label:'异常工单',to:'/app/operations/incidents'}]},
  {label:'司导与车辆',children:[{label:'司导档案',to:'/app/operations/staff'},{label:'车辆档案',to:'/app/operations/vehicles'},{label:'申请与请假',to:'/app/operations/staff-requests'}]},
  {label:'推广与财务',children:[{label:'推广与佣金',to:'/app/operations/commissions'},{label:'提现与对账',to:'/app/operations/commissions?queue=payout'}]},
  {label:'数据统计',children:[{label:'经营 Dashboard',to:'/app/operations/analytics'}]},
  {label:'系统设置',children:[{label:'系统状态与版本',to:'/app/operations/settings'}]},
];
const childActive=(item:NavigationChild,pathname:string,search:string)=>{
  if(item.match)return item.match(pathname,search);
  const [targetPath,targetQuery='']=item.to.split('?');
  if(pathname === targetPath){
    if(!targetQuery){
      const params = new URLSearchParams(search);
      return !params.has('panel') && !params.has('queue');
    }
    return targetQuery.split('#')[0].split('&').every((pair) => search.includes(pair));
  }
  if(targetPath === '/app/operations/products' && pathname.startsWith('/app/operations/products/')) return true;
  return false;
};
const titleFromPath=(pathname:string,search:string)=>{
  for(const entry of normalizedTitleMap){
    if(entry.test(pathname,search)) return {group:entry.group,page:entry.page};
  }
  for(const group of navigation){
    const active = group.children.find((item) => childActive(item, pathname, search));
    if (active) return {group:group.label,page:active.label};
  }
  return {group:'运营后台',page:'管理页面'};
};
const pageTitle=(pathname:string,search:string)=>titleFromPath(pathname,search);
const normalizedTitleMap: Array<{test:(pathname:string,search:string)=>boolean;group:string;page:string}> = [
  {test:(pathname)=>pathname.startsWith('/app/operations/products/'),group:'产品与班次',page:'产品管理'},
  {
    test:(pathname,search)=>pathname === '/app/operations/orders' && new URLSearchParams(search).has('afterSale'),
    group:'订单与售后',
    page:'取消退款',
  },
];

export function OperationsLayout({children}:{children:ReactNode}){
  const {state,services,clearIdentity}=useApp();const location=useLocation();const navigate=useNavigate();
  const current=useMemo(()=>pageTitle(location.pathname,location.search),[location.pathname,location.search]);
  const [open,setOpen]=useState(false);const [collapsed,setCollapsed]=useState<Record<string,boolean>>({});const [signingOut,setSigningOut]=useState(false);
  const signOut=async()=>{if(signingOut)return;setSigningOut(true);try{if(services)await services.signOut();clearIdentity();navigate('/app/login?returnTo=%2Fapp%2Foperations',{replace:true});}finally{setSigningOut(false)}};
  return <div className="operations-shell">
    <button className="operations-nav-scrim" aria-label="关闭后台导航" aria-hidden={!open} tabIndex={open?0:-1} data-open={open} onClick={()=>setOpen(false)}/>
    <aside className="operations-sidebar" data-open={open} aria-label="运营后台导航"><div className="operations-brand"><span>JAPAN TRAVEL WEEKEND</span><b>运营管理后台</b></div>
      <nav id="operations-navigation">{navigation.map(group=>{const groupActive=group.children.some(item=>childActive(item,location.pathname,location.search));const isCollapsed=collapsed[group.label]??!groupActive;return <section className="operations-nav-group" key={group.label} data-active={groupActive}><button type="button" aria-expanded={!isCollapsed} onClick={()=>setCollapsed(value=>({...value,[group.label]:!isCollapsed}))}><span>{group.label}</span><span aria-hidden="true">{isCollapsed?'＋':'－'}</span></button>{!isCollapsed&&<div>{group.children.map(item=>{const active=childActive(item,location.pathname,location.search);return <Link key={item.label} aria-current={active?'page':undefined} className={active?'active':''} to={item.to} onClick={()=>setOpen(false)}>{item.label}</Link>})}</div>}</section>})}</nav>
      <a className="operations-passenger-link" href="/app" target="_blank" rel="noreferrer">预览游客端 ↗</a></aside>
    <div className="operations-workspace"><header className="operations-topbar"><button className="operations-menu-button" aria-expanded={open} aria-controls="operations-navigation" onClick={()=>setOpen(value=>!value)}>菜单</button><div><small>运营后台 / {current.group} / {current.page}</small><h1>{current.page}</h1></div><div className="operations-account"><span>{stripeMode==='test'||runtimeMode!=='production'?'内部测试':'正式环境'}</span><b>{state.user?.email??'未登录'}</b><button disabled={signingOut} onClick={()=>void signOut()}>{signingOut?'正在退出':'退出'}</button></div></header><div className="operations-content">{children}</div></div>
  </div>;
}
