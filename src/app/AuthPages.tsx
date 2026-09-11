import {useEffect,useState,type FormEvent} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {passwordRuleText,validatePassword} from '../shared/config/authConfig';
import {accessDestinationPath,referralCodeFromSearch,safeReturnTo} from './auth';
import {useApp} from './store';

const Unavailable=()=> <div className="empty-card"><b>账户服务暂未开放</b><p>当前不会创建账户、发送邮件或修改密码。</p></div>;

export function CreateAccount(){
  const {services,setState,state}=useApp();const nav=useNavigate();const location=useLocation();const [message,setMessage]=useState('');const referralCode=referralCodeFromSearch(location.search);const returnTo=safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const password=String(form.get('password'));if(!validatePassword(password)){setMessage(passwordRuleText);return}if(password!==String(form.get('confirmPassword'))){setMessage('两次输入的密码不一致');return}const accountType=String(form.get('accountType')) as 'passenger'|'driver'|'guide';const result=await services?.signUp(String(form.get('email')),password,accountType,String(form.get('displayName')),String(form.get('referral')??''),returnTo);if(!result){setMessage('暂时无法创建账户，请稍后再试。');return}if(result.session&&result.user?.email){setState({...state,user:{email:result.user.email}});nav(accountType==='passenger'?returnTo:'/app/account-status',{replace:true});return}setMessage(accountType==='passenger'?'注册申请已提交。请检查邮箱并完成验证；有效推荐码会保留注册归因，奖励按首笔有效订单规则结算。':'工作人员申请已提交。完成邮箱验证后，还需要等待后台审核，批准后账户才可进入司导端。')};
  if(!services?.authAvailable)return <Unavailable/>;
  return <><div className="app-title"><div className="eyebrow">统一账户入口</div><h1>创建账户</h1><p>一个邮箱只能属于一种账户类型；工作人员必须经后台审核。</p></div><form className="form" onSubmit={submit}><label>账户类型<select required name="accountType" defaultValue="passenger"><option value="passenger">游客</option><option value="driver">司机申请</option><option value="guide">导游申请</option></select></label><label>姓名<input required name="displayName" maxLength={80} autoComplete="name"/></label><label>电子邮箱<input required name="email" type="email" autoComplete="email"/></label><label>密码<input required name="password" type="password" minLength={12} autoComplete="new-password" aria-describedby="password-rules"/></label><p id="password-rules" className="privacy">{passwordRuleText}</p><label>再次输入密码<input required name="confirmPassword" type="password" minLength={12} autoComplete="new-password"/></label><label>推荐码 <small>选填</small><input name="referral" autoComplete="off" defaultValue={referralCode} aria-describedby={referralCode?'create-referral-note':undefined}/>{referralCode&&<small id="create-referral-note">已从邀请链接自动填写</small>}</label><label className="check"><input required name="legal" type="checkbox"/> 我已阅读并同意 <Link to="/terms">服务条款</Link> 和 <Link to="/privacy">隐私政策</Link></label><button className="button full">创建账户</button>{message&&<p role="status" className="notice">{message}</p>}<Link className="text-link" to="/app/login">已有账户？返回登录</Link></form></>;
}

export function ForgotPassword(){
  const {services}=useApp();const location=useLocation();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const returnTo=safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(busy)return;const email=String(new FormData(event.currentTarget).get('email'));if(!services?.authAvailable){setMessage('账户服务暂未开放，当前不会发送邮件。');return}setBusy(true);await services.requestPasswordReset(email,returnTo);setBusy(false);setMessage('如果该邮箱关联可用账户，我们会发送密码重置说明。请同时检查垃圾邮件文件夹。')};
  return <><div className="app-title"><div className="eyebrow">账户安全</div><h1>忘记密码</h1><p>提交后不会显示该邮箱是否已注册。</p></div><form className="form" onSubmit={submit}><label>电子邮箱<input required name="email" type="email" autoComplete="email"/></label><button className="button full" disabled={!services?.authAvailable||busy}>{busy?'正在发送…':'发送重置说明'}</button>{message&&<p role="status" className="notice">{message}</p>}<Link className="text-link" to={`/app/login${returnTo!=='/app'?`?returnTo=${encodeURIComponent(returnTo)}`:''}`}>返回登录</Link></form></>;
}

