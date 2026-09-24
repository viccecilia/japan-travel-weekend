import {useEffect,useRef,useState} from 'react';
import type {SupabaseTripRoomRepository} from '../shared/integrations/supabaseProduction';
import type {PassengerLocale} from '../shared/i18n/passengerLocale';
import {passengerRound1Copy} from '../shared/i18n/passengerRound1';

type Point={latitude:number;longitude:number;accuracy:number|null;sampledAt:string};
type Props={repository:SupabaseTripRoomRepository;groupId:string;locale:PassengerLocale;disabled?:boolean;staff?:boolean;presentation?:'toolbar'|'more';onActivated?:()=>void};
export function PassengerLocationShare({repository,groupId,locale,disabled=false,staff=false,presentation='toolbar',onActivated}:Props){
 const c=passengerRound1Copy[locale].location;
 const [rows,setRows]=useState<Awaited<ReturnType<SupabaseTripRoomRepository['loadPassengerLocations']>>>([]);
 const [point,setPoint]=useState<Point|null>(null),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 const [panel,setPanel]=useState(false);
 const mounted=useRef(true),lock=useRef(false);
 useEffect(()=>{
  mounted.current=true;let active=true;
  const refresh=()=>repository.loadPassengerLocations(groupId).then(data=>{if(active){setRows(data);setError(false)}}).catch(()=>{if(active)setError(true)});
  void refresh();const timer=window.setInterval(()=>void refresh(),30000);
  return()=>{active=false;mounted.current=false;window.clearInterval(timer)};
 },[repository,groupId]);
 const locate=()=>{
  if(lock.current||disabled)return;setPanel(true);if(rows.length)return;lock.current=true;setBusy(true);setError(false);
  const fail=()=>{lock.current=false;if(mounted.current){setBusy(false);setError(true)}};
  if(!navigator.geolocation){fail();return}
  navigator.geolocation.getCurrentPosition(position=>{
   lock.current=false;if(!mounted.current)return;setBusy(false);
   setPoint({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,sampledAt:new Date(position.timestamp).toISOString()});
  },fail,{maximumAge:0,timeout:12000,enableHighAccuracy:true});
 };
 const change=async(stop:boolean)=>{
  if(lock.current||(!stop&&(!point||disabled)))return;
  lock.current=true;setBusy(true);setError(false);
  try{
   const ok=stop?await repository.stopOwnLocationShare(groupId):await repository.publishOwnLocationShare(groupId,point!);
   if(!ok)throw Error('denied');
   const data=await repository.loadPassengerLocations(groupId);
   if(mounted.current){setRows(data);setPoint(null)}
  }catch{if(mounted.current)setError(true)}
  finally{lock.current=false;if(mounted.current)setBusy(false)}
 };
 if(staff)return <section className="room-panel"><h3>{c.staff}</h3>{error?<p role="alert">{c.failed}</p>:rows.length===0?<p>{c.empty}</p>:rows.map((row,index)=><p key={row.id}><a href={`https://www.google.com/maps/search/?api=1&query=${Number(row.latitude)},${Number(row.longitude)}`} target="_blank" rel="noreferrer">{row.display_name||`#${index+1}`} · {new Date(row.sampled_at).toLocaleTimeString(locale,{timeZone:'Asia/Tokyo'})}</a></p>)}</section>;
 return <>
  <button className={presentation==='more'?'pc-more-action':''} type="button" aria-label={c.send} title={c.send} disabled={disabled||busy} onClick={()=>{onActivated?.();locate()}}>{presentation==='more'?<><span aria-hidden="true">⌖</span><span>{c.send}</span></>:'⌖'}</button>
  {panel&&<div className="pc-modal-backdrop"><section className="pc-modal" role="dialog" aria-modal="true" aria-label={c.send} onKeyDown={event=>{if(event.key==='Escape'&&!busy){setPanel(false);setPoint(null)}}}>
   {point&&<><p>{c.confirm}</p><button disabled={busy||disabled} onClick={()=>void change(false)}>{busy?c.working:c.send}</button></>}
   {rows.length>0&&<><p>{c.shared}</p><button disabled={busy} onClick={()=>void change(true)}>{c.stop}</button></>}
   {error&&<p role="alert">{c.failed}</p>}
   {busy&&!point&&<p role="status">{c.working}</p>}
   <button disabled={busy} onClick={()=>{setPanel(false);setPoint(null);setError(false)}}>{passengerRound1Copy[locale].common.cancel}</button>
  </section></div>}
 </>;
}
