import {useMemo,useState} from 'react';
import {kiyomizuArashiyamaGuide} from '../shared/data/guidedTours';
import {googleWalkingUrl,guidedTourProgress,nodesForBranch} from '../shared/services/guidedTour';
import type {GuidedTourBranch,GuidedTourPosition} from '../shared/types/guidedTour';
import {GuidedTourPhoto} from '../shared/components/GuidedTourPhoto';

export function AiGuide(){
  const [branch,setBranch]=useState<GuidedTourBranch>('meal-first');
  const [position,setPosition]=useState<GuidedTourPosition>({latitude:35.00042,longitude:135.77931});
  const [completed,setCompleted]=useState<Set<string>>(()=>new Set());
  const [notice,setNotice]=useState('当前为模拟定位演练，不会上传或保存您的轨迹。');
  const nodes=useMemo(()=>nodesForBranch(kiyomizuArashiyamaGuide,branch),[branch]);
  const progress=guidedTourProgress(kiyomizuArashiyamaGuide,branch,position,completed);
  const locate=()=>navigator.geolocation?navigator.geolocation.getCurrentPosition(value=>{setPosition({latitude:value.coords.latitude,longitude:value.coords.longitude,accuracy:value.coords.accuracy});setNotice('已读取本次位置；离开本页后不持续追踪。')},()=>setNotice('无法读取定位，请检查浏览器定位权限。'),{enableHighAccuracy:true,timeout:10000,maximumAge:10000}):setNotice('当前设备不支持定位。');
  const simulate=(id:string)=>{const item=nodes.find(node=>node.id===id);if(item){setPosition({latitude:item.latitude,longitude:item.longitude,accuracy:10});setNotice(`模拟到达：${item.name}`)}};
  const complete=()=>{if(!progress)return;setCompleted(value=>new Set([...value,progress.current.id]));setNotice(`已完成：${progress.current.name}`)};
  return <div className="ai-guide-page">
    <header><span>AI WALK COMPANION</span><h1>边走边玩</h1><p>根据当前位置、标准游玩顺序和集合时间给出下一步提示。</p></header>
    <section className="ai-guide-privacy"><b>定位保护</b><span>仅在本页开启时读取；不向其他游客显示精确位置。实地使用前需再次授权。</span></section>
    <section className="ai-guide-branch"><h2>岚山游玩方式</h2><div><button className={branch==='meal-first'?'active':''} onClick={()=>setBranch('meal-first')}>先吃饭</button><button className={branch==='sightseeing-first'?'active':''} onClick={()=>setBranch('sightseeing-first')}>先游玩</button></div></section>
    {progress&&<section className="ai-guide-current" aria-live="polite"><small>现在前往 · 约 {progress.distanceMeters}m</small><h2>{progress.current.name}</h2><GuidedTourPhoto node={progress.current}/><p>{progress.current.shortInstruction}</p><div><a href={googleWalkingUrl(progress.current)} target="_blank" rel="noreferrer">步行导航</a><button onClick={complete}>{progress.reached?'我已到达':'标记完成'}</button></div>{progress.current.verificationStatus==='field-check-required'&&<em>该点位等待实地校准，以司机当天集合通知为准</em>}</section>}
    <button className="button secondary full" type="button" onClick={locate}>读取我的当前位置</button>
    <p className="notice" role="status">{notice}</p>
    <section className="ai-guide-route"><h2>今日游玩顺序</h2>{nodes.map((node,index)=><button type="button" key={node.id} className={`${completed.has(node.id)?'done':''} ${progress?.current.id===node.id?'current':''}`} onClick={()=>simulate(node.id)}><i>{completed.has(node.id)?'✓':index+1}</i><span><b>{node.name}</b><small>{node.estimatedMinutes} 分钟 · 点击模拟到达</small></span>{progress?.current.id===node.id&&<strong>当前</strong>}</button>)}</section>
  </div>
}
