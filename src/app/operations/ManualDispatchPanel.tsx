import {useEffect, useMemo, useState} from 'react';
import type {DispatchPlanDraft, OperationsCalendarDeparture, OperationsSnapshot} from '../../shared/integrations/supabaseOperations';
import {validateVehicleAllocations} from './OrdersCenter';

type Allocation = {vehicleId: string; driverId: string; passengers: number};

export function ManualDispatchPanel({departure, snapshot, busy, onSave}: {
  departure: OperationsCalendarDeparture;
  snapshot: OperationsSnapshot;
  busy: boolean;
  onSave: (tasks: DispatchPlanDraft[]) => Promise<void>;
}) {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  useEffect(() => {
    setAllocations(departure.vehicles.length ? departure.vehicles.map((item) => ({vehicleId: item.vehicleId ?? '', driverId: item.driverId ?? '', passengers: item.plannedPassengers})) : [{vehicleId: '', driverId: '', passengers: departure.paidPassengers}]);
  }, [departure.id, departure.version]);
  const validation = useMemo(() => validateVehicleAllocations({allocations, plannedPassengers: departure.paidPassengers, vehicles: snapshot.vehicles, vehicleTypes: snapshot.vehicleTypes}), [allocations, departure.paidPassengers, snapshot]);
  const setRow = (index: number, patch: Partial<Allocation>) => setAllocations((rows) => rows.map((row, rowIndex) => rowIndex === index ? {...row, ...patch} : row));
  const save = async () => {
    if (!validation.ok || validation.total === 0) return;
    const tasks = allocations.map((row, index) => {
      const vehicle = snapshot.vehicles.find((item) => item.id === row.vehicleId);
      if (!vehicle) throw new Error(`第${index + 1}辆车不存在`);
      return {sequence: index + 1, vehicleType: vehicle.vehicle_type_key, capacity: vehicle.sellable_capacity, passengerCount: row.passengers, driverId: row.driverId, fleetVehicleId: row.vehicleId, startsAt: departure.departsAt, endsAt: departure.endsAt, operationalNotes: [], planningSource: 'manual_override' as const};
    });
    await onSave(tasks);
  };
  return <section className="operations-section manual-dispatch-panel" id="manual-dispatch"><header><div><span>手动配车</span><h2>{departure.tripTitle}</h2></div><small>本班已付款 {departure.paidPassengers} 人 · 当前计划 {validation.total} 人</small></header>
    {allocations.map((row, index) => { const selectedVehicle = snapshot.vehicles.find((item) => item.id === row.vehicleId); return <div className="manual-dispatch-row" key={index}><label>第 {index + 1} 辆车<select aria-label={`第${index + 1}辆车`} value={row.vehicleId} onChange={(event) => setRow(index, {vehicleId: event.target.value})}><option value="">选择车辆</option>{snapshot.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id} disabled={vehicle.status !== 'available' && vehicle.id !== row.vehicleId}>{vehicle.registration_identifier} · {vehicle.model_name || vehicle.vehicle_type_key} · 实车 {vehicle.sellable_capacity} 席 · {vehicle.status === 'available' ? '可用' : '不可用'}</option>)}</select></label><label>司机<select aria-label={`第${index + 1}辆司机`} value={row.driverId} onChange={(event) => setRow(index, {driverId: event.target.value})}><option value="">选择司机</option>{snapshot.drivers.map((driver) => {const qualified = !selectedVehicle || driver.driver_vehicle_qualifications.some((item) => item.vehicle_type_key === selectedVehicle.vehicle_type_key); return <option key={driver.id} value={driver.id} disabled={(driver.status !== 'available' || !qualified) && driver.id !== row.driverId}>{driver.display_name} · {driver.status === 'available' ? qualified ? '可用' : '车型不符' : '不可用'}</option>;})}</select></label><label>计划人数<input aria-label={`第${index + 1}辆计划人数`} type="number" min="0" max={selectedVehicle?.sellable_capacity ?? departure.paidPassengers} value={row.passengers} onChange={(event) => setRow(index, {passengers: Number(event.target.value)})} /></label>{allocations.length > 1 && <button type="button" onClick={() => setAllocations((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>移除此车</button>}</div>; })}
    <div className="operations-task-actions"><button type="button" onClick={() => setAllocations((rows) => [...rows, {vehicleId: '', driverId: '', passengers: 0}])}>新增下一辆</button><button className="button" type="button" disabled={busy || !validation.ok || validation.total === 0} onClick={() => void save()}>{busy ? '正在保存…' : '保存配车草稿'}</button></div>
    {validation.errors.length > 0 && <ul role="alert">{validation.errors.map((message) => <li key={message}>{message}</li>)}</ul>}
    <p className="operations-hint">计划人数可以小于实车容量，例如45席车辆计划40人；整批计划不得超过本班已付款人数。保存仅生成或更新派单草稿，不确认派单、不公开车辆、不发送通知。服务端再次校验实车容量、资源状态、车型资格、时间冲突和重复资源。</p>
  </section>;
}
