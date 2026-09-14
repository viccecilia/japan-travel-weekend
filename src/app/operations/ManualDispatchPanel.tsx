import { useMemo, useState } from "react";
import type {
  DispatchPlanDraft,
  OperationsCalendarDeparture,
  OperationsSnapshot,
} from "../../shared/integrations/supabaseOperations";
import { validateVehicleAllocations } from "./OrdersCenter";
import { OperationsEditorDialog } from "./OperationsEditorDialog";

type Allocation = { vehicleId: string; driverId: string; passengers: number };

const initialAllocations = (departure: OperationsCalendarDeparture): Allocation[] =>
  departure.vehicles.length
    ? departure.vehicles.map((item) => ({
        vehicleId: item.vehicleId ?? "",
        driverId: item.driverId ?? "",
        passengers: item.plannedPassengers,
      }))
    : [{ vehicleId: "", driverId: "", passengers: departure.paidPassengers }];

export function ManualDispatchPanel({
  departure,
  snapshot,
  busy,
  onSave,
  onClose = () => undefined,
}: {
  departure: OperationsCalendarDeparture;
  snapshot: OperationsSnapshot;
  busy: boolean;
  onSave: (tasks: DispatchPlanDraft[]) => Promise<boolean>;
  onClose?: () => void;
}) {
  const [allocations, setAllocations] = useState<Allocation[]>(() => initialAllocations(departure));
  const [dirty, setDirty] = useState(false);
  const validation = useMemo(
    () => validateVehicleAllocations({ allocations, plannedPassengers: departure.paidPassengers, vehicles: snapshot.vehicles, vehicleTypes: snapshot.vehicleTypes }),
    [allocations, departure.paidPassengers, snapshot],
  );
  const actualAllocated = departure.vehicles.reduce(
    (total, item) => total + Number(item.bookedPassengers ?? 0),
    0,
  );
  const selectedCapacity = allocations.reduce(
    (total, row) => total + (snapshot.vehicles.find((item) => item.id === row.vehicleId)?.sellable_capacity ?? 0),
    0,
  );
  const setRow = (index: number, patch: Partial<Allocation>) => {
    setDirty(true);
    setAllocations((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };
  const save = async () => {
    if (!validation.ok || validation.total === 0) return;
    const tasks = allocations.map((row, index) => {
      const vehicle = snapshot.vehicles.find((item) => item.id === row.vehicleId);
      if (!vehicle) throw new Error(`第${index + 1}辆车不存在`);
      return {
        sequence: index + 1,
        vehicleType: vehicle.vehicle_type_key,
        capacity: vehicle.sellable_capacity,
        passengerCount: row.passengers,
        driverId: row.driverId,
        fleetVehicleId: row.vehicleId,
        startsAt: departure.departsAt,
        endsAt: departure.endsAt,
        operationalNotes: [],
        planningSource: "manual_override" as const,
      };
    });
    if (await onSave(tasks)) setDirty(false);
  };

  return (
    <OperationsEditorDialog
      title={`每车旅行团与手动配车 · ${departure.tripTitle}`}
      eyebrow="VEHICLE GROUP PLANNING"
      description="保存的是配车草稿；确认派单后才建立或更新可履约的每车旅行团。"
      size="workflow"
      dirty={dirty}
      busy={busy}
      onClose={onClose}
      footer={<div className="operations-task-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="button" type="button" disabled={busy || !validation.ok || validation.total === 0} onClick={() => void save()}>{busy ? "正在保存…" : "保存配车草稿"}</button></div>}
    >
      <div className="operations-dialog-metrics" aria-label="旅行团人数汇总">
        <article><span>本班总人数</span><b>{departure.paidPassengers}</b></article>
        <article><span>当前计划人数</span><b>{validation.total}</b></article>
        <article><span>已落实订单人数</span><b>{actualAllocated}</b></article>
        <article><span>所选实车总容量</span><b>{selectedCapacity}</b></article>
      </div>
      <div className="manual-dispatch-groups">
        {allocations.map((row, index) => {
          const selectedVehicle = snapshot.vehicles.find((item) => item.id === row.vehicleId);
          const existing = departure.vehicles[index];
          return (
            <section className="manual-dispatch-row" key={index}>
              <header>
                <div><b>第 {index + 1} 个每车旅行团</b><small>{existing?.assignmentId ? `已有配车记录 ${existing.assignmentId}` : "新增配车草稿"}</small></div>
                <span>实际已落实 {existing?.bookedPassengers ?? 0} 人</span>
              </header>
              <label>车辆<select aria-label={`第${index + 1}辆车`} value={row.vehicleId} onChange={(event) => setRow(index, { vehicleId: event.target.value })}><option value="">选择车辆</option>{snapshot.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id} disabled={vehicle.status !== "available" && vehicle.id !== row.vehicleId}>{vehicle.registration_identifier} · {vehicle.model_name || vehicle.vehicle_type_key} · 实车 {vehicle.sellable_capacity} 席 · {vehicle.status === "available" ? "可用" : "不可用"}</option>)}</select></label>
              <label>司机<select aria-label={`第${index + 1}辆司机`} value={row.driverId} onChange={(event) => setRow(index, { driverId: event.target.value })}><option value="">选择司机</option>{snapshot.drivers.map((driver) => { const qualified = !selectedVehicle || driver.driver_vehicle_qualifications.some((item) => item.vehicle_type_key === selectedVehicle.vehicle_type_key); return <option key={driver.id} value={driver.id} disabled={(driver.status !== "available" || !qualified) && driver.id !== row.driverId}>{driver.display_name} · {driver.status === "available" ? qualified ? "可用" : "车型不符" : "不可用"}</option>; })}</select></label>
              <label>计划人数<input aria-label={`第${index + 1}辆计划人数`} type="number" min="0" max={selectedVehicle?.sellable_capacity ?? departure.paidPassengers} value={row.passengers} onChange={(event) => setRow(index, { passengers: Number(event.target.value) })} /></label>
              {allocations.length > 1 && <button type="button" onClick={() => { setDirty(true); setAllocations((rows) => rows.filter((_, rowIndex) => rowIndex !== index)); }}>移除此车</button>}
            </section>
          );
        })}
      </div>
      <button type="button" className="button secondary" onClick={() => { setDirty(true); setAllocations((rows) => [...rows, { vehicleId: "", driverId: "", passengers: 0 }]); }}>新增下一辆</button>
      {validation.errors.length > 0 && <ul role="alert">{validation.errors.map((message) => <li key={message}>{message}</li>)}</ul>}
      <p className="operations-hint">未计划 {Math.max(0, departure.paidPassengers - validation.total)} 人。计划人数可以小于实车容量，例如45席车辆计划40人；整批计划不得超过本班已付款人数。保存仅生成或更新派单草稿，不确认派单、不公开车辆、不发送通知。服务端再次校验实车容量、资源状态、车型资格、时间冲突和重复资源。</p>
    </OperationsEditorDialog>
  );
}
