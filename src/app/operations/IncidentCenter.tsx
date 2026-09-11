import {useCallback,useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {useApp} from '../store';
import type {OperationsIncident} from '../../shared/integrations/supabaseOperations';

export function IncidentCenter(){
 const {services}=useApp();const [params]=useSearchParams();
 const departureId=params.get('departure')??undefined,vehicleGroupId=params.get('vehicleGroup')??undefined,date=params.get('date')??'';
 const [items,setItems]=useState<OperationsIncident[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const result=await services?.operations.listIncidents({departureId,vehicleGroupId});setItems(result?.data??[]);setError(result?.error??'')}catch(reason){setError(reason instanceof Error?reason.message:'异常工单读取失败')}finally{setLoading(false)}},[services,departureId,vehicleGroupId]);
 useEffect(()=>{void load()},[load]);
 const update=async(item:OperationsIncident,status:'in_progress'|'resolved')=>{if(!services||busy)return;const resolution=status==='resolved'?window.prompt('填写处理结果（至少3个字）','')??'':'';if(status==='resolved'&&resolution.trim().length<3)return;setBusy(item.id);const result=await services.operations.resolveIncident({id:item.id,status,resolution});setBusy('');if(!result.ok)setError(`处理失败：${result.error}`);else await load()};
 const back=`/app/operations/run${date?`?date=${encodeURIComponent(date)}${departureId?`&departure=${encodeURIComponent(departureId)}`:''}`:''}`;
 return <main className="operations-page"><header className="operations-hero"><div><span>INCIDENT DETAIL</span><h1>运行异常工单</h1><p>筛选条件由运行详情带入；处理完成后重新读取工单和运行统计。</p></div><Link className="button secondary" to={back}>返回运行详情</Link></header><section className="operations-section"><p>班次：{departureId??'全部'} · 车辆组：{vehicleGroupId??'全部'}</p>{loading?<p role="status">正在读取关联异常…</p>:error?<p role="alert">{error}</p>:items.length===0?<p>此筛选范围没有异常工单。</p>:<div className="operations-dispatch-list">{items.map(item=><article id={`incident-${item.id}`} key={item.id}><div><b>{item.summary}</b><span>{item.severity} · {item.status}</span></div><small>{item.kind} · {new Date(item.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'})}</small>{item.resolution&&<p>处理记录：{item.resolution}</p>}<div className="operations-task-actions">{item.status!=='resolved'&&<button disabled={busy===item.id} onClick={()=>void update(item,'in_progress')}>认领并处理</button>}{item.status!=='resolved'&&<button disabled={busy===item.id} onClick={()=>void update(item,'resolved')}>关闭工单</button>}{item.orderId&&<Link to={`/app/operations?view=orders&order=${encodeURIComponent(item.orderId)}#orders-overview`}>关联订单</Link>}</div></article>)}</div>}</section></main>;
}
