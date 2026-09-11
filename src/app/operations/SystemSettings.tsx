import {useEffect,useState} from 'react';
import {stripeMode} from '../../shared/integrations/stripeClient';

const testEntrances=[
  ['游客端','test1@daitora','/app/login'],
  ['司导端','drtest1@daitora','/staff'],
  ['管理端','dadmin1@daitora','/app/operations'],
] as const;

export function SystemSettings(){
  const [status,setStatus]=useState<{ok:boolean;mode:string;version?:string;checks:Record<string,boolean>}|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;void fetch('/api/ready',{headers:{accept:'application/json'}}).then(async response=>{if(!response.ok)throw new Error('服务状态读取失败');return response.json()}).then(body=>{if(active)setStatus(body)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'服务状态读取失败')});return()=>{active=false}},[]);
  return <main className="operations-page">
    <header className="operations-hero"><div><span>SYSTEM SETTINGS</span><h1>系统设置</h1><p>测试入口、运行环境和外部服务状态集中在这里，不占用日常运营工作台。</p></div></header>
    <section className="operations-section"><header><div><span>测试工具</span><h2>测试账户与入口</h2></div><small>密码通过内部安全渠道保管</small></header><div className="operations-account-list">{testEntrances.map(([role,account,url])=><article key={role}><div><span>{role}</span><strong>{account}</strong></div><a href={url} target="_blank" rel="noreferrer">打开</a><small>{url}</small></article>)}</div></section>
    <section id="environment-status" className="operations-section"><header><div><span>上线安全</span><h2>系统环境状态</h2></div><small>真实收款必须经过单独上线审批</small></header>
      {error?<div className="operations-error" role="alert"><b>读取失败</b><p>{error}</p><button type="button" onClick={()=>window.location.reload()}>重新读取</button></div>:!status?<p role="status">正在读取服务状态…</p>:<><div className="operations-kpis"><article><span>运行环境</span><strong>{status.mode==='test'?'内部测试':status.mode}</strong></article><article><span>前端版本</span><strong title={__JTW_BUILD_SHA__}>{__JTW_BUILD_SHA__.slice(0,12)}</strong></article><article><span>API版本</span><strong title={status.version}>{status.version?.slice(0,12)??'未报告'}</strong></article><article><span>数据库</span><strong>{status.checks.database?'正常':'待检查'}</strong></article><article><span>Stripe</span><strong>{stripeMode==='test'&&status.checks.stripeModeSafe?'测试模式':'关闭/待配置'}</strong></article><article><span>支付回调</span><strong>{status.checks.webhookSecret?'已配置':'未配置'}</strong></article><article><span>通知回执</span><strong>{status.checks.notificationReceiptSecret?'已配置':'未配置'}</strong></article><article><span>Google 地点照片</span><strong>{import.meta.env.VITE_GOOGLE_PLACES_READY==='true'?'已验证':'未就绪'}</strong></article><article><span>邮件</span><strong>未接通</strong></article><article><span>搜索引擎</span><strong>禁止收录</strong></article></div><p className={status.ok?'operations-ok':'operations-cutoff-alert'}>{status.ok?'核心测试服务已就绪；真实付款仍保持关闭。':'核心测试服务尚未全部就绪，支付继续关闭。'}</p></>}
    </section>
  </main>;
}
