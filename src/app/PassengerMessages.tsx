import {useEffect,useState} from 'react';
import {Link,Navigate,useSearchParams} from 'react-router-dom';
import {useApp} from './store';

type Room={room_id:string;vehicle_group_id:string;room_status:string;opens_at:string|null;departs_at:string|null;vehicle_label:string|null};
export function PassengerMessages(){
 const {services}=useApp();
 const [search,setSearch]=useSearchParams();
 const [result,setResult]=useState<{loading:boolean;error:string;rooms:Room[]}>({loading:true,error:'',rooms:[]});
 const [retry,setRetry]=useState(0);
 const requested=search.get('vehicleGroup');
 useEffect(()=>{
  let active=true;
  const read=async()=>{
   if(!services){if(active)setResult({loading:false,error:'行程群服务未配置',rooms:[]});return}
   try{
    const orders=await services.loadOwnOrders();
    if(orders.error)throw new Error(orders.error);
    const preferred=await services.tripRoom.loadAccessibleRoom();
    if(preferred.error)throw new Error(preferred.error);
    const preferredRoom=preferred.data as Room|null;
    const fulfilments=await Promise.all(orders.data.filter(o=>['paid','confirmed'].includes(o.status)).map(o=>services.loadOwnOrderFulfilment(o.id)));
    const ids=[...new Set([...fulfilments.map(f=>(f as {vehicle_group_id?:string}|null)?.vehicle_group_id),preferredRoom?.vehicle_group_id,requested].filter((id):id is string=>!!id))];
    const rooms=await Promise.all(ids.map(async id=>{
     const response=await services.tripRoom.loadAccessibleRoom(id);
     if(response.error)throw new Error(response.error);
     const room=response.data as Room|null;
     if(requested===id&&!room)throw new Error('无法访问指定旅行团');
     if(room&&room.vehicle_group_id!==id)throw new Error('无法访问指定旅行团');
     return room;
    }));
    const available=rooms.filter((room):room is Room=>!!room);
    if(preferredRoom&&!available.some(r=>r.vehicle_group_id===preferredRoom.vehicle_group_id))available.unshift(preferredRoom);
    if(active)setResult({loading:false,error:'',rooms:available});
   }catch(error){if(active)setResult({loading:false,error:error instanceof Error?error.message:'读取失败',rooms:[]})}
  };
  void read();
  window.addEventListener('focus',read);
  const timer=setInterval(()=>void read(),60000);
  return()=>{active=false;window.removeEventListener('focus',read);clearInterval(timer)};
 },[services,retry,requested]);
 const room=requested?result.rooms.find(r=>r.vehicle_group_id===requested):result.rooms[0];
 const missingRequested=!!requested&&!room&&!result.loading&&!result.error;
 const openRooms=result.rooms.filter(candidate=>candidate.room_status==='open');
 // Never redirect an explicit deep link to a different group.
 if(!result.loading&&!result.error&&!missingRequested&&openRooms.length===1&&(!requested||requested===openRooms[0].vehicle_group_id)){
  return <Navigate replace to={'/app/my-trip/room?vehicleGroup='+encodeURIComponent(openRooms[0].vehicle_group_id)}/>;
 }
 return <section className="passenger-message-page">
  <h1>本车群聊</h1>
  {result.rooms.length>1&&<label>选择本车行程<select aria-label="选择本车行程" value={room?.vehicle_group_id??''} onChange={e=>setSearch({vehicleGroup:e.target.value})}><option value="" disabled>请选择</option>{result.rooms.map(r=><option value={r.vehicle_group_id} key={r.vehicle_group_id}>{r.departs_at?new Date(r.departs_at).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'}):'日期待确认'} · {r.vehicle_label??'本车'}</option>)}</select></label>}
  <div className="passenger-chat-state">
   {result.loading?<p role="status">正在读取本车行程群…</p>:result.error?<><p role="alert">{result.error}</p><button onClick={()=>setRetry(n=>n+1)}>重新读取</button></>:missingRequested?<p role="alert">无法访问指定旅行团</p>:!room?<><span aria-hidden="true">◇</span><h2>暂无可用行程群</h2><p>报名成功后，本车群将在规定时间自动开放。</p><Link to="/app/orders">查看我的订单</Link></>:room.room_status==='frozen'?<><span aria-hidden="true">♧</span><h2>群聊暂未开放</h2><p>将在出发前 24 小时自动开放。<br/>开放后可与司机、导游及同车游客联系。</p>{room.opens_at&&<p>开放时间：{new Date(room.opens_at).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'})}（日本时间）</p>}</>:room.room_status==='open'||room.room_status==='closed'?<><h2>{room.room_status==='open'?'本车群聊已开放':'行程群已关闭'}</h2><Link className="button" to={'/app/my-trip/room?vehicleGroup='+encodeURIComponent(room.vehicle_group_id)}>{room.room_status==='open'?'进入本车群聊':'查看历史群聊'}</Link></>:<p role="alert">群聊状态待确认</p>}
  </div>
  <div className="passenger-chat-composer"><input aria-label="聊天消息" disabled placeholder="进入开放的本车群后发送消息"/><button disabled>发送</button></div>
 </section>;
}
