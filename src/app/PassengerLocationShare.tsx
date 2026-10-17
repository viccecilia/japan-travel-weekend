import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {SupabaseTripRoomRepository} from '../shared/integrations/supabaseProduction';
import type {PassengerLocale} from '../shared/i18n/passengerLocale';
import {locationShareCopy} from '../shared/i18n/locationShare';

type Point={latitude:number;longitude:number;accuracy:number|null;sampledAt:string};
type Props={repository:SupabaseTripRoomRepository;groupId:string;locale:PassengerLocale;disabled?:boolean;staff?:boolean;presentation?:'toolbar'|'more';onActivated?:()=>void};
const sample=(position:GeolocationPosition):Point=>({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,sampledAt:new Date(position.timestamp).toISOString()});

export function PassengerLocationShare({repository,groupId,locale,disabled=false,staff=false,presentation='toolbar',onActivated}:Props){
 const c=locationShareCopy[locale];
 const [rows,setRows]=useState<Awaited<ReturnType<SupabaseTripRoomRepository['loadPassengerLocations']>>>([]);
 const [point,setPoint]=useState<Point|null>(null),[error,setError]=useState(false),[busy,setBusy]=useState(false),[tracking,setTracking]=useState(false);
 const [panel,setPanel]=useState(false);
 const mounted=useRef(true),lock=useRef(false),watch=useRef<number|null>(null),lastPoint=useRef<Point|null>(null),lastSentAt=useRef(0),sending=useRef(false),trackingRef=useRef(false),consentUntil=useRef(0);
 const refresh=useCallback(async()=>{try{const data=await repository.loadPassengerLocations(groupId);if(mounted.current){setRows(data);setError(false)}}catch{if(mounted.current)setError(true)}},[repository,groupId]);
 const publish=useCallback(async(next:Point,force=false)=>{
  lastPoint.current=next;
  if(consentUntil.current>0&&Date.now()>=consentUntil.current){trackingRef.current=false;setTracking(false);if(watch.current!==null&&navigator.geolocation){navigator.geolocation.clearWatch(watch.current);watch.current=null}return}
  if(sending.current||(!force&&Date.now()-lastSentAt.current<8000))return;
  sending.current=true;
  try{const ok=await repository.publishOwnLocationShare(groupId,next);if(!ok)throw Error('denied');lastSentAt.current=Date.now();if(mounted.current)setError(false)}catch{if(mounted.current)setError(true)}finally{sending.current=false}
 },[repository,groupId]);
 const stopWatch=useCallback(()=>{if(watch.current!==null&&navigator.geolocation){navigator.geolocation.clearWatch(watch.current);watch.current=null}trackingRef.current=false;setTracking(false)},[]);
 const startWatch=useCallback((initial:Point)=>{
  if(!navigator.geolocation||watch.current!==null)return;
  trackingRef.current=true;setTracking(true);lastPoint.current=initial;
  watch.current=navigator.geolocation.watchPosition(position=>void publish(sample(position)),()=>mounted.current&&setError(true),{maximumAge:5000,timeout:15000,enableHighAccuracy:true});
 },[publish]);
 useEffect(()=>{
  mounted.current=true;queueMicrotask(()=>void refresh());const timer=window.setInterval(()=>void refresh(),30000);
  const resume=()=>{if(document.visibilityState==='visible'){void refresh();if(trackingRef.current&&lastPoint.current)void publish(lastPoint.current,true)}};
  window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{mounted.current=false;window.clearInterval(timer);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);if(watch.current!==null&&navigator.geolocation){navigator.geolocation.clearWatch(watch.current);watch.current=null}};
 },[refresh,publish]);
 const locate=()=>{
  if(lock.current||disabled)return;setPanel(true);lock.current=true;setBusy(true);setError(false);
  const fail=()=>{lock.current=false;if(mounted.current){setBusy(false);setError(true)}};
  if(!navigator.geolocation){fail();return}
  navigator.geolocation.getCurrentPosition(position=>{lock.current=false;if(!mounted.current)return;setBusy(false);setPoint(sample(position))},fail,{maximumAge:0,timeout:12000,enableHighAccuracy:true});
 };
 const start=async()=>{
  if(lock.current||!point||disabled)return;lock.current=true;setBusy(true);setError(false);
  try{const ok=await repository.publishOwnLocationShare(groupId,point);if(!ok)throw Error('denied');lastSentAt.current=Date.now();consentUntil.current=Date.now()+15*60_000;startWatch(point);setPoint(null);await refresh()}
  catch{if(mounted.current)setError(true)}finally{lock.current=false;if(mounted.current)setBusy(false)}
 };
 const stop=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError(false);stopWatch();
  try{const ok=await repository.stopOwnLocationShare(groupId);if(!ok)throw Error('denied');lastPoint.current=null;consentUntil.current=0;await refresh()}
  catch{if(mounted.current)setError(true)}finally{lock.current=false;if(mounted.current)setBusy(false)}
 };
 if(staff)return <section className="room-panel"><h3>{c.staff}</h3>{error?<p role="alert">{c.failed}</p>:rows.length===0?<p>{c.empty}</p>:rows.map((row,index)=><p key={row.id}><a href={`https://www.google.com/maps/search/?api=1&query=${Number(row.latitude)},${Number(row.longitude)}`} target="_blank" rel="noreferrer">{row.display_name||`#${index+1}`} · {new Date(row.sampled_at).toLocaleTimeString(locale,{timeZone:'Asia/Tokyo'})}{row.accuracy_meters!=null?` · ±${Math.round(Number(row.accuracy_meters))}m`:''}</a></p>)}</section>;
 return <>
  <button className={presentation==='more'?'pc-more-action':''} type="button" aria-label={c.send} title={c.send} disabled={disabled||busy} onClick={()=>{onActivated?.();locate()}}>{presentation==='more'?<><span aria-hidden="true">⌖</span><span>{c.send}</span></>:'⌖'}</button>
  {panel&&createPortal(<div className="pc-modal-backdrop"><section className="pc-modal" role="dialog" aria-modal="true" aria-label={c.send} onKeyDown={event=>{if(event.key==='Escape'&&!busy){setPanel(false);setPoint(null)}}}>
   {point&&<><p>{c.confirm}</p><button disabled={busy||disabled} onClick={()=>void start()}>{busy?c.working:c.send}</button></>}
   {rows.length>0&&<><p>{tracking?c.shared:c.paused}</p>{!tracking&&!point&&<button disabled={busy||disabled} onClick={locate}>{c.resume}</button>}<button disabled={busy} onClick={()=>void stop()}>{c.stop}</button></>}
   {error&&<p role="alert">{c.failed}</p>}
   {busy&&!point&&<p role="status">{c.working}</p>}
   <button disabled={busy} onClick={()=>{setPanel(false);setPoint(null);setError(false)}}>{c.cancel}</button>
  </section></div>,document.body)}
 </>;
}
