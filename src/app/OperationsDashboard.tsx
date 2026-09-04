import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { appConfig } from "../shared/config/businessRules";
import {
  optimizeFleet,
  type FleetPlan,
} from "../shared/operations/fleetOptimizer";
import { recommendDrivers } from "../shared/operations/driverAssignment";
import type {
  DispatchPlanDraft,
  OperationsDispatchTask,
  OperationsFulfilmentWorkItem,
  OperationsSnapshot,
} from "../shared/integrations/supabaseOperations";
import { useApp } from "./store";

const japanDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "时间待确认";
const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

function BankTransferReview({ item, busy, onResolve }: {
  item: OperationsFulfilmentWorkItem;
  busy: boolean;
  onResolve: (input: { orderId: string; decision: "confirmed" | "rejected"; reference?: string; reason?: string; idempotencyKey: string }) => Promise<void>;
}) {
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey] = useState(()=>crypto.randomUUID());
  return <div className="operations-bank-review">
    <label>入账参考<input value={reference} maxLength={100} onChange={(event)=>setReference(event.target.value)} placeholder="银行流水尾号或内部核账编号" aria-describedby={`bank-review-help-${item.id}`}/></label>
    <small id={`bank-review-help-${item.id}`}>仅填写核账编号，不得填写银行卡号或账户凭证。</small>
    <button disabled={busy||reference.trim().length<4} onClick={()=>void onResolve({orderId:item.orderId,decision:"confirmed",reference:reference.trim(),idempotencyKey})}>确认到账</button>
    <label>驳回原因<input value={reason} maxLength={500} onChange={(event)=>setReason(event.target.value)} placeholder="例如：未查询到对应入账"/></label>
    <button className="secondary" disabled={busy||reason.trim().length<3} onClick={()=>void onResolve({orderId:item.orderId,decision:"rejected",reason:reason.trim(),idempotencyKey})}>驳回并释放座位</button>
  </div>;
}

function AccountDeletionReview({request,busy,onReview}:{request:{id:string;status:string};busy:boolean;onReview:(id:string,decision:"reviewing"|"rejected",note:string)=>Promise<void>}){
  const [note,setNote]=useState("");
  return <div className="operations-bank-review">
    <label>处理说明<input value={note} maxLength={500} onChange={event=>setNote(event.target.value)} placeholder="例如：核对未结束订单及法定留存"/></label>
    <small>不要在说明中填写乘客电话、证件、付款凭据或特殊需求。</small>
    <button disabled={busy||note.trim().length<3||request.status==="reviewing"} onClick={()=>void onReview(request.id,"reviewing",note.trim())}>标记处理中</button>
    <button className="secondary" disabled={busy||note.trim().length<3} onClick={()=>void onReview(request.id,"rejected",note.trim())}>驳回申请</button>
  </div>;
}

