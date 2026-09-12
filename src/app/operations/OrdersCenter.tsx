import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../store";
import type {
  DispatchPlanDraft,
  OperationsOrder,
  OperationsSnapshot,
} from "../../shared/integrations/supabaseOperations";

type Allocation = { vehicleId: string; driverId: string; passengers: number };
const tokyoTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })
    : "时间待确认";

export function validateVehicleAllocations(input: {
  allocations: Allocation[];
  plannedPassengers: number;
  vehicles: OperationsSnapshot["vehicles"];
  vehicleTypes: OperationsSnapshot["vehicleTypes"];
}) {
  const errors: string[] = [];
  let total = 0;
  const vehicleIds = new Set<string>();
  const driverIds = new Set<string>();
  input.allocations.forEach((row, index) => {
    const vehicle = input.vehicles.find((item) => item.id === row.vehicleId);
    const label = `第${index + 1}辆`;
    if (!vehicle) errors.push(`${label}尚未选择车辆`);
    else {
      if (vehicle.status !== "available") errors.push(`${label}车辆当前不可用`);
      const capacity = vehicle.sellable_capacity;
      if (row.passengers > capacity)
        errors.push(
          `${label}分配 ${row.passengers} 人，超过实车可售 ${capacity} 席`,
        );
    }
    if (!row.driverId) errors.push(`${label}尚未选择司机`);
    if (row.vehicleId && vehicleIds.has(row.vehicleId))
      errors.push(`${label}重复选择车辆`);
    vehicleIds.add(row.vehicleId);
    if (row.driverId && driverIds.has(row.driverId))
      errors.push(`${label}重复选择司机`);
    driverIds.add(row.driverId);
    if (!Number.isInteger(row.passengers) || row.passengers < 0)
      errors.push(`${label}分配人数必须为非负整数`);
    total += Number.isFinite(row.passengers) ? row.passengers : 0;
  });
  if (total > input.plannedPassengers)
    errors.push(
      `整单分配 ${total} 人，超过计划人数 ${input.plannedPassengers} 人`,
    );
  return { ok: errors.length === 0, errors, total };
}

export function buildDispatchPlanDrafts(input: {
  allocations: Allocation[];
  departure: OperationsSnapshot["departures"][number];
  vehicles: OperationsSnapshot["vehicles"];
}): DispatchPlanDraft[] {
  const start = new Date(input.departure.departsAt ?? Date.now());
  const end = new Date(
    input.departure.endsAt ?? start.getTime() + 12 * 60 * 60 * 1000,
  );
  return input.allocations.map((row, index) => {
    const vehicle = input.vehicles.find((item) => item.id === row.vehicleId);
    if (!vehicle) throw new Error(`第${index + 1}辆车不存在`);
    return {
      sequence: index + 1,
      vehicleType: vehicle.vehicle_type_key,
      capacity: vehicle.sellable_capacity,
      passengerCount: row.passengers,
      driverId: row.driverId,
      fleetVehicleId: row.vehicleId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      operationalNotes: [],
      planningSource: "manual_override",
    };
  });
}

