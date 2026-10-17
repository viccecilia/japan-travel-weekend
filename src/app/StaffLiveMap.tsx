import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {MapSurface} from './MapSurface';
import {useApp} from './store';
import type {StaffTask} from './StaffPortal';
import type {MapMarker} from '../shared/services/mapSession';
import {mapMarkerGlyph} from '../shared/services/mapSession';

type DevicePoint={latitude:number;longitude:number;accuracy:number;sampledAt:string};
type PassengerPoint={id:string;subject_id:string;display_name:string|null;latitude:number;longitude:number;accuracy_meters:number|null;sampled_at:string;expires_at:string};
type DriverPoint={latitude:number;longitude:number;accuracy_meters?:number|null;updated_at?:string;expires_at?:string};

const devicePoint=(position:GeolocationPosition):DevicePoint=>({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,sampledAt:new Date(position.timestamp).toISOString()});
const pointTime=(value?:string)=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)):'--:--';
const isFresh=(value?:string,maximumAgeMs=30_000)=>Boolean(value&&Date.now()-new Date(value).getTime()<=maximumAgeMs);

export function StaffLiveMap({task}:{task:StaffTask}){
 const {services,state}=useApp();
 const [passengers,setPassengers]=useState<PassengerPoint[]>([]),[driver,setDriver]=useState<DriverPoint|null>(null),[local,setLocal]=useState<DevicePoint|null>(null);
 const [selected,setSelected]=useState<MapMarker|null>(null),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[sharing,setSharing]=useState(false),[locating,setLocating]=useState(false);
 const watchId=useRef<number|null>(null),session=useRef<{sessionId:string;expiresAt:string}|null>(null),sequence=useRef(0),sending=useRef(false),mounted=useRef(true),sharingRef=useRef(false),localRef=useRef<DevicePoint|null>(null);
 const refresh=useCallback(async()=>{
  if(!services)return;
  try{
   const [passengerRows,driverRow]=await Promise.all([services.tripRoom.loadPassengerLocations(task.vehicle_group_id),services.tripRoom.loadDriverLocation(task.vehicle_group_id)]);
   if(!mounted.current)return;
   const now=Date.now();setPassengers((passengerRows as PassengerPoint[]).filter(row=>new Date(row.expires_at).getTime()>now));setDriver(driverRow as DriverPoint|null);setLoading(false);
  }catch{if(mounted.current){setNotice('位置同步失败，请检查网络后重试。');setLoading(false)}}
 },[services,task.vehicle_group_id]);
 const publish=useCallback(async(point:DevicePoint)=>{
  if(!services||!sharingRef.current||sending.current)return;
  sending.current=true;
  try{
   let active=session.current;
   if(!active||new Date(active.expiresAt).getTime()-Date.now()<120000){active=await services.startStaffLocation(task.vehicle_group_id);session.current=active;sequence.current=0}
   if(!active)throw Error('session');
   sequence.current+=1;
   const ok=await services.publishStaffLocation(task.vehicle_group_id,active.sessionId,point.latitude,point.longitude,point.accuracy,point.sampledAt,sequence.current);
   if(!ok)throw Error('publish');
   if(mounted.current)setNotice(`车辆位置已共享 · ${pointTime(point.sampledAt)} · 精度约 ${Math.round(point.accuracy)} 米`);
  }catch{if(mounted.current){setSharing(false);setNotice('车辆位置共享已停止，请检查任务权限或网络后重试。')}}finally{sending.current=false}
 },[services,task.vehicle_group_id]);
 const startDeviceLocation=useCallback(()=>{
  if(watchId.current!==null)return;
  if(!navigator.geolocation){setNotice('当前设备不支持定位。');return}
  setLocating(true);setNotice('正在读取本机位置…');
  watchId.current=navigator.geolocation.watchPosition(position=>{const next=devicePoint(position);localRef.current=next;setLocal(next);setNotice(`本机位置 · ${pointTime(next.sampledAt)} · 精度约 ${Math.round(next.accuracy)} 米`);void publish(next)},error=>{if(watchId.current!==null){navigator.geolocation.clearWatch(watchId.current);watchId.current=null}setLocating(false);setNotice(error.code===1?'请允许浏览器使用定位后重试。':'暂时无法读取GPS位置，请到开阔处后重试。')},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
 },[publish]);
 const startShare=async()=>{
  if(!services||!local){startDeviceLocation();setNotice('请先取得本机GPS位置，再确认共享车辆位置。');return}
  setNotice('正在开启车辆位置共享…');const active=await services.startStaffLocation(task.vehicle_group_id);
  if(!active){setNotice('无法开启车辆位置共享，请确认本车任务和行程状态。');return}
  session.current=active;sequence.current=0;setSharing(true);sharingRef.current=true;await publish(local);await refresh();
 };
 const stopShare=async()=>{
  sharingRef.current=false;setSharing(false);session.current=null;sequence.current=0;
  const ok=services?await services.stopStaffLocation(task.vehicle_group_id):false;setNotice(ok?'车辆位置共享已停止；本机GPS仍只在本设备显示。':'当前没有可停止的车辆位置共享。');await refresh();
 };
 useEffect(()=>{mounted.current=true;queueMicrotask(()=>void refresh());const timer=window.setInterval(()=>void refresh(),10000);const resume=()=>{if(document.visibilityState==='visible'){void refresh();if(sharingRef.current&&localRef.current)void publish(localRef.current)}};window.addEventListener('online',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);return()=>{mounted.current=false;window.clearInterval(timer);window.removeEventListener('online',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);if(watchId.current!==null&&navigator.geolocation){navigator.geolocation.clearWatch(watchId.current);watchId.current=null}}},[refresh,publish]);
 const markers=useMemo<MapMarker[]>(()=>{
  const values:MapMarker[]=[];
  if(local)values.push({id:'device-local',type:'user_location',lat:local.latitude,lng:local.longitude,label:'我的GPS位置',subtitle:'仅本机显示',source:'device',updatedAt:local.sampledAt,accuracyMeters:local.accuracy});
  if(task.map_lat!=null&&task.map_lng!=null)values.push({id:'meeting',type:'meeting_point',lat:task.map_lat,lng:task.map_lng,label:task.meeting_name??'集合点',subtitle:task.meeting_address??undefined,source:'meeting',updatedAt:task.meeting_at??task.departs_at??undefined});
  if(driver)values.push({id:'vehicle-shared',type:'driver_vehicle',lat:Number(driver.latitude),lng:Number(driver.longitude),label:isFresh(driver.updated_at)?'已共享的车辆位置':'车辆最后位置',subtitle:isFresh(driver.updated_at)?'本车游客可查看':'更新已中断，不作为实时位置',source:'driver',updatedAt:driver.updated_at,accuracyMeters:driver.accuracy_meters});
  passengers.forEach((row,index)=>values.push({id:`passenger:${row.id}`,type:'shared_place',lat:Number(row.latitude),lng:Number(row.longitude),label:row.display_name?.trim()||`游客 ${index+1}`,subtitle:'游客主动共享',source:'staff_shared',updatedAt:row.sampled_at,accuracyMeters:row.accuracy_meters}));
  return values;
 },[local,task,driver,passengers]);
 const selectedMarker=(selected&&markers.find(marker=>marker.id===selected.id))??null;
 return <section className="staff-live-map" aria-label="本车实时地图">
  <MapSurface markers={markers} activeMarkerId={selectedMarker?.id} onMarkerClick={setSelected} interactive emptyLabel={loading?'正在同步位置…':'等待GPS位置'} unavailableLabel="地图暂不可用，请使用集合地址导航。" language={state.ui.locale}/>
  <div className="staff-map-controls">
   <button type="button" onClick={startDeviceLocation} disabled={locating}>{local?'本机GPS已开启':'显示我的位置'}</button>
   <button type="button" onClick={()=>void startShare()} disabled={!local||sharing}>{sharing?'车辆位置共享中':'共享车辆位置'}</button>
   <button type="button" onClick={()=>void stopShare()} disabled={!sharing&&!driver}>停止共享</button>
  </div>
  <p className="staff-map-notice" role="status">{notice||'游客只有主动授权后才会显示；位置约每10秒同步。'}</p>
  <div className="staff-map-markers" aria-label="地图位置列表">
   {markers.map(marker=><button type="button" key={marker.id} className={selectedMarker?.id===marker.id?'active':''} onClick={()=>setSelected(marker)}><span aria-hidden="true">{mapMarkerGlyph[marker.type]}</span><b>{marker.label}</b><small>{marker.updatedAt?`更新 ${pointTime(marker.updatedAt)}`:'时间待确认'}{marker.accuracyMeters!=null?` · 精度约 ${Math.round(Number(marker.accuracyMeters))} 米`:''}</small></button>)}
  </div>
  {selectedMarker&&<article className="staff-map-detail"><h2>{selectedMarker.label}</h2>{selectedMarker.subtitle&&<p>{selectedMarker.subtitle}</p>}<p>{selectedMarker.updatedAt?`更新时间：${pointTime(selectedMarker.updatedAt)}`:'更新时间待确认'}{selectedMarker.accuracyMeters!=null?` · GPS精度约 ${Math.round(Number(selectedMarker.accuracyMeters))} 米`:''}</p><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${selectedMarker.lat},${selectedMarker.lng}`}>使用地图导航</a></article>}
  {task.map_lat!=null&&task.map_lng!=null&&<a className="button full" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${task.map_lat},${task.map_lng}`}>导航至集合点</a>}
 </section>;
}