export function OperationsDashboard() {
  const { services } = useApp();
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [passengers, setPassengers] = useState(0);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [departureId, setDepartureId] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    if (!services) return;
    const result = await services.operations.loadSnapshot();
    setSnapshot(result.data);
    setError(result.error);
  }, [services]);
  useEffect(() => {
    let active = true;
    if (!services)
      return () => {
        active = false;
      };
    void services.operations.loadSnapshot().then((result) => {
      if (active) {
        setSnapshot(result.data);
        setError(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [services]);
  const totals = useMemo(
    () =>
      snapshot?.departures.reduce(
        (value, item) => ({
          orders: value.orders + item.orderCount,
          seats: value.seats + item.bookedSeats,
          revenue: value.revenue + item.grossAmountJpy,
          pending: value.pending + item.pendingOrders,
        }),
        { orders: 0, seats: 0, revenue: 0, pending: 0 },
      ) ?? { orders: 0, seats: 0, revenue: 0, pending: 0 },
    [snapshot],
  );
  const plan = useMemo(() => {
    if (!snapshot || passengers < 1) return null;
    const types = snapshot.vehicleTypes.map((type) => ({
      ...type,
      type: type.type_key,
      capacity: type.sellable_capacity,
      costUnits: Number(type.cost_units),
      availableCount: snapshot.vehicles.filter(
        (vehicle) =>
          vehicle.vehicle_type_key === type.type_key &&
          vehicle.status === "available",
      ).length,
    }));
    try {
      return optimizeFleet(
        passengers,
        types,
        departureId || "operations-preview",
      );
    } catch {
      return null;
    }
  }, [snapshot, passengers, departureId]);
  const recommendations = useMemo(() => {
    if (!snapshot || !plan || !startsAt || !endsAt) return [];
    const start = new Date(startsAt).getTime(),
      end = new Date(endsAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      return [];
    return recommendDrivers(
      plan.assignments,
      snapshot.drivers.map((driver) => {
        const window = driver.driver_availability_windows.find(
          (item) =>
            new Date(item.starts_at).getTime() <= start &&
            new Date(item.ends_at).getTime() >= end,
        );
        return {
          id: driver.id,
          displayName: driver.display_name,
          externalDispatchId: driver.external_dispatch_id,
          qualifiedVehicleTypes: driver.driver_vehicle_qualifications.map(
            (item) => item.vehicle_type_key,
          ),
          languages: driver.languages,
          availableFrom: window?.starts_at ?? "",
          availableUntil: window?.ends_at ?? "",
          status: driver.status,
          assignedWindows: [],
        };
      }),
      new Date(startsAt).toISOString(),
      new Date(endsAt).toISOString(),
      ["zh-CN", "ja"],
    );
  }, [snapshot, plan, startsAt, endsAt]);
  const allDriversMatched = Boolean(
    plan &&
    recommendations.length === plan.assignments.length &&
    recommendations.every((item) => item.driverId),
  );
  const selectDeparture = (id: string) => {
    setDepartureId(id);
    const departure = snapshot?.departures.find((item) => item.id === id);
    if (!departure) return;
    setPassengers(departure.bookedSeats);
    if (departure.departsAt) {
      const start = new Date(departure.departsAt);
      setStartsAt(localDateTime(start));
      setEndsAt(localDateTime(new Date(start.getTime() + 12 * 60 * 60_000)));
    }
  };
  const submitVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await services.operations.createVehicle({
      registration: String(form.get("registration") ?? ""),
      vehicleType: String(form.get("vehicleType") ?? ""),
      externalDispatchId: String(form.get("externalDispatchId") ?? ""),
      publicColor:String(form.get("publicColor")??""),publicPhotoUrl:String(form.get("publicPhotoUrl")??""),
    });
    setNotice(ok ? "车辆已保存" : "车辆保存失败，请检查重复车牌与运营权限");
    if (ok) {
      formElement.reset();
      await reload();
    }
  };
  const submitRoute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await services.operations.saveRouteCatalog({
      slug: "kyoto-nara-classic",
      title: String(form.get("title")),
      summary: String(form.get("summary")),
      walkingLevel: String(form.get("walkingLevel")),
      mealNotes: String(form.get("mealNotes")),
      notices: String(form.get("notices"))
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
      heroImageUrl: String(form.get("heroImageUrl")),
      status: String(form.get("status")) as "draft" | "published",
    });
    setBusy(false);
    setNotice(
      result.ok
        ? "京都奈良路线内容已保存；前台只读取已发布内容"
        : `路线内容保存失败：${result.error ?? "未知错误"}`,
    );
  };
  const submitDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await services.operations.createDriver({
      displayName: String(form.get("displayName") ?? ""),
      externalDispatchId: String(form.get("driverExternalId") ?? ""),
      vehicleTypes: form.getAll("qualifiedTypes").map(String),
      languages: String(form.get("languages") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      availableFrom: new Date(String(form.get("availableFrom"))).toISOString(),
      availableUntil: new Date(
        String(form.get("availableUntil")),
      ).toISOString(),
      serviceRole:String(form.get("serviceRole")) as "driver"|"guide"|"driver_guide",publicPhone:String(form.get("publicPhone")??""),
    });
    setNotice(
      ok
        ? "司机资料与可用时间已保存"
        : "司机保存失败，请检查车型、时间与运营权限",
    );
    if (ok) {
      formElement.reset();
      await reload();
    }
  };
  const savePlan = async () => {
    if (!services || !snapshot || !plan || !departureId || !allDriversMatched)
      return;
    const usedByType = new Map<string, number>();
    const tasks: DispatchPlanDraft[] = plan.assignments.map((vehicle) => {
      const index = usedByType.get(vehicle.vehicleType) ?? 0;
      usedByType.set(vehicle.vehicleType, index + 1);
      const fleet = snapshot.vehicles.filter(
        (item) =>
          item.status === "available" &&
          item.vehicle_type_key === vehicle.vehicleType,
      )[index];
      const driver = recommendations.find(
        (item) => item.vehicleAssignmentId === vehicle.id,
      )?.driverId;
      return {
        sequence: vehicle.sequence,
        vehicleType: vehicle.vehicleType,
        capacity: vehicle.capacity,
        passengerCount: vehicle.booked,
        driverId: driver ?? "",
        fleetVehicleId: fleet?.id ?? "",
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        operationalNotes: [],
      };
    });
    if (tasks.some((task) => !task.driverId || !task.fleetVehicleId)) {
      setNotice("草稿未保存：车辆或司机匹配不完整");
      return;
    }
    setBusy(true);
    const result = await services.operations.saveDispatchPlan(
      departureId,
      tasks,
    );
    setNotice(
      result.ok
        ? "待审核派单草稿已保存，尚未通知司机"
        : `草稿保存失败：${result.error ?? "未知错误"}`,
    );
    if (result.ok) await reload();
    setBusy(false);
  };
  const transition = async (
    task: OperationsDispatchTask,
    action: "confirm" | "send" | "cancel",
  ) => {
    if (!services) return;
    let result: { ok: boolean; error: string | null };
    setBusy(true);
    if (action === "confirm")
      result = await services.operations.confirmDispatchTasks([task.id]);
    else if (action === "send")
      result = await services.operations.simulateDispatchSend([task.id]);
    else {
      const reason = window.prompt(
        "请输入取消原因（不会通知真实司机）",
        "运营调整取消测试派单",
      );
      if (!reason) {
        setBusy(false);
        return;
      }
      result = await services.operations.cancelDispatchTasks([task.id], reason);
    }
    setNotice(
      result.ok
        ? action === "confirm"
          ? "派单已确认，尚未发送"
          : action === "send"
            ? "模拟发送成功，未访问外部网络"
            : "派单已取消"
        : `操作失败：${result.error ?? "未知错误"}`,
    );
    if (result.ok) await reload();
    setBusy(false);
  };
  const retryFulfilment = async (orderId: string) => {
    if (!services) return;
    setBusy(true);
    const result = await services.operations.retryPaidFulfilment(orderId);
    setNotice(
      result.ok
        ? "已重新检查车辆容量；结果已写回履约队列。"
        : `仍无法自动入组：${result.error ?? "请补充车辆或检查付款状态"}`,
    );
    await reload();
    setBusy(false);
  };
  const retryNotification = async (outboxId:string) => {
    if(!services)return;
    const reason=window.prompt("请输入重新发送原因（至少 5 个字符）","已核对收件渠道，重新发送必要履约通知");
    if(!reason)return;
    setBusy(true);
    const result=await services.operations.retryNotificationDelivery(outboxId,reason);
    setNotice(result.ok?"通知已重新进入发送队列，送达状态仍以供应商回执为准。":`通知重试失败：${result.error??"请核对状态和运营权限"}`);
    await reload();setBusy(false);
  };
  const resolveBankTransfer = async (input: {orderId:string;decision:"confirmed"|"rejected";reference?:string;reason?:string;idempotencyKey:string}) => {
    if(!services)return;
    setBusy(true);
    const result=await services.operations.resolveBankTransfer(input);
    setNotice(result.ok?(result.result==="paid"?"到账已确认；订单已付款并进入自动配车。":result.result==="payment_review"?"到账已记录，但原座位已失效；已转入付款异常复核。":"转账已驳回，订单取消并释放座位。"): `核账失败：${result.error??"请检查订单状态和运营权限"}`);
    if(result.ok)await reload();
    setBusy(false);
  };
  const reviewAccountDeletion=async(id:string,decision:"reviewing"|"rejected",note:string)=>{if(!services)return;setBusy(true);const result=await services.operations.reviewAccountDeletion(id,decision,note);setNotice(result.ok?(decision==="reviewing"?"删除申请已进入人工核对，尚未删除账户。":"删除申请已驳回并保留处理记录。"): `处理失败：${result.error??"请核对申请状态和运营权限"}`);if(result.ok)await reload();setBusy(false)};
  return (
    <main className="operations-dashboard">
      <header className="operations-head">
        <div>
          <span>JT WEEKEND · OPERATIONS</span>
          <h1>订单、车辆与司机调度</h1>
          <p>运营数据来自 Supabase；配车与司机匹配只生成审核建议。</p>
        </div>
        <a href="/app">返回乘客应用</a>
      </header>
      {!services || error ? (
        <section className="operations-error" role="alert">
          <h2>后台数据尚未就绪</h2>
          <p>{error ?? "运营数据服务未配置"}</p>
          <p>请确认路线草稿与运营迁移已执行；系统不会回退到测试订单。</p>
        </section>
      ) : (
        snapshot && (
          <>
            <section className="operations-kpis">
              <Kpi label="班次" value={snapshot.departures.length} />
              <Kpi label="订单" value={totals.orders} />
              <Kpi label="已确认席位" value={totals.seats} />
              <Kpi label="待付款" value={totals.pending} />
              <Kpi label="测试成交额 JPY" value={totals.revenue} />
              <Kpi
                label="可用车辆"
                value={
                  snapshot.vehicles.filter((v) => v.status === "available")
                    .length
                }
              />
              <Kpi
                label="可用司机"
                value={
                  snapshot.drivers.filter((d) => d.status === "available")
                    .length
                }
              />
              <Kpi label="待审核派单" value={snapshot.dispatchDrafts} />
              <Kpi label="通知异常" value={snapshot.notificationDeliveryIssues.length} />
            </section>
            <p className="operations-freshness">
              更新：
              {new Date(snapshot.loadedAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Tokyo",
              })}
              （日本时间）
            </p>
            <section className="operations-section">
              <header>
                <div>
                  <span>路线内容管理</span>
                  <h2>京都奈良标准路线</h2>
                </div>
                <small>价格与库存不在此表单中编造</small>
              </header>
              <form className="operations-controls" onSubmit={submitRoute}>
                <label>
                  路线标题
                  <input
                    required
                    name="title"
                    defaultValue="京都与奈良世界遗产经典一日游"
                  />
                </label>
                <label>
                  前台摘要
                  <textarea
                    required
                    name="summary"
                    defaultValue="从大阪出发，一天连接京都代表性历史街区与奈良公园区域。"
                  />
                </label>
                <label>
                  步行强度
                  <select name="walkingLevel" defaultValue="中等">
                    <option>轻松</option>
                    <option>中等</option>
                    <option>较多</option>
                  </select>
                </label>
                <label>
                  餐食说明
                  <textarea
                    required
                    name="mealNotes"
                    defaultValue="餐食包含情况以具体班次为准；未确认前按自理准备。"
                  />
                </label>
                <label>
                  注意事项（每行一项）
                  <textarea
                    required
                    name="notices"
                    defaultValue={
                      "景点顺序和停留时间可能因天气、交通或景区管制调整\n未确认的门票、餐食和辅助服务不会提前收费"
                    }
                  />
                </label>
                <label>
                  主图 URL
                  <input
                    name="heroImageUrl"
                    placeholder="确认来源和使用权后填写"
                  />
                </label>
                <label>
                  发布状态
                  <select name="status" defaultValue="draft">
                    <option value="draft">草稿</option>
                    <option value="published">发布</option>
                  </select>
                </label>
                <button className="button" disabled={busy}>
                  保存路线内容
                </button>
              </form>
            </section>
            <section className="operations-section">
              <header><div><span>账户与隐私</span><h2>删除申请队列</h2></div><small>不显示联系方式、订单内容或私人资料</small></header>
              {(snapshot.accountDeletionRequests??[]).length===0?<p className="operations-empty">暂无账户删除申请。</p>:<div className="operations-dispatch-list">{(snapshot.accountDeletionRequests??[]).map(request=><article key={request.id}><div><b>{request.status==="deferred_active_booking"?"等待未结束行程":"账户删除申请"}</b><span>{request.status}</span></div><span>申请编号尾号 {request.id.slice(-6)}</span><small>{japanDate(request.requestedAt)}</small><AccountDeletionReview request={request} busy={busy} onReview={reviewAccountDeletion}/></article>)}</div>}
            </section>
            <section className="operations-section">
              <header><div><span>履约通知</span><h2>发送异常与待回执</h2></div><small>不显示收件地址、通知正文或乘客隐私</small></header>
              {snapshot.notificationDeliveryIssues.length===0?<p className="operations-empty">暂无通知发送异常。</p>:<div className="operations-dispatch-list">
                {snapshot.notificationDeliveryIssues.map(item=><article key={item.id}>
                  <div><b>{item.status==="failed"?"发送失败":"已提交但回执超时"}</b><span>{item.eventType}</span></div>
                  <span>{item.orderId?`订单尾号 ${item.orderId.slice(-6)}`:"无关联订单"} · 已尝试 {item.attempts} 次</span>
                  <small>{item.lastErrorCode??"等待供应商最终状态"} · {japanDate(item.updatedAt)}</small>
                  {item.status==="failed"&&<div className="operations-task-actions"><button disabled={busy} onClick={()=>void retryNotification(item.id)}>核对后重新发送</button></div>}
                </article>)}
              </div>}
            </section>
            <section className="operations-section">
              <header>
                <div>
                  <span>支付后履约</span>
                  <h2>待处理工作队列</h2>
                </div>
                <small>不显示卡号、金额或乘客证件</small>
              </header>
              {snapshot.fulfilmentWorkItems.length === 0 ? (
                <p className="operations-empty">暂无待处理履约工作。</p>
              ) : (
                <div className="operations-dispatch-list">
                  {snapshot.fulfilmentWorkItems.map((item) => (
                    <article key={item.id}>
                      <div>
                        <b>
                          {item.kind === "payment_review"
                            ? "付款异常待复核"
                            : item.kind === "manual_payment_review"
                              ? "银行转账待核对"
                              : "已付款待入组"}
                        </b>
                        <span>{item.status}</span>
                      </div>
                      <span>
                        订单尾号 {item.orderId.slice(-6)} · 班次尾号{" "}
                        {item.departureId.slice(-6)}
                      </span>
                      <small>{japanDate(item.createdAt)}</small>
                      {item.kind === "paid_order_ready" && (
                        <div className="operations-task-actions">
                          <button
                            disabled={busy}
                            onClick={() => void retryFulfilment(item.orderId)}
                          >
                            重试自动入组
                          </button>
                        </div>
                      )}
                      {item.kind === "manual_payment_review" && (
                        <BankTransferReview item={item} busy={busy} onResolve={resolveBankTransfer}/>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="operations-section">
              <header>
                <div>
                  <span>支付前黄金路径</span>
                  <h2>订单草稿</h2>
                </div>
                <small>不显示电话、紧急联系人或备注</small>
              </header>
              {snapshot.bookingDrafts.length === 0 ? (
                <p className="operations-empty">暂无支付前订单草稿。</p>
              ) : (
                <div className="operations-departures">
                  {snapshot.bookingDrafts.map((draft) => (
                    <article key={draft.draftId}>
                      <header>
                        <div>
                          <b>{draft.tripTitle}</b>
                          <small>
                            {japanDate(draft.departsAt)} · 草稿尾号{" "}
                            {draft.draftId.slice(-6)}
                          </small>
                        </div>
                        <em>{draft.draftStatus}</em>
                      </header>
                      <div>
                        <span>
                          配车人数 <b>{draft.seatImpact}</b>
                        </span>
                        <span>
                          成人 <b>{draft.adults}</b>
                        </span>
                        <span>
                          儿童 <b>{draft.children}</b>
                        </span>
                        <span>
                          婴儿 <b>{draft.infants}</b>
                        </span>
                      </div>
                      <p>
                        辅助需求：{draft.operationalReviewStatus} · 儿童座椅{" "}
                        {String(
                          draft.assistanceSummary.childSeatStatus ?? "未提出",
                        )}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="operations-section">
              <header>
                <div>
                  <span>订单与班次</span>
                  <h2>未来履约概览</h2>
                </div>
                <small>80%仅为内部目标</small>
              </header>
              {snapshot.departures.length === 0 ? (
                <p className="operations-empty">
                  暂无可读取班次，不生成虚构订单统计。
                </p>
              ) : (
                <div className="operations-departures">
                  {snapshot.departures.map((item) => (
                    <article key={item.id}>
                      <header>
                        <div>
                          <b>{item.tripTitle}</b>
                          <small>
                            {japanDate(item.departsAt)} ·{" "}
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
                          席位{" "}
                          <b>
                            {item.bookedSeats}/{item.capacity}
                          </b>
                        </span>
                        <span>
                          装载率 <b>{item.loadFactor}%</b>
                        </span>
                        <span>
                          待付款 <b>{item.pendingOrders}</b>
                        </span>
                      </div>
                      <p className={item.requiresManualReview ? "operations-cutoff-alert" : "operations-cutoff"}>
                        截单：{japanDate(item.bookingClosesAt)} · 聊天开放：{japanDate(item.chatOpensAt)}
                        <br />
                        {item.requiresManualReview
                          ? `报名 ${item.bookedSeats} 人，低于4人，请人工确认车辆与发车安排`
                          : item.dispatchPlanningStatus === "ready_for_planning"
                            ? "已截单，可以开始配车"
                            : item.dispatchPlanningStatus === "confirmed"
                              ? "车辆与司机已确认，任务已同步到工作人员端"
                              : "报名收集中"}
                      </p>
                      <button
                        type="button"
                        onClick={() => selectDeparture(item.id)}
                      >
                        载入配车规划
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="operations-grid">
              <article>
                <h2>新增车辆</h2>
                <form onSubmit={submitVehicle}>
                  <label>
                    车牌／内部识别号
                    <input required name="registration" maxLength={40} />
                  </label>
                  <label>
                    车型
                    <select required name="vehicleType">
                      <option value="">请选择</option>
                      {snapshot.vehicleTypes.map((v) => (
                        <option key={v.type_key} value={v.type_key}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    柚子车辆ID（可稍后补充）
                    <input name="externalDispatchId" />
                  </label>
                  <label>游客可见车辆颜色<input required name="publicColor" maxLength={40} placeholder="例如：黑色" /></label>
                  <label>游客可见车辆照片 HTTPS URL（选填）<input name="publicPhotoUrl" type="url" placeholder="https://" /></label>
                  <button className="button">保存车辆</button>
                </form>
              </article>
              <article>
                <h2>新增司机</h2>
                <form onSubmit={submitDriver}>
                  <label>
                    司机姓名
                    <input required name="displayName" />
                  </label>
                  <label>
                    柚子司机ID
                    <input name="driverExternalId" />
                  </label>
                  <label>游客可见身份<select required name="serviceRole" defaultValue="driver"><option value="driver">司机</option><option value="guide">导游</option><option value="driver_guide">司导</option></select></label>
                  <label>游客紧急联系用公开电话<input required name="publicPhone" type="tel" minLength={5} maxLength={40} /></label>
                  <fieldset>
                    <legend>可驾驶车型</legend>
                    {snapshot.vehicleTypes.map((v) => (
                      <label className="check" key={v.type_key}>
                        <input
                          type="checkbox"
                          name="qualifiedTypes"
                          value={v.type_key}
                        />
                        {v.label}
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    语言代码（逗号分隔）
                    <input name="languages" placeholder="zh-CN, ja" />
                  </label>
                  <label>
                    可用开始
                    <input
                      required
                      type="datetime-local"
                      name="availableFrom"
                    />
                  </label>
                  <label>
                    可用结束
                    <input
                      required
                      type="datetime-local"
                      name="availableUntil"
                    />
                  </label>
                  <button className="button">保存司机</button>
                </form>
              </article>
            </section>
            <section className="operations-planner">
              <header>
                <div>
                  <span>自动规划</span>
                  <h2>配车与司机推荐</h2>
                </div>
                <small>最终结果必须人工确认</small>
              </header>
              <div className="operations-controls">
                <label>
                  班次
                  <select
                    value={departureId}
                    onChange={(event) => selectDeparture(event.target.value)}
                  >
                    <option value="">临时规划（不可保存）</option>
                    {snapshot.departures.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.tripTitle} · {japanDate(item.departsAt)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  报名人数
                  <input
                    type="number"
                    min="1"
                    value={passengers || ""}
                    onChange={(event) =>
                      setPassengers(Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  任务开始
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                  />
                </label>
                <label>
                  任务结束
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                  />
                </label>
              </div>
              {passengers > 0 && !plan ? (
                <p className="operations-error">
                  当前可用车辆无法承载全部乘客。
                </p>
              ) : (
                plan && (
                  <Plan
                    plan={plan}
                    recommendations={recommendations}
                    snapshot={snapshot}
                  />
                )
              )}
              <button
                className="button"
                disabled={!allDriversMatched || !departureId || busy}
                onClick={() => void savePlan()}
              >
                保存待审核派单草稿
              </button>
              {plan && !allDriversMatched && (
                <p className="operations-hint">
                  请先填写完整任务时间，并确保每辆车都有符合车型资格与可用时段的司机。
                </p>
              )}
              {plan && allDriversMatched && !departureId && (
                <p className="operations-hint">
                  临时规划可预览，但必须选择真实班次才能保存。
                </p>
              )}
            </section>
            <section className="operations-section">
              <header>
                <div>
                  <span>调度状态</span>
                  <h2>最近派单任务</h2>
                </div>
                <small>真实柚子发送关闭</small>
              </header>
              {snapshot.dispatchTasks.length === 0 ? (
                <p className="operations-empty">暂无派单任务。</p>
              ) : (
                <div className="operations-dispatch-list">
                  {snapshot.dispatchTasks.map((task) => (
                    <article key={task.id}>
                      <div>
                        <b>{task.status}</b>
                        <span>
                          {task.externalTaskId
                            ? task.externalTaskId.startsWith("mock-")
                              ? "仅模拟发送"
                              : "已有外部任务"
                            : "未发送"}
                        </span>
                      </div>
                      <span>
                        {snapshot.drivers.find(
                          (driver) => driver.id === task.driverId,
                        )?.display_name ?? "司机资料不可用"}{" "}
                        ·{" "}
                        {snapshot.vehicles.find(
                          (vehicle) => vehicle.id === task.fleetVehicleId,
                        )?.registration_identifier ?? "车辆待确认"}
                      </span>
                      <small>
                        {japanDate(task.createdAt)}
                        {task.lastError ? ` · ${task.lastError}` : ""}
                      </small>
                      <div className="operations-task-actions">
                        {task.status === "draft" && (
                          <button
                            disabled={busy}
                            onClick={() => void transition(task, "confirm")}
                          >
                            人工确认
                          </button>
                        )}
                        {task.status === "confirmed" && (
                          <button
                            disabled={busy}
                            onClick={() => void transition(task, "send")}
                          >
                            模拟发送
                          </button>
                        )}
                        {["draft", "confirmed", "sent", "failed"].includes(
                          task.status,
                        ) && (
                          <button
                            disabled={busy}
                            onClick={() => void transition(task, "cancel")}
                          >
                            取消
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <button className="button" disabled>
                发送至真实柚子（API 未连接）
              </button>
            </section>
            {notice && (
              <p role="status" className="notice">
                {notice}
              </p>
            )}
          </>
        )
      )}
    </main>
  );
}
function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value.toLocaleString("zh-CN")}</strong>
    </article>
  );
}
function Plan({
  plan,
  recommendations,
  snapshot,
}: {
  plan: FleetPlan;
  recommendations: {
    vehicleAssignmentId: string;
    driverId: string | null;
    reason: string[];
  }[];
  snapshot: OperationsSnapshot;
}) {
  return (
    <div className="operations-plan">
      <p>
        推荐 {plan.vehicleCount} 辆 · 总容量 {plan.totalCapacity} · 空席{" "}
        {plan.unusedSeats} · 相对成本 {plan.costUnits}
      </p>
      {plan.assignments.map((vehicle) => {
        const driver = recommendations.find(
          (item) => item.vehicleAssignmentId === vehicle.id,
        );
        const profile = snapshot.drivers.find(
          (item) => item.id === driver?.driverId,
        );
        return (
          <article key={vehicle.id}>
            <b>
              Vehicle {vehicle.sequence} ·{" "}
              {appConfig.fleetVehicleTypes.find(
                (type) => type.type === vehicle.vehicleType,
              )?.label ?? vehicle.vehicleType}
            </b>
            <span>
              {vehicle.booked}/{vehicle.capacity} 人
            </span>
            <small>
              {driver
                ? profile
                  ? `推荐司机：${profile.display_name}`
                  : driver.reason[0]
                : "填写任务时间后推荐司机"}
            </small>
          </article>
        );
      })}
    </div>
  );
}