export function OrdersCenter() {
  const { services } = useApp();
  const [params] = useSearchParams();
  const from = params.get("from") ?? undefined,
    to = params.get("to") ?? undefined,
    status = params.get("status") ?? undefined,
    orderId = params.get("order") ?? undefined;
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [orders, setOrders] = useState<OperationsOrder[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [departureId, setDepartureId] = useState(params.get("departure") ?? "");
  const [allocations, setAllocations] = useState<Allocation[]>([
    { vehicleId: "", driverId: "", passengers: 0 },
  ]);
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = 20;
  const load = async () => {
    if (!services) {
      setError("运营数据服务未配置");
      return;
    }
    setError("");
    const [result, orderResult] = await Promise.all([
      services.operations.loadSnapshot(from, to),
      services.operations.listOrders({ from, to, status, orderId }),
    ]);
    setSnapshot(result.data);
    setOrders(orderResult.data);
    setError(result.error ?? orderResult.error ?? "");
  };
  useEffect(() => {
    void load();
  }, [services, from, to, status, orderId]);
  const departure = useMemo(
    () => snapshot?.departures.find((item) => item.id === departureId) ?? null,
    [snapshot, departureId],
  );
  const validation = useMemo(
    () =>
      validateVehicleAllocations({
        allocations,
        plannedPassengers: departure?.bookedSeats ?? 0,
        vehicles: snapshot?.vehicles ?? [],
        vehicleTypes: snapshot?.vehicleTypes ?? [],
      }),
    [allocations, departure, snapshot],
  );
  const setRow = (index: number, patch: Partial<Allocation>) =>
    setAllocations((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  const savePlan = async () => {
    if (
      !services ||
      !snapshot ||
      !departure ||
      !validation.ok ||
      validation.total === 0
    )
      return;
    setBusy(true);
    const tasks = buildDispatchPlanDrafts({
      allocations,
      departure,
      vehicles: snapshot.vehicles,
    });
    const result = await services.operations.saveDispatchPlan(
      departure.id,
      tasks,
    );
    setBusy(false);
    setNotice(
      result.ok
        ? "逐车派单草稿已保存，尚未通知司导。"
        : `保存失败：${result.error ?? "请检查资源可用性和时间冲突"}`,
    );
    if (result.ok) await load();
  };
  const visibleDepartures = snapshot?.departures ?? [];
  const pending = (snapshot?.cancellationRequests ?? []).filter(
    (item) =>
      params.get("afterSale") !== "refund_pending" ||
      !["completed", "rejected", "cancelled"].includes(item.status),
  );
  const selectedOrder = orderId
    ? orders.find((item) => item.orderId === orderId)
    : null;
  const pagedOrders = orders.slice((page - 1) * pageSize, page * pageSize);
  return (
    <main className="operations-page">
      <header className="operations-hero">
        <div>
          <span>ORDERS & AFTER-SALES</span>
          <h1>订单与售后</h1>
          <p>订单履约、取消退款与逐车派单使用同一份真实运营数据。</p>
        </div>
      </header>
      {notice && (
        <p role="status" className="operations-notice">
          {notice}
        </p>
      )}
      {error ? (
        <div role="alert" className="operations-error">
          <b>读取失败</b>
          <p>{error}</p>
          <button onClick={() => void load()}>重试</button>
        </div>
      ) : !snapshot ? (
        <p role="status">正在读取订单与班次…</p>
      ) : (
        <>
          <section className="operations-section">
            <header>
              <div>
                <span>真实订单</span>
                <h2>{selectedOrder ? "订单详情" : "订单列表"}</h2>
              </div>
              <small>
                {from || to ? `${from ?? "不限"} 至 ${to ?? "不限"} · ` : ""}共{" "}
                {orders.length} 笔
              </small>
            </header>
            {selectedOrder ? (
              <article className="operations-order-detail">
                <div>
                  <b>订单 {selectedOrder.orderId}</b>
                  <span>{selectedOrder.status}</span>
                </div>
                <p>
                  {selectedOrder.tripTitle} ·{" "}
                  {tokyoTime(selectedOrder.departsAt)}
                </p>
                <p>
                  乘客 {selectedOrder.passengerCount} 人 /{" "}
                  {selectedOrder.seatCount} 席 · 应付 ¥
                  {selectedOrder.amountJpy.toLocaleString("ja-JP")}
                </p>
                <p>
                  原价 ¥{selectedOrder.grossAmountJpy.toLocaleString("ja-JP")} ·
                  优惠 ¥
                  {selectedOrder.discountAmountJpy.toLocaleString("ja-JP")} ·
                  已退款 ¥
                  {selectedOrder.refundedAmountJpy.toLocaleString("ja-JP")}
                </p>
                <p>
                  推荐来源：{selectedOrder.referralCode ?? "无"} · 本车：
                  {selectedOrder.vehicleLabel ?? "尚未分车"} · 司机：
                  {selectedOrder.driverName ?? "尚未派单"}
                </p>
                <p>售后状态：{selectedOrder.refundStatus ?? "无进行中申请"}</p>
                <Link
                  to={`/app/operations/orders?${new URLSearchParams(
                    Object.fromEntries(
                      [
                        ["from", from],
                        ["to", to],
                        ["status", status],
                        ["page", String(page)],
                      ].filter((entry): entry is [string, string] =>
                        Boolean(entry[1]),
                      ),
                    ),
                  ).toString()}`}
                >
                  返回订单列表
                </Link>
              </article>
            ) : (
              <>
                {pagedOrders.length === 0 ? (
                  <p className="operations-empty">当前筛选没有订单。</p>
                ) : (
                  <div className="operations-dispatch-list">
                    {pagedOrders.map((item) => (
                      <article key={item.orderId}>
                        <div>
                          <b>{item.tripTitle}</b>
                          <span>{item.status}</span>
                        </div>
                        <span>
                          订单尾号 {item.orderId.slice(-8)} ·{" "}
                          {tokyoTime(item.createdAt)}
                        </span>
                        <small>
                          {item.passengerCount} 人 / {item.seatCount} 席 · ¥
                          {item.amountJpy.toLocaleString("ja-JP")} ·{" "}
                          {item.vehicleLabel ?? "尚未分车"}
                        </small>
                        <Link
                          to={`/app/operations/orders?${new URLSearchParams({ ...Object.fromEntries(params), order: item.orderId }).toString()}`}
                        >
                          查看订单详情
                        </Link>
                      </article>
                    ))}
                  </div>
                )}
                <div className="operations-task-actions">
                  {page > 1 && (
                    <Link
                      to={`/app/operations/orders?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page - 1) }).toString()}`}
                    >
                      上一页
                    </Link>
                  )}
                  {page * pageSize < orders.length && (
                    <Link
                      to={`/app/operations/orders?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page + 1) }).toString()}`}
                    >
                      下一页
                    </Link>
                  )}
                </div>
              </>
            )}
          </section>
          <section className="operations-section">
            <header>
              <div>
                <span>班次订单</span>
                <h2>按班次查看订单汇总</h2>
              </div>
              <small>
                人数为已付款或已确认席位
                {from || to ? ` · ${from ?? "不限"} 至 ${to ?? "不限"}` : ""}
              </small>
            </header>
            {visibleDepartures.length === 0 ? (
              <p className="operations-empty">该日期范围没有班次或订单。</p>
            ) : (
              <div className="operations-departures">
                {visibleDepartures.map((item) => (
                  <article key={item.id}>
                    <header>
                      <div>
                        <b>{item.tripTitle}</b>
                        <small>
                          {tokyoTime(item.departsAt)} ·{" "}
                          {item.meetingName ?? "集合点待确认"}
                        </small>
                      </div>
                      <em>{item.status}</em>
                    </header>
                    <div>
                      <span>
                        订单 <b>{item.orderCount}</b>
                      </span>
                      <span>
                        计划人数 <b>{item.bookedSeats}</b>
                      </span>
                      <span>
                        容量 <b>{item.capacity}</b>
                      </span>
                      <span>
                        待付款 <b>{item.pendingOrders}</b>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDepartureId(item.id);
                        setAllocations([
                          {
                            vehicleId: "",
                            driverId: "",
                            passengers: item.bookedSeats,
                          },
                        ]);
                      }}
                    >
                      逐辆配车
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
          {departure && (
            <section className="operations-section" id="vehicle-allocation">
              <header>
                <div>
                  <span>逐辆配车</span>
                  <h2>{departure.tripTitle}</h2>
                </div>
                <small>
                  计划 {departure.bookedSeats} 人 · 已分配 {validation.total} 人
                </small>
              </header>
              {allocations.map((row, index) => (
                <div className="operations-grid" key={index}>
                  <label>
                    第 {index + 1} 辆车
                    <select
                      aria-label={`第${index + 1}辆车`}
                      value={row.vehicleId}
                      onChange={(event) =>
                        setRow(index, { vehicleId: event.target.value })
                      }
                    >
                      <option value="">选择车辆</option>
                      {snapshot.vehicles.map((vehicle) => (
                        <option
                          key={vehicle.id}
                          value={vehicle.id}
                          disabled={vehicle.status !== "available"}
                        >
                          {vehicle.registration_identifier} · 实车{" "}
                          {vehicle.sellable_capacity} 席 ·{" "}
                          {vehicle.status === "available" ? "可用" : "不可用"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    司机
                    <select
                      aria-label={`第${index + 1}辆司机`}
                      value={row.driverId}
                      onChange={(event) =>
                        setRow(index, { driverId: event.target.value })
                      }
                    >
                      <option value="">选择司机</option>
                      {snapshot.drivers.map((driver) => (
                        <option
                          key={driver.id}
                          value={driver.id}
                          disabled={driver.status !== "available"}
                        >
                          {driver.display_name} ·{" "}
                          {driver.status === "available" ? "可用" : "不可用"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    分配人数
                    <input
                      aria-label={`第${index + 1}辆分配人数`}
                      type="number"
                      min="0"
                      max={
                        snapshot.vehicles.find(
                          (vehicle) => vehicle.id === row.vehicleId,
                        )?.sellable_capacity ?? departure.bookedSeats
                      }
                      value={row.passengers}
                      onChange={(event) =>
                        setRow(index, {
                          passengers: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  {allocations.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAllocations((rows) =>
                          rows.filter((_, rowIndex) => rowIndex !== index),
                        )
                      }
                    >
                      移除此车
                    </button>
                  )}
                </div>
              ))}
              <div className="operations-task-actions">
                <button
                  type="button"
                  onClick={() =>
                    setAllocations((rows) => [
                      ...rows,
                      { vehicleId: "", driverId: "", passengers: 0 },
                    ])
                  }
                >
                  新增下一辆
                </button>
                <button
                  type="button"
                  disabled={busy || !validation.ok || validation.total === 0}
                  onClick={() => void savePlan()}
                >
                  {busy ? "正在保存" : "保存逐车派单草稿"}
                </button>
              </div>
              {validation.errors.length > 0 && (
                <ul role="alert">
                  {validation.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
              <p className="operations-hint">
                允许大车留空座，例如45席车辆可计划40人；整批分配不得超过本班次计划人数。服务端再次校验实车容量、车辆、司机、时间冲突及重复资源。
              </p>
            </section>
          )}
          <section className="operations-section">
            <header>
              <div>
                <span>取消退款</span>
                <h2>售后申请</h2>
              </div>
              <Link to="/app/operations/orders?afterSale=refund_pending">
                只看待处理
              </Link>
            </header>
            {pending.length === 0 ? (
              <p className="operations-empty">当前筛选没有取消或退款申请。</p>
            ) : (
              <div className="operations-dispatch-list">
                {pending.map((item) => (
                  <article key={item.id}>
                    <div>
                      <b>订单尾号 {item.orderId.slice(-6)}</b>
                      <span>{item.status}</span>
                    </div>
                    <span>
                      原因：{item.reasonCode} · 规则退款 {item.refundPercent}%
                    </span>
                    <small>
                      预计 ¥{item.estimatedRefundAmount} ·{" "}
                      {tokyoTime(item.requestedAt)}
                    </small>
                    <Link
                      to={`/app/operations/orders?order=${encodeURIComponent(item.orderId)}`}
                    >
                      查看关联订单
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
