import {useEffect,useState} from 'react';
import {Link,Navigate,useSearchParams} from 'react-router-dom';
import {useApp} from './store';
import {passengerRound1Copy} from '../shared/i18n/passengerRound1';

type Room={room_id:string;vehicle_group_id:string;room_status:string;opens_at:string|null;departs_at:string|null;vehicle_label:string|null};
export function PassengerMessages(){
 const {services,state}=useApp();
 const c=passengerRound1Copy[state.ui.locale??'zh-CN'].messages;
 const locale=state.ui.locale??'zh-CN';
 const [search,setSearch]=useSearchParams();
 const [result,setResult]=useState<{loading:boolean;error:string;rooms:Room[]}>({loading:true,error:'',rooms:[]});
 const [retry,setRetry]=useState(0);
 const requested=search.get('vehicleGroup');
 useEffect(()=>{
  let active=true;
  const read=async()=>{
   if(!services){if(active)setResult({loading:false,error:c.serviceUnavailable,rooms:[]});return}
   try{
    const orders=await services.loadOwnOrders();
    if(orders.error)throw new Error(orders.error);
    const preferred=await services.tripRoom.loadAccessibleRoom();
    if(preferred.error)throw new Error(preferred.error);
    const preferredRoom=preferred.data as Room|null;
    const fulfilments=await Promise.all(orders.data.filter(o=>['paid','confirmed','completed'].includes(o.status)).map(o=>services.loadOwnOrderFulfilment(o.id)));
    const ids=[...new Set([...fulfilments.map(f=>(f as {vehicle_group_id?:string}|null)?.vehicle_group_id),preferredRoom?.vehicle_group_id,requested].filter((id):id is string=>!!id))];
    const rooms=await Promise.all(ids.map(async id=>{
     const response=await services.tripRoom.loadAccessibleRoom(id);
     if(response.error)throw new Error(response.error);
     const room=response.data as Room|null;
     if(requested===id&&!room)throw new Error(c.noAccess);
     if(room&&room.vehicle_group_id!==id)throw new Error(c.noAccess);
     return room;
    }));
    const available=rooms.filter((room):room is Room=>!!room);
    if(preferredRoom&&!available.some(r=>r.vehicle_group_id===preferredRoom.vehicle_group_id))available.unshift(preferredRoom);
    if(active)setResult({loading:false,error:'',rooms:available});
  }catch(error){if(active)setResult({loading:false,error:error instanceof Error?error.message:c.readFailed,rooms:[]})}
  };
  void read();
  window.addEventListener('focus',read);
  const timer=setInterval(()=>void read(),60000);
  return()=>{active=false;window.removeEventListener('focus',read);clearInterval(timer)};
 },[services,retry,requested,c]);
 const room=requested?result.rooms.find(r=>r.vehicle_group_id===requested):result.rooms[0];
 const missingRequested=!!requested&&!room&&!result.loading&&!result.error;
 const openRooms=result.rooms.filter(candidate=>candidate.room_status==='open');
 // Never redirect an explicit deep link to a different group.
 if(!result.loading&&!result.error&&!missingRequested&&openRooms.length===1&&(!requested||requested===openRooms[0].vehicle_group_id)){
  return <Navigate replace to={'/app/my-trip/room?vehicleGroup='+encodeURIComponent(openRooms[0].vehicle_group_id)}/>;
 }
 return <section className="passenger-message-page">
  <h1>{c.title}</h1>
  {result.rooms.length>1&&<label>{c.chooseTrip}<select aria-label={c.chooseTrip} value={room?.vehicle_group_id??''} onChange={e=>setSearch({vehicleGroup:e.target.value})}><option value="" disabled>{c.choose}</option>{result.rooms.map(r=><option value={r.vehicle_group_id} key={r.vehicle_group_id}>{r.departs_at?new Date(r.departs_at).toLocaleString(locale,{timeZone:'Asia/Tokyo'}):c.datePending} · {r.vehicle_label??c.thisVehicle}</option>)}</select></label>}
  <div className="passenger-chat-state">
   {result.loading?<p role="status">{c.loading}</p>:result.error?<><p role="alert">{result.error}</p><button onClick={()=>setRetry(n=>n+1)}>{c.retry}</button></>:missingRequested?<p role="alert">{c.noAccess}</p>:!room?<><span aria-hidden="true">◇</span><h2>{c.emptyTitle}</h2><p>{c.emptyText}</p><Link to="/app/orders">{c.viewOrders}</Link></>:room.room_status==='frozen'?<><span aria-hidden="true">♧</span><h2>{c.lockedTitle}</h2><p>{c.lockedText}</p>{room.opens_at&&<p>{c.opensAt.replace('{date}',new Date(room.opens_at).toLocaleString(locale,{timeZone:'Asia/Tokyo'}))}</p>}</>:room.room_status==='open'||room.room_status==='closed'?<><h2>{room.room_status==='open'?c.openTitle:c.closedTitle}</h2><Link className="button" to={'/app/my-trip/room?vehicleGroup='+encodeURIComponent(room.vehicle_group_id)}>{room.room_status==='open'?c.enterChat:c.viewHistory}</Link></>:<p role="alert">{c.unknownStatus}</p>}
  </div>
  <div className="passenger-chat-composer"><input aria-label={c.inputLabel} disabled placeholder={c.inputPlaceholder}/><button disabled>{c.send}</button></div>
 </section>;
}
