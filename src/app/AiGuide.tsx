import {useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {useApp} from './store';
import type {VehicleGroupMeetingRow,VehicleGroupItineraryStopRow,PassengerTripContextRow} from '../shared/integrations/supabaseProduction';
import './tripCompanion.css';

type Room={room_id:string;vehicle_group_id:string;room_status:string};
type Snapshot={room:Room;meeting:VehicleGroupMeetingRow|null;stops:VehicleGroupItineraryStopRow[];context:PassengerTripContextRow|null;updatedAt:number};
export function AiGuide(){
  const {state}=useApp();const [query]=useSearchParams();
  const group=query.get('vehicleGroup');
  return <TripCompanion key={`${state.user?.email??'anonymous'}:${group??''}`} group={group}/>;
}
function TripCompanion({group}:{group:string|null}){
  const {services}=useApp();
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [position,setPosition]=useState<{at:number;accuracy:number}|null>(null);
  const [clock,setClock]=useState(Date.now);
  const refreshRef=useRef<()=>Promise<void>>(async()=>{});
  useEffect(()=>{
    let active=true;let refreshing=false;let subscription:{close():void}|null=null;
    if(!services||!group)return;
    const refresh=async()=>{
      if(refreshing)return;
      refreshing=true;
      try{
        const result=await services.tripRoom.loadAccessibleRoom(group);
        const room=result.data as Room|null;
        if(result.error||!room||room.vehicle_group_id!==group)throw new Error(result.error||'当前账号无法访问指定旅行团');
        const [meeting,stops,context]=await Promise.all([
          services.tripRoom.loadCurrentMeeting(group),services.tripRoom.loadItinerary(group),services.tripRoom.loadPassengerContext(group),
        ]);
        if(!active)return;
        setSnapshot({room,meeting,stops,context,updatedAt:Date.now()});setError('');setClock(Date.now());
        // A new gathering or closed room interrupts this POI only. It never opens another POI.
        if(meeting?.status==='active'||room.room_status!=='open')setSelected(null);
        if(!subscription){
          const live=await services.realtime.subscribeTripRoom(room.room_id,()=>void refresh(),()=>void refresh(),()=>void refresh());
          if(active)subscription=live;else live.close();
        }
      }catch(failure){if(active){setSnapshot(null);setError(failure instanceof Error?failure.message:'行程同步失败');setSelected(null)}}
      finally{refreshing=false}
    };
    refreshRef.current=refresh;void refresh();
    const timer=window.setInterval(()=>{setClock(Date.now());void refresh()},5000);
    window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);subscription?.close()};
  },[services,group]);
  if(!group||!services)return <section className="empty-card"><h1>本次行程导览</h1><p>请从本人已分配的旅行团进入；不会自动打开其他路线或使用模拟位置。</p><Link to="/app/my-trip">选择我的行程 →</Link></section>;
  const meeting=snapshot?.meeting;
  const gathering=meeting?.status==='active';
  const poi=snapshot?.stops.find(stop=>stop.id===selected);
  const acknowledge=async()=>{
    if(busy||!meeting)return;
    setBusy(true);setNotice('');
    try{
      const ok=await services.tripRoom.acknowledgeMeeting(group,meeting.revision);
      setNotice(ok?'已确认收到，请返回集合点；此确认不等于已上车。':'确认未保存，集合安排可能已更新，请重试。');
      await refreshRef.current();
    }catch{setNotice('网络异常，确认尚未保存，请重试。')}
    finally{setBusy(false)}
  };
  const locate=()=>{
    if(!navigator.geolocation){setNotice('当前设备不支持定位，请使用集合地址导航');return}
    navigator.geolocation.getCurrentPosition(value=>{
      setPosition({at:value.timestamp,accuracy:value.coords.accuracy});
      setNotice('仅记录本页位置更新时间，不将定位视为已到达或已上车。');
    },()=>{setPosition(null);setNotice('定位不可用，请手动导航并在本车群报告到达。')},{timeout:10000,maximumAge:0});
  };
  const validCoordinates=meeting&&Number.isFinite(meeting.latitude)&&Number.isFinite(meeting.longitude)&&Math.abs(meeting.latitude)<=90&&Math.abs(meeting.longitude)<=180;
  const destination=validCoordinates?`${meeting.latitude},${meeting.longitude}`:meeting?.meeting_address;
  return <div className="trip-companion">
    <header><small>本车行程</small><h1>{snapshot?.context?.trip_title??'本次行程导览'}</h1><Link to={`/app/trip-map?vehicleGroup=${encodeURIComponent(group)}`}>打开地图与导览 →</Link><Link to={`/app/my-trip/room?vehicleGroup=${encodeURIComponent(group)}`}>本车群与工作人员 →</Link></header>
    {error&&<section role="alert"><p>{error}。导览已暂停，集合信息需重新核对。</p><button onClick={()=>void refreshRef.current()}>重新读取</button></section>}
    {!snapshot&&!error&&<p role="status">正在读取本车路线与集合安排…</p>}
    {snapshot&&<section className={gathering?'trip-companion-meeting active':'trip-companion-meeting'}>
      <h2>{gathering?'正在集合 · 导览已暂停':'集合安排'}</h2>
      {meeting?<><b>{meeting.meeting_name}</b><p>{meeting.meeting_address}</p><time dateTime={meeting.meeting_at}>{new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(new Date(meeting.meeting_at))}</time>
        {gathering&&<p>{Math.max(0,Math.ceil((Date.parse(meeting.meeting_at)-clock)/60000))} 分钟 · 以工作人员最新通知为准</p>}
        {snapshot.context?.vehicle_label&&<p>{snapshot.context.vehicle_label} · {snapshot.context.staff_name}</p>}
        {destination&&<a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`} target="_blank" rel="noreferrer">返回集合点导航 →</a>}
        {gathering&&<button disabled={busy||meeting.acknowledged||Boolean(error)} onClick={()=>void acknowledge()}>{meeting.acknowledged?'已确认收到／返回中':busy?'正在确认':'确认收到'}</button>}
      </>:<p>集合信息尚未发布，请联系本车工作人员。</p>}
      <small>同步于 {new Date(snapshot.updatedAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Tokyo'})}；断网时不保证即时更新。</small>
    </section>}
    <section><h2>自由活动总览</h2><p>AI 实时回答尚未接通。当前仅展示本车已发布的景点与集合资料，不将静态资料冒充 AI 回答。</p>
      {snapshot?.stops.length===0&&<p>本车尚未发布景点节点。</p>}
      {snapshot?.stops.map(stop=><article key={stop.id}><h3>{stop.name}</h3><div className="trip-companion-actions">
        <button disabled={gathering||Boolean(error)} onClick={()=>{setSelected(null);setNotice(`自己游览：${stop.name}，请按时返回集合点。`)}}>自己游览</button>
        <button disabled={gathering||Boolean(error)||snapshot.room.room_status!=='open'} onClick={()=>setSelected(stop.id)}>查看景点资料</button>
      </div></article>)}
      {poi&&!gathering&&!error&&<section className="trip-companion-poi"><h2>{poi.name}</h2><p>{poi.meetingPointDescription||'暂无已发布说明，请咨询工作人员。'}</p><p>集合点：{poi.meetingPointName}</p><button onClick={()=>setSelected(null)}>结束阅读，返回自由活动总览</button></section>}
    </section>
    <section><h2>定位状态</h2><p>{position?`最近位置 ${Math.max(0,Math.floor((clock-position.at)/60000))} 分钟前${clock-position.at>120000?' · 已过期':''}，精度约 ${Math.round(position.accuracy)} 米`:'定位不可用／尚未授权'}</p><button onClick={locate}>读取当前位置</button><small>手机后台或锁屏可能暂停；本页不持续上传轨迹。</small></section>
    {notice&&<p role="status">{notice}</p>}
  </div>;
}
