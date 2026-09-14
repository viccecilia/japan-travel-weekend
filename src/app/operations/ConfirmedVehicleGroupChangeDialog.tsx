import {useEffect, useRef, useState} from 'react';
import type {OperationsCalendarDeparture,OperationsDepartureVehicle,OperationsSnapshot,OperationsVehicleGroupChange} from '../../shared/integrations/supabaseOperations';
import {OperationsEditorDialog} from './OperationsEditorDialog';

type Result={ok:boolean;error:string|null};

export function ConfirmedVehicleGroupChangeDialog({departure,vehicle,snapshot,onClose,onLoadHistory,onRequest,onApply,onRetryNotification,onApplied}:{
  departure:OperationsCalendarDeparture;
  vehicle:OperationsDepartureVehicle;
  snapshot:OperationsSnapshot;
  onClose:()=>void;
  onLoadHistory:(groupId:string)=>Promise<{data:OperationsVehicleGroupChange[];error:string|null}>;
  onRequest:(input:{vehicleGroupId:string;expectedGroupVersion:number;vehicleId:string;driverId:string;reason:string;idempotencyKey:string})=>Promise<{ok:boolean;id:string|null;error:string|null}>;
  onApply:(requestId:string)=>Promise<Result>;
  onRetryNotification:(requestId:string)=>Promise<Result>;
  onApplied:()=>Promise<void>;
}) {
  const groupId=vehicle.vehicleGroupId??'';
  const [vehicleId,setVehicleId]=useState(vehicle.vehicleId??'');
  const [driverId,setDriverId]=useState(vehicle.driverId??'');
  const [reason,setReason]=useState('');
  const [history,setHistory]=useState<OperationsVehicleGroupChange[]>([]);
  const [historyError,setHistoryError]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const idempotencyKey=useRef(crypto.randomUUID());
  const pending=history.find(item=>item.status==='pending');
  const latest=history[0];
  const selectedVehicle=snapshot.vehicles.find(item=>item.id===vehicleId);
  const changed=vehicleId!==vehicle.vehicleId||driverId!==vehicle.driverId;
  const dirty=!pending&&(changed||reason.length>0);
  const canRequest=Boolean(groupId&&vehicleId&&driverId&&changed&&reason.trim().length>=5);
  const reloadHistory=async()=>{
    const result=await onLoadHistory(groupId);
    setHistory(result.data);
    setHistoryError(result.error??'');
    return result;
  };
  useEffect(()=>{let active=true;void onLoadHistory(groupId).then(result=>{if(active){setHistory(result.data);setHistoryError(result.error??'');}});return()=>{active=false};},[groupId,onLoadHistory]);
  const saveRequest=async()=>{
    if(!canRequest||busy)return;
    setBusy(true);setNotice('');
    const result=await onRequest({vehicleGroupId:groupId,expectedGroupVersion:vehicle.groupVersion??1,vehicleId,driverId,reason:reason.trim(),idempotencyKey:idempotencyKey.current});
    if(result.ok){await reloadHistory();setNotice('变更申请已保存；原车辆和司机仍然生效。请复核后确认应用。');}
    else setNotice(`申请保存失败：${result.error??'未知错误'}。原安排未改变。`);
    setBusy(false);
  };
  const apply=async()=>{
    if(!pending||busy)return;
    setBusy(true);setNotice('');
    const result=await onApply(pending.id);
    if(result.ok){await onApplied();await reloadHistory();setNotice('变更已原子应用；旅行团、订单和群聊保持不变，新司机需要重新确认任务。');}
    else setNotice(`应用失败：${result.error??'未知错误'}。原安排继续生效。`);
    setBusy(false);
  };
  const retryNotification=async()=>{
    if(!latest||busy)return;
    setBusy(true);const result=await onRetryNotification(latest.id);await reloadHistory();
    setNotice(result.ok?'通知已重新进入测试发送队列。':`通知重试失败：${result.error??'未知错误'}`);setBusy(false);
  };
  return <OperationsEditorDialog title={`变更车辆/司机 · ${departure.tripTitle}`} eyebrow="CONFIRMED GROUP CHANGE" description="先保存申请，确认应用前服务端会重新校验容量、资格、可用状态、时间冲突和版本。" size="workflow" dirty={dirty} busy={busy} onClose={onClose} footer={<div className="operations-task-actions"><button type="button" disabled={busy} onClick={onClose}>关闭</button>{pending?<button className="button" type="button" disabled={busy} onClick={()=>void apply()}>{busy?'正在应用…':'确认应用变更'}</button>:<button className="button" type="button" disabled={busy||!canRequest} onClick={()=>void saveRequest()}>{busy?'正在保存…':'保存变更申请'}</button>}</div>}>
    <div className="operations-dialog-fields vehicle-group-change-fields">
      <section className="operations-dialog-section vehicle-group-change-current"><h3>当前有效安排</h3><dl><div><dt>旅行团ID</dt><dd>{groupId}</dd></div><div><dt>团号</dt><dd>{vehicle.sequence}号车</dd></div><div><dt>车辆</dt><dd>{vehicle.vehicleCode||vehicle.vehicleLabel||'未记录'}</dd></div><div><dt>司机</dt><dd>{vehicle.driverName||'未记录'}</dd></div><div><dt>计划/实车容量</dt><dd>{vehicle.plannedPassengers}人 / {vehicle.sellableCapacity??vehicle.assignmentCapacity}席</dd></div><div><dt>群聊ID</dt><dd>{vehicle.roomId||'尚未建立'}</dd></div></dl></section>
      <label>新车辆<select aria-label="新车辆" value={vehicleId} disabled={Boolean(pending)} onChange={event=>setVehicleId(event.target.value)}><option value="">选择车辆</option>{snapshot.vehicles.map(item=><option key={item.id} value={item.id} disabled={item.id!==vehicle.vehicleId&&item.status!=='available'}>{item.registration_identifier} · {item.model_name||item.vehicle_type_key} · 实车{item.sellable_capacity}席 · {item.id===vehicle.vehicleId?'当前车辆':item.status==='available'?'可用':'不可用'}</option>)}</select></label>
      <label>新司机<select aria-label="新司机" value={driverId} disabled={Boolean(pending)} onChange={event=>setDriverId(event.target.value)}><option value="">选择司机</option>{snapshot.drivers.map(item=>{const qualified=!selectedVehicle||item.driver_vehicle_qualifications.some(q=>q.vehicle_type_key===selectedVehicle.vehicle_type_key);return <option key={item.id} value={item.id} disabled={item.id!==vehicle.driverId&&(item.status!=='available'||!qualified)}>{item.display_name} · {item.id===vehicle.driverId?'当前司机':item.status!=='available'?'不可用':qualified?'可用':'车型不符'}</option>})}</select></label>
      <label className="full">变更原因<textarea aria-label="变更原因" value={reason} disabled={Boolean(pending)} maxLength={500} placeholder="必填，至少5个字；将写入不可覆盖的审计记录。" onChange={event=>setReason(event.target.value)}/></label>
      {pending&&<section className="operations-dialog-section"><h3>待应用申请</h3><p>{pending.priorVehicleCode} / {pending.priorDriverName} → {pending.requestedVehicleCode} / {pending.requestedDriverName}</p><p>原因：{pending.reason}</p><small>保存于 {new Date(pending.requestedAt).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'})}；原安排当前仍有效。</small></section>}
      {latest?.status==='applied'&&<section className="operations-dialog-section"><h3>最近变更记录</h3><p>{latest.priorVehicleCode} / {latest.priorDriverName} → {latest.requestedVehicleCode} / {latest.requestedDriverName}</p><p>通知状态：{latest.notificationStatus}</p>{latest.notificationStatus==='failed'&&<button type="button" disabled={busy} onClick={()=>void retryNotification()}>重试通知</button>}</section>}
      {historyError&&<p className="operations-error full" role="alert">变更记录读取失败：{historyError}</p>}
      {notice&&<p className={notice.includes('失败')?'operations-error full':'operations-notice full'} role="status">{notice}</p>}
      <p className="operations-hint full">本流程不会拆团、并团、移动乘客或新建群聊。已完成旅行团由服务端拒绝修改。</p>
    </div>
  </OperationsEditorDialog>;
}
