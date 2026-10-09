import {useEffect,useState,type FormEvent} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {validatePassword} from '../shared/config/authConfig';
import {passengerAuthPagesCopy,passengerLoginCopy} from '../shared/i18n/passengerLocale';
import {accessDestinationPath,referralCodeFromSearch,safePassengerReturnTo,safeReturnTo} from './auth';
import {useApp} from './store';

const authHref=(path:string,returnTo:string)=>`${path}${returnTo!=='/app'?`?returnTo=${encodeURIComponent(returnTo)}`:''}`;

function Unavailable(){
  const {state}=useApp();const copy=passengerAuthPagesCopy[state.ui.locale??'zh-CN'];
  return <div className="empty-card"><b>{copy.unavailableTitle}</b><p>{copy.unavailableText}</p></div>;
}

export function CreateAccount(){
  const {services,setState,state}=useApp();const nav=useNavigate();const location=useLocation();const locale=state.ui.locale??'zh-CN';const copy=passengerAuthPagesCopy[locale];const loginCopy=passengerLoginCopy[locale];const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [showPassword,setShowPassword]=useState(false);const referralCode=referralCodeFromSearch(location.search);const returnTo=safePassengerReturnTo(new URLSearchParams(location.search).get('returnTo'));const loginHref=authHref('/app/login',returnTo);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget);const password=String(form.get('password'));if(!validatePassword(password)){setMessage(loginCopy.passwordRule);return}if(password!==String(form.get('confirmPassword'))){setMessage(copy.passwordMismatch);return}setBusy(true);setMessage('');const result=await services?.signUp(String(form.get('email')),password,String(form.get('displayName')),String(form.get('referral')??''),returnTo);setBusy(false);if(!result){setMessage(copy.createFailed);return}if(result.session&&result.user?.email){setState({...state,user:{email:result.user.email}});nav(returnTo,{replace:true});return}setMessage(copy.signupSubmitted)};
  if(!services?.authAvailable)return <Unavailable/>;
  return <><div className="app-title"><div className="eyebrow">{copy.createKicker}</div><h1>{copy.createTitle}</h1><p>{copy.createText}</p></div><form className="form" onSubmit={submit}><label>{copy.name}<input required name="displayName" maxLength={80} autoComplete="name"/></label><label>{copy.email}<input required name="email" type="email" autoComplete="email"/></label><label>{copy.password}<span className="password-input-row"><input required name="password" type={showPassword?'text':'password'} minLength={12} autoComplete="new-password" aria-describedby="password-rules"/><button type="button" className="text-button" aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?copy.hidePassword:copy.showPassword}</button></span></label><p id="password-rules" className="privacy">{loginCopy.passwordRule}</p><label>{copy.confirmPassword}<input required name="confirmPassword" type={showPassword?'text':'password'} minLength={12} autoComplete="new-password"/></label><label>{copy.referral} <small>{copy.optional}</small><input name="referral" autoComplete="off" defaultValue={referralCode} aria-describedby={referralCode?'create-referral-note':undefined}/>{referralCode&&<small id="create-referral-note">{copy.invitationFilled}</small>}</label><label className="check"><input required name="legal" type="checkbox"/> {copy.legalPrefix} <Link to="/terms">{copy.terms}</Link> {copy.and} <Link to="/privacy">{copy.privacy}</Link></label><button className="button full" disabled={busy}>{busy?copy.creating:copy.create}</button>{message&&<p role="status" className="notice">{message}</p>}<p className="login-create-account"><span>{copy.haveAccount}</span><Link to={loginHref}>{copy.login}</Link></p></form></>;
}

export function ForgotPassword(){
  const {services,state}=useApp();const location=useLocation();const copy=passengerAuthPagesCopy[state.ui.locale??'zh-CN'];const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const returnTo=safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(busy)return;const email=String(new FormData(event.currentTarget).get('email'));if(!services?.authAvailable){setMessage(copy.unavailableText);return}setBusy(true);await services.requestPasswordReset(email,returnTo);setBusy(false);setMessage(copy.resetSent)};
  return <><div className="app-title"><div className="eyebrow">{copy.securityKicker}</div><h1>{copy.forgotTitle}</h1><p>{copy.forgotText}</p></div><form className="form" onSubmit={submit}><label>{copy.email}<input required name="email" type="email" autoComplete="email"/></label><button className="button full" disabled={!services?.authAvailable||busy}>{busy?copy.sending:copy.sendReset}</button>{message&&<p role="status" className="notice">{message}</p>}<Link className="text-link" to={authHref('/app/login',returnTo)}>{copy.backLogin}</Link></form></>;
}

export function ResetPassword(){
  const {services,authResolved,clearIdentity,state}=useApp();const location=useLocation();const copy=passengerAuthPagesCopy[state.ui.locale??'zh-CN'];const loginCopy=passengerLoginCopy[state.ui.locale??'zh-CN'];const [message,setMessage]=useState('');const [complete,setComplete]=useState(false);const returnTo=safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const password=String(form.get('password'));if(!validatePassword(password)){setMessage(loginCopy.passwordRule);return}if(password!==String(form.get('confirmPassword'))){setMessage(copy.passwordMismatch);return}if(!await services?.updatePassword(password)){setMessage(copy.invalidReset);return}await services?.signOut();clearIdentity();setComplete(true)};
  if(!services?.authAvailable)return <Unavailable/>;if(!authResolved)return <div className="empty-card" role="status"><b>{copy.securityKicker}</b><p>{loginCopy.restoringText}</p></div>;if(complete)return <div className="empty-card" role="status"><b>{copy.passwordUpdated}</b><p>{copy.passwordUpdatedText}</p><Link className="button full" to={authHref('/app/login',returnTo)}>{copy.backLogin}</Link></div>;
  return <><div className="app-title"><div className="eyebrow">{copy.securityKicker}</div><h1>{copy.resetTitle}</h1></div><form className="form" onSubmit={submit}><label>{copy.newPassword}<input required name="password" type="password" minLength={12} autoComplete="new-password"/></label><p className="privacy">{loginCopy.passwordRule}</p><label>{copy.confirmNewPassword}<input required name="confirmPassword" type="password" minLength={12} autoComplete="new-password"/></label><button className="button full">{copy.updatePassword}</button>{message&&<p role="status" className="notice">{message}</p>}</form></>;
}

export function AuthCallback(){
  const {services,setState,state}=useApp();const location=useLocation();const nav=useNavigate();const [error,setError]=useState('');
  useEffect(()=>{let active=true;void(async()=>{if(!services?.authAvailable){setError('账户验证服务未配置。');return}const user=await services.currentUser();if(!active)return;if(!user?.email){setError('邮箱验证链接无效或已过期，请重新登录或申请新链接。');return}setState({...state,user:{email:user.email}});const destination=await services.currentAccessDestination();const rawReturnTo=new URLSearchParams(location.search).get('returnTo');const returnTo=destination==='passenger'?safePassengerReturnTo(rawReturnTo):safeReturnTo(rawReturnTo);if(active)nav(destination==='passenger'?returnTo:accessDestinationPath(destination),{replace:true})})();return()=>{active=false}},[services,location.search,nav,setState,state]);
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
