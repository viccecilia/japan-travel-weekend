import {useState} from 'react';
import QRCode from 'qrcode';
import {Link} from 'react-router-dom';
import {useApp} from './store';
import {passengerRound1Copy} from '../shared/i18n/passengerRound1';

export function ProfileInvite(){
 const {services,state}=useApp();
 const c=passengerRound1Copy[state.ui.locale??'zh-CN'].invite;
 const [code,setCode]=useState('');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [qr,setQr]=useState('');
 const [showQr,setShowQr]=useState(false);
 const link=code?`${window.location.origin}/app/create-account?ref=${encodeURIComponent(code)}`:'';
 async function load(){
  if(busy||code)return;
  setBusy(true);setNotice('');
  try{const result=await services?.loadOwnReferralSummary();if(!result?.code)throw new Error(c.loadFailed);setCode(result.code)}
  catch(error){setNotice(error instanceof Error?error.message:c.loadFailed)}
  finally{setBusy(false)}
 }
 async function copy(){try{await navigator.clipboard.writeText(link);setNotice(c.copied)}catch{setNotice(c.copyFailed)}}
 async function share(){try{if(navigator.share){await navigator.share({title:'Japan Travel Weekend',url:link});setNotice(c.shareOpened)}else{await copy()}}catch(error){setNotice(error instanceof Error&&error.name==='AbortError'?c.shareCancelled:c.shareFailed)}}
 async function toggleQr(){if(showQr){setShowQr(false);return}try{if(!qr)setQr(await QRCode.toDataURL(link,{width:220,margin:1,errorCorrectionLevel:'M'}));setShowQr(true)}catch{setNotice(c.qrFailed)}}
 return <details className="profile-invite" onToggle={e=>{if(e.currentTarget.open)void load()}}>
  <summary className="profile-setting-row"><i aria-hidden="true">↗</i><span>{c.title}</span><b aria-hidden="true">›</b></summary>
  <div className="profile-invite-body">
   {busy?<p role="status">{c.loading}</p>:code?<>
    <p>{c.referralCode}：<strong>{code}</strong></p>
    <label>{c.referralLink}<input readOnly value={link} onFocus={e=>e.target.select()}/></label>
    <div className="profile-share-actions"><button type="button" onClick={()=>void copy()}>{c.copyLink}</button><button type="button" onClick={()=>void share()}>{c.systemShare}</button><button type="button" aria-expanded={showQr} onClick={()=>void toggleQr()}>{c.qr}</button></div>
    {showQr&&<img className="profile-invite-qr" src={qr} alt={c.qrAlt}/>}
    <Link to="/app/referral">{c.records} ›</Link>
   </>:<button type="button" onClick={()=>void load()}>{c.reload}</button>}
   {notice&&<p role="status">{notice}</p>}
  </div>
 </details>;
}
