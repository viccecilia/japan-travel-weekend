import {useState} from 'react';
import QRCode from 'qrcode';
import {Link} from 'react-router-dom';
import {useApp} from './store';

export function ProfileInvite(){
 const {services}=useApp();
 const [code,setCode]=useState('');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [qr,setQr]=useState('');
 const [showQr,setShowQr]=useState(false);
 const link=code?`${window.location.origin}/app/create-account?ref=${encodeURIComponent(code)}`:'';
 async function load(){
  if(busy||code)return;
  setBusy(true);setNotice('');
  try{const result=await services?.loadOwnReferralSummary();if(!result?.code)throw new Error('推荐信息暂时无法读取，请重试');setCode(result.code)}
  catch(error){setNotice(error instanceof Error?error.message:'推荐信息读取失败')}
  finally{setBusy(false)}
 }
 async function copy(){try{await navigator.clipboard.writeText(link);setNotice('链接已复制 ✓')}catch{setNotice('复制失败，请长按推荐链接复制')}}
 async function share(){try{if(navigator.share){await navigator.share({title:'Japan Travel Weekend',url:link});setNotice('已打开系统分享')}else{await copy()}}catch(error){setNotice(error instanceof Error&&error.name==='AbortError'?'已取消分享':'分享失败，请复制链接分享')}}
 async function toggleQr(){if(showQr){setShowQr(false);return}try{if(!qr)setQr(await QRCode.toDataURL(link,{width:220,margin:1,errorCorrectionLevel:'M'}));setShowQr(true)}catch{setNotice('二维码生成失败，请重试')}}
 return <details className="profile-invite" onToggle={e=>{if(e.currentTarget.open)void load()}}>
  <summary className="profile-setting-row"><i aria-hidden="true">↗</i><span>邀请好友 / 分享 JTW</span><b aria-hidden="true">›</b></summary>
  <div className="profile-invite-body">
   {busy?<p role="status">正在读取推荐信息…</p>:code?<>
    <p>推荐码：<strong>{code}</strong></p>
    <label>专属推荐链接<input readOnly value={link} onFocus={e=>e.target.select()}/></label>
    <div className="profile-share-actions"><button type="button" onClick={()=>void copy()}>复制链接</button><button type="button" onClick={()=>void share()}>系统分享</button><button type="button" aria-expanded={showQr} onClick={()=>void toggleQr()}>二维码</button></div>
    {showQr&&<img className="profile-invite-qr" src={qr} alt="JTW 专属推荐二维码"/>}
    <Link to="/app/referral">查看推荐与奖励记录 ›</Link>
   </>:<button type="button" onClick={()=>void load()}>重新读取推荐信息</button>}
   {notice&&<p role="status">{notice}</p>}
  </div>
 </details>;
}