export function ResetPassword(){
  const {services,authResolved,clearIdentity}=useApp();const nav=useNavigate();const location=useLocation();const [message,setMessage]=useState('');const returnTo=safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const password=String(form.get('password'));if(!validatePassword(password)){setMessage(passwordRuleText);return}if(password!==String(form.get('confirmPassword'))){setMessage('两次输入的密码不一致');return}if(!await services?.updatePassword(password)){setMessage('重置链接无效或已过期，请重新申请密码重置。');return}setMessage('密码已更新，请使用新密码登录。');await services?.signOut();clearIdentity();nav(`/app/login${returnTo!=='/app'?`?returnTo=${encodeURIComponent(returnTo)}`:''}`,{replace:true})};
  if(!services?.authAvailable)return <Unavailable/>;if(!authResolved)return <div className="empty-card" role="status"><b>正在验证重置链接</b><p>请稍候。</p></div>;
  return <><div className="app-title"><div className="eyebrow">账户安全</div><h1>设置新密码</h1></div><form className="form" onSubmit={submit}><label>新密码<input required name="password" type="password" minLength={12} autoComplete="new-password"/></label><p className="privacy">{passwordRuleText}</p><label>再次输入新密码<input required name="confirmPassword" type="password" minLength={12} autoComplete="new-password"/></label><button className="button full">更新密码</button>{message&&<p role="status" className="notice">{message}</p>}</form></>;
}

export function AuthCallback(){
  const {services,setState,state}=useApp();const location=useLocation();const nav=useNavigate();const [error,setError]=useState('');
  useEffect(()=>{let active=true;void(async()=>{if(!services?.authAvailable){setError('账户验证服务未配置。');return}const user=await services.currentUser();if(!active)return;if(!user?.email){setError('邮箱验证链接无效或已过期，请重新登录或申请新链接。');return}setState({...state,user:{email:user.email}});const destination=await services.currentAccessDestination();const returnTo=safeReturnTo(new URLSearchParams(location.search).get('returnTo'));if(active)nav(destination==='passenger'?returnTo:accessDestinationPath(destination),{replace:true})})();return()=>{active=false}},[services,location.search,nav,setState,state]);
  return error?<div className="empty-card" role="alert"><b>账户验证失败</b><p>{error}</p><Link to="/app/login">返回登录</Link></div>:<div className="empty-card" role="status"><b>正在完成账户验证</b><p>请稍候，正在读取安全账户会话。</p></div>;
}

export function AccountStatus(){
  const {services,clearIdentity}=useApp();const location=useLocation();const nav=useNavigate();const [destination,setDestination]=useState<string|null>(null);const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;void services?.currentAccessDestination().then(value=>{if(active)setDestination(value)});return()=>{active=false}},[services]);
  if(!destination)return <div className="empty-card" role="status"><b>正在读取账户状态</b><p>请稍候。</p></div>;
  const params=new URLSearchParams(location.search);const passengerRequired=params.get('reason')==='passenger-required';const returnTo=safeReturnTo(params.get('returnTo'));
  if(passengerRequired&&destination!=='passenger')return <div className="empty-card" role="alert"><b>当前是工作人员账号，不能用于游客预约</b><p>游客订单与工作人员权限必须使用两个不同账号。系统已停止本次预约，没有进入工作人员页面，也没有提交订单。</p><button className="button full" disabled={busy} onClick={async()=>{setBusy(true);await services?.signOut();clearIdentity();nav(`/app/login?returnTo=${encodeURIComponent(returnTo)}`,{replace:true})}}>{busy?'正在退出…':'退出工作人员账号并登录游客账号'}</button><Link className="text-link" to={accessDestinationPath(destination)}>返回工作人员工作区</Link></div>;
  if(destination==='staff_pending')return <div className="empty-card"><b>工作人员账户等待审核</b><p>邮箱已经验证。后台批准司机或导游身份后，下次登录将自动进入司导端。</p><button className="button" onClick={()=>window.location.reload()}>刷新审核状态</button></div>;
  if(destination==='staff_blocked')return <div className="empty-card"><b>工作人员申请未通过或账户已暂停</b><p>当前不能进入游客端或司导端，请联系运营管理员。</p></div>;
  return <div className="empty-card"><b>账户已生效</b><p><Link to={accessDestinationPath(destination)}>进入对应工作区</Link></p></div>;
}
