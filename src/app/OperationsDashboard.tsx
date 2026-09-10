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
  OperationsReferralSummary,
} from "../shared/integrations/supabaseOperations";
import { useApp } from "./store";
import {stripeMode} from '../shared/integrations/stripeClient';

const testAccountEntrances = [
  {
    role: "游客 App 端",
    account: "test1@daitora",
    url: "https://weekend.japan-travel.info/app/login",
    action: "打开游客端",
  },
  {
    role: "司导 App 端",
    account: "drtest1@daitora",
    url: "https://weekend.japan-travel.info/staff",
    action: "打开司导端",
  },
  {
    role: "管理端后台",
    account: "dadmin1@daitora",
    url: "https://weekend.japan-travel.info/app/operations",
    action: "打开管理端",
  },
] as const;

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

function CancellationReview({request,busy,onApprove,onReject}:{request:{id:string;status:string;estimatedRefundAmount:number;refundPercent:number};busy:boolean;onApprove:(id:string,key:string,manual?:{reference:string;actualAmount:number;evidenceNote:string})=>Promise<void>;onReject:(id:string,reason:string)=>Promise<void>}){
  const [reason,setReason]=useState('');
  const [manualReference,setManualReference]=useState('');
  const [evidenceNote,setEvidenceNote]=useState('');
  const [idempotencyKey]=useState(()=>crypto.randomUUID());
  return <div className="operations-bank-review">
    <small>{request.estimatedRefundAmount===0?'该申请无需退款；批准后取消订单并释放对应资源。':`系统将根据原付款渠道处理 ¥${request.estimatedRefundAmount.toLocaleString('ja-JP')}；原路、待核实或人工处理结果会分别显示。`}</small>
    {request.status==='manual_refund_required'?<><label>退款凭证编号<input value={manualReference} onChange={event=>setManualReference(event.target.value)} placeholder="银行流水尾号或内部凭证号"/></label><label>核对说明<input value={evidenceNote} onChange={event=>setEvidenceNote(event.target.value)} placeholder="实际退款金额及核对过程"/></label><button disabled={busy||manualReference.trim().length<4||evidenceNote.trim().length<3} onClick={()=>void onApprove(request.id,idempotencyKey,{reference:manualReference.trim(),actualAmount:request.estimatedRefundAmount,evidenceNote:evidenceNote.trim()})}>登记凭证并完成人工退款</button></>:<button disabled={busy} onClick={()=>void onApprove(request.id,idempotencyKey)}>{request.estimatedRefundAmount===0?'批准取消（无需退款）':'批准并开始退款处理'}</button>}
    <label>拒绝原因<input value={reason} maxLength={500} onChange={event=>setReason(event.target.value)} placeholder="至少5个字符；游客可在订单中看到处理状态"/></label>
    <button className="secondary" disabled={busy||reason.trim().length<5} onClick={()=>void onReject(request.id,reason.trim())}>拒绝退款申请</button>
  </div>;
}

function OperationsDemoDashboard(){
  return <main className="operations-dashboard">
    <div className="operations-cutoff-alert">测试免登录模式 · 以下均为模拟数据，不会操作真实订单、付款或游客资料</div>
    <header className="operations-head"><div><span>JT WEEKEND · OPERATIONS DEMO</span><h1>订单、车辆与司机调度</h1><p>用于检查后台信息结构与三端联动流程。</p></div><a href="/app">游客端</a></header>
    <section className="operations-kpis"><Kpi label="明日班次" value={3}/><Kpi label="已付款订单" value={12}/><Kpi label="报名游客" value={21}/><Kpi label="待确认配车" value={1}/><Kpi label="出勤司导" value={3}/><Kpi label="测试成交额 JPY" value="¥144,900"/></section>
    <section className="operations-section"><header><div><span>运行监控</span><h2>明日车辆安排</h2></div><small>自动推荐后由运营人工确认</small></header><div className="operations-dispatch-list">
      <article><div><b>京都与奈良</b><span>9月10日 08:40 · 9人</span></div><strong>10座海狮 · 姚博</strong><small>已确认 · 聊天将于出发前一天12:00开放</small></article>
      <article><div><b>天桥立与伊根</b><span>9月10日 08:00 · 11人</span></div><strong>14座海狮 · 李力</strong><small>已确认 · 车牌与集合资料已准备</small></article>
      <article><div><b>琵琶湖M线</b><span>9月10日 08:00 · 1人</span></div><strong>等待人工确认</strong><small>报名人数较少，需要关注是否成团</small></article>
    </div></section>
    <section className="operations-section"><header><div><span>测试入口</span><h2>三端快速切换</h2></div></header><div className="operations-account-list"><article><div><span>游客端</span><strong>无需账号</strong></div><a href="/app">打开</a></article><article><div><span>司导端</span><strong>模拟任务</strong></div><a href="/staff">打开</a></article><article><div><span>管理端</span><strong>当前页面</strong></div><a href="/app/operations">刷新</a></article></div></section>
  </main>;
}

export function OperationsDashboard(){
  if(appConfig.runtimeMode==='demo')return <OperationsDemoDashboard/>;
  return <OperationsLiveDashboard/>;
}

function OperationsLiveDashboard() {
  const { services } = useApp();
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [passengers, setPassengers] = useState(0);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [departureId, setDepartureId] = useState("");
  const [manualDrivers,setManualDrivers]=useState<Record<number,string>>({});
  const [manualVehicles,setManualVehicles]=useState<Record<number,string>>({});
  const [busy, setBusy] = useState(false);
  const [referral,setReferral]=useState<OperationsReferralSummary|null>(null);
  const [systemStatus,setSystemStatus]=useState<{ok:boolean;mode:string;checks:Record<string,boolean>}|null>(null);
  const [dashboardLoadedAt]=useState(()=>Date.now());
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
  useEffect(()=>{let active=true;const loader=services?.operations.loadReferralSummary;if(loader)void loader.call(services.operations).then(value=>{if(active)setReferral(value)});return()=>{active=false}},[services]);
  useEffect(()=>{let active=true;void fetch('/api/ready',{headers:{accept:'application/json'}}).then(async response=>({response,body:await response.json()})).then(({body})=>{if(active)setSystemStatus(body)}).catch(()=>{if(active)setSystemStatus({ok:false,mode:'unknown',checks:{api:false}})});return()=>{active=false}},[]);
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
          assignedWindows: (snapshot.staffLeaveRequests ?? [])
            .filter((leave) => leave.accountId === driver.account_id && leave.status === "approved")
            .map((leave) => ({ startsAt: leave.startsAt, endsAt: leave.endsAt })),
        };
      }),
      new Date(startsAt).toISOString(),
      new Date(endsAt).toISOString(),
      ["zh-CN", "ja"],
    );
  }, [snapshot, plan, startsAt, endsAt]);
  const allDriversMatched = Boolean(
    plan &&
    plan.assignments.every((assignment)=>{
      const driverId=manualDrivers[assignment.sequence]??recommendations.find(item=>item.vehicleAssignmentId===assignment.id)?.driverId;
      const vehicleId=manualVehicles[assignment.sequence]??snapshot?.vehicles.find(item=>item.status==='available'&&item.vehicle_type_key===assignment.vehicleType)?.id;
      return Boolean(driverId&&vehicleId);
    }),
  );
  const command = useMemo(() => {
    if (!snapshot) return null;
    const activeTaskStatuses = new Set(["confirmed","sent","delivered","viewed","accepted","en_route","arrived","passengers_onboard","in_progress"]);
    const activeTasks=snapshot.dispatchTasks.filter(task=>activeTaskStatuses.has(task.status));
    const assignedDrivers=new Set(activeTasks.map(task=>task.driverId));
    const assignedVehicles=new Set(activeTasks.map(task=>task.fleetVehicleId).filter(Boolean));
    const alerts:Array<{level:"紧急"|"关注"|"提示";title:string;detail:string}>=[];
    snapshot.departures.forEach(item=>{
      if(item.requiresManualReview) alerts.push({level:"紧急",title:`${item.tripTitle} 报名不足`,detail:`${japanDate(item.departsAt)} · 当前 ${item.bookedSeats} 人，必须人工决定是否发车。`});
      else if(item.dispatchPlanningStatus==="ready_for_planning") alerts.push({level:"紧急",title:`${item.tripTitle} 尚未配车`,detail:`${japanDate(item.departsAt)} · ${item.bookedSeats} 名游客等待车辆和司导。`});
      else if(item.pendingOrders>0) alerts.push({level:"关注",title:`${item.tripTitle} 有待付款订单`,detail:`${item.pendingOrders} 笔订单尚未完成付款，不计入最终配车。`});
    });
    snapshot.dispatchTasks.filter(task=>task.status==="rejected"||task.status==="failed").forEach(task=>alerts.push({level:"紧急",title:"派单写入失败",detail:`${task.departureTitle??"未知班次"} · ${snapshot.drivers.find(driver=>driver.id===task.driverId)?.display_name??"司机未知"} · 请运营直接改派`}));
    snapshot.departures.filter(item=>item.chatOpensAt&&new Date(item.chatOpensAt).getTime()<=dashboardLoadedAt&&item.dispatchPlanningStatus!=="confirmed").forEach(item=>alerts.push({level:"紧急",title:"次日12点信息尚未公布",detail:`${item.tripTitle} · ${japanDate(item.departsAt)} · 请立即完成车辆、司导和分组确认。`}));
    if(snapshot.notificationDeliveryIssues.length) alerts.push({level:"关注",title:"通知发送异常",detail:`${snapshot.notificationDeliveryIssues.length} 条通知需要检查或重试。`});
    if(snapshot.fulfilmentWorkItems.length) alerts.push({level:"关注",title:"履约队列待处理",detail:`${snapshot.fulfilmentWorkItems.length} 项付款或入组工作尚未完成。`});
    const pendingStaff=(snapshot.staffApplications??[]).filter(item=>item.status==="pending"||item.status==="needs_information");
    if(pendingStaff.length) alerts.push({level:"关注",title:"工作人员账户等待审批",detail:`${pendingStaff.length} 个司机或导游申请需要处理。`});
    const pendingLeaves=(snapshot.staffLeaveRequests??[]).filter(item=>item.status==="pending");
    if(pendingLeaves.length) alerts.push({level:"关注",title:"司导请假等待审批",detail:`${pendingLeaves.length} 份请假申请需要核对排班。`});
    (snapshot.staffLeaveRequests??[]).filter(item=>item.status==="approved"&&item.conflictingTasks>0).forEach(item=>alerts.push({level:"紧急",title:"已批准请假与派单冲突",detail:`${item.displayName||item.email} · ${japanDate(item.startsAt)} · 涉及 ${item.conflictingTasks} 个任务，请立即改派。`}));
    const unlinkedDrivers=snapshot.drivers.filter(driver=>driver.status==="available"&&!driver.account_id);
    if(unlinkedDrivers.length) alerts.push({level:"关注",title:"司导尚未绑定登录账号",detail:`${unlinkedDrivers.map(driver=>driver.display_name).join("、")} 无法在司导端接收任务。`});
    const inspectionVehicles=snapshot.vehicles.filter(vehicle=>vehicle.inspection_required);
    if(inspectionVehicles.length) alerts.push({level:"紧急",title:"车辆需要完成车检",detail:`${inspectionVehicles.map(vehicle=>vehicle.registration_identifier).join("、")} 禁止进入派单。`});
    const unclassifiedVehicles=snapshot.vehicles.filter(vehicle=>vehicle.vehicle_type_key==="unclassified-manual"&&!vehicle.inspection_required);
    if(unclassifiedVehicles.length) alerts.push({level:"关注",title:"车辆座位数待确认",detail:`${unclassifiedVehicles.length} 辆车尚未确认核载座位，暂不参与自动派单。`});
    const closingSoon=snapshot.departures.filter(item=>item.dispatchPlanningStatus==="collecting"&&item.bookingClosesAt&&new Date(item.bookingClosesAt).getTime()>dashboardLoadedAt&&new Date(item.bookingClosesAt).getTime()-dashboardLoadedAt<24*60*60_000);
    if(closingSoon.length) alerts.push({level:"提示",title:"班次即将截单",detail:`未来24小时有 ${closingSoon.length} 个班次截单，系统将在截单后进入自动配车。`});
    const runningStatuses=new Set(["en_route","arrived","passengers_onboard","in_progress"]);
    const stageCounts={
      collecting:snapshot.departures.filter(item=>item.dispatchPlanningStatus==="collecting").length,
      waiting:snapshot.departures.filter(item=>item.dispatchPlanningStatus==="ready_for_planning"||item.dispatchPlanningStatus==="needs_manual_review").length,
      assigned:new Set(activeTasks.filter(task=>!runningStatuses.has(task.status)).map(task=>task.departureId).filter(Boolean)).size,
      running:new Set(activeTasks.filter(task=>runningStatuses.has(task.status)).map(task=>task.departureId).filter(Boolean)).size,
      completed:new Set(snapshot.dispatchTasks.filter(task=>task.status==="completed").map(task=>task.departureId).filter(Boolean)).size,
    };
    return {activeTasks,assignedDrivers,assignedVehicles,alerts,stageCounts};
  },[snapshot,dashboardLoadedAt]);
  const selectDeparture = (id: string) => {
    setDepartureId(id);
    setManualDrivers({});
    setManualVehicles({});
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
      slug: String(form.get("slug")).trim(),
      title: String(form.get("title")).trim()||undefined,
      summary: String(form.get("summary")).trim()||undefined,
      walkingLevel: String(form.get("walkingLevel")).trim()||undefined,
      mealNotes: String(form.get("mealNotes")).trim()||undefined,
      notices: String(form.get("notices")).trim()?String(form.get("notices"))
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean):undefined,
      heroImageUrl: String(form.get("heroImageUrl")).trim()||undefined,
      status: (String(form.get("status")).trim()||undefined) as "draft" | "published" | undefined,
    });
    setBusy(false);
    setNotice(
      result.ok
        ? "路线修改已安全保存；未填写的字段和原图库保持不变"
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
      const automaticFleet = snapshot.vehicles.filter(
        (item) =>
          item.status === "available" &&
          item.vehicle_type_key === vehicle.vehicleType,
      )[index];
      const automaticDriver = recommendations.find(
        (item) => item.vehicleAssignmentId === vehicle.id,
      )?.driverId;
      const fleetVehicleId=manualVehicles[vehicle.sequence]??automaticFleet?.id??"";
      const driverId=manualDrivers[vehicle.sequence]??automaticDriver??"";
      return {
        sequence: vehicle.sequence,
        vehicleType: vehicle.vehicleType,
        capacity: vehicle.capacity,
        passengerCount: vehicle.booked,
        driverId,
        fleetVehicleId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        operationalNotes: [],
        planningSource: manualDrivers[vehicle.sequence]||manualVehicles[vehicle.sequence]?"manual_override" as const:"automatic" as const,
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
  const reviewStaffApplication=async(id:string,decision:"approved"|"rejected"|"needs_information"|"suspended")=>{if(!services)return;const note=window.prompt("审核说明（可简短填写）",decision==="approved"?"身份资料已核对":"请记录处理原因")??"";setBusy(true);const result=await services.operations.reviewStaffApplication(id,decision,note);setNotice(result.ok?(decision==="approved"?"工作人员账户已批准；下次登录将自动进入司导端。":"申请状态已更新。"):`审核失败：${result.error??"请检查账户状态与管理员权限"}`);if(result.ok)await reload();setBusy(false)};
  const reviewStaffLeave=async(id:string,decision:"approved"|"rejected")=>{if(!services)return;const note=window.prompt("审批说明（可选）",decision==="approved"?"已核对排班，同意请假":"请说明无法批准的原因")??"";setBusy(true);const result=await services.operations.reviewStaffLeave(id,decision,note);setNotice(result.ok?(decision==="approved"?"请假已批准；该时段已从自动派单候选中排除。":"请假已拒绝并通知记录。"):`审批失败：${result.error??"请检查申请状态与管理员权限"}`);if(result.ok)await reload();setBusy(false)};
  const saveReferral=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!services||!referral)return;const form=new FormData(event.currentTarget);setBusy(true);const result=await services.operations.updateReferralSettings(Number(form.get('discountPercent')),Number(form.get('validityDays')),form.get('active')==='on');setNotice(result.ok?'推荐优惠规则已更新；只影响之后成功注册的新推荐关系。':`推荐规则保存失败：${result.error??'请检查管理员权限'}`);if(result.ok)setReferral(await services.operations.loadReferralSummary());setBusy(false)};
  const approveCancellation=async(id:string,key:string,manual?:{reference:string;actualAmount:number;evidenceNote:string})=>{if(!services)return;setBusy(true);const result=await services.executeOperationsRefund(id,key,manual);setNotice(result?.accepted?(result.status==='refund_completed'?'退款已完成并写入账单流水。':result.status==='manual_refund_required'?'需要人工退款，请登记凭证和实际退款金额。':"退款已提交，最终结果等待支付渠道回调。"):'退款未提交：请核对运营权限、订单付款状态与服务端连接。');if(result?.accepted)await reload();setBusy(false)};
  const rejectCancellation=async(id:string,reason:string)=>{if(!services)return;setBusy(true);const result=await services.operations.rejectCancellationRequest(id,reason);setNotice(result.ok?"退款申请已拒绝并保存处理理由；订单付款状态未被修改。":`拒绝失败：${result.error??"请核对申请状态和运营权限"}`);if(result.ok)await reload();setBusy(false)};
  return (
    <main className="operations-dashboard">
      <header className="operations-head">
        <div>
          <span>JT WEEKEND · OPERATIONS</span>
          <h1>订单、车辆与司机调度</h1>
          <p>系统按报名人数自动匹配车辆与合格司导；运营确认后才下发到司导账号。</p>
        </div>
        <div className="operations-task-actions"><a href="/app/operations/products">产品管理</a><a href="/app/operations/departures">班次与价格</a><a href="/app/operations/run">每日运行台</a><a href="/app/operations/commissions">佣金与提现</a><a href="/app/operations/marketing">首页与季节专题</a><a href="/app">返回乘客应用</a></div>
      </header>
      <section className="operations-section operations-test-accounts">
        <header>
          <div>
            <span>测试工具</span>
            <h2>测试账户与入口</h2>
          </div>
          <small>仅用于内部测试；密码请通过内部渠道单独保管</small>
        </header>
        <div className="operations-account-list">
          {testAccountEntrances.map((item) => (
            <article key={item.role}>
              <div>
                <span>{item.role}</span>
                <strong>{item.account}</strong>
              </div>
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.action}
              </a>
              <small>{item.url}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="operations-section operations-system-status">
        <header><div><span>上线安全</span><h2>系统环境状态</h2></div><small>当前固定为内部测试；正式收款需单独审批后才能开启</small></header>
        <div className="operations-kpis">
          <Kpi label="运行环境" value={systemStatus?.mode==='test'?'内部测试':'检查中'}/>
          <Kpi label="数据库" value={systemStatus?.checks.database?'正常':'待检查'}/>
          <Kpi label="Stripe" value={stripeMode==='test'&&systemStatus?.checks.stripeModeSafe?'测试模式':'已关闭/待配置'}/>
          <Kpi label="支付回调" value={systemStatus?.checks.webhookSecret?'已配置':'未配置'}/>
          <Kpi label="通知回执" value={systemStatus?.checks.notificationReceiptSecret?'已配置':'未配置'}/>
          <Kpi label="Google 地点照片" value={import.meta.env.VITE_GOOGLE_PLACES_READY==='true'?'已验证':'未就绪'}/>
          <Kpi label="邮件" value="未接通"/>
          <Kpi label="搜索引擎" value="禁止收录"/>
        </div>
        <p className={systemStatus?.ok?'operations-ok':'operations-cutoff-alert'}>{systemStatus?.ok?'核心测试服务已就绪；真实付款仍保持关闭。':'核心测试服务尚未全部就绪，系统会保持支付关闭。'}</p>
      </section>
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
            {referral&&<section className="operations-section operations-referral-monitor">
              <header><div><span>增长、复购与风控</span><h2>推荐优惠券监控</h2></div><small>直接邀请一层；推荐奖励在被推荐订单进入出发前24小时不可退款期后生效</small></header>
              <form className="operations-controls" onSubmit={saveReferral}>
                <label>优惠比例（%）<input name="discountPercent" type="number" min="1" max="50" defaultValue={referral.discountPercent}/></label>
                <label>有效期（天）<input name="validityDays" type="number" min="1" max="365" defaultValue={referral.validityDays}/></label>
                <label className="check"><input name="active" type="checkbox" defaultChecked={referral.active}/> 开启邀请活动</label>
                <button disabled={busy}>保存邀请规则</button>
              </form>
              <div className="operations-kpis operations-referral-kpis">
                <Kpi label="推荐注册" value={referral.successfulInvites}/><Kpi label="已付款新人" value={referral.paidInvitees}/><Kpi label="有效消费推荐" value={referral.qualifiedInvites}/><Kpi label="优惠券总数" value={referral.couponCounts.total}/><Kpi label="累计抵扣 JPY" value={referral.discountAmountJpy}/><Kpi label="异常告警" value={referral.alerts.length}/>
              </div>
              <div className="operations-stage-strip operations-coupon-status"><span>待解锁 <b>{referral.couponCounts.pending}</b></span><span>可使用 <b>{referral.couponCounts.active}</b></span><span>已锁定 <b>{referral.couponCounts.reserved}</b></span><span>已使用 <b>{referral.couponCounts.redeemed}</b></span><span>已失效 <b>{referral.couponCounts.void+referral.couponCounts.expired}</b></span><span>冻结追偿 <b>{referral.couponCounts.frozen}</b></span></div>
              <div className={`operations-integrity ${referral.integrity.missingPairs||referral.integrity.orphanCoupons?'has-error':'is-ok'}`}><b>数量一致性检查</b><span>推荐关系 {referral.integrity.relationships} 条 · 应发 {referral.integrity.expectedCoupons} 张 · 实发 {referral.integrity.actualCoupons} 张</span><small>{referral.integrity.missingPairs||referral.integrity.orphanCoupons?`异常：${referral.integrity.missingPairs} 条关系缺券，${referral.integrity.orphanCoupons} 张孤立券`:'推荐关系与优惠券数量符合逻辑'}</small></div>
              <div className="operations-command-grid">
                <div><h3>风险与异常</h3>{referral.alerts.length===0?<p className="operations-ok">当前没有检测到优惠券逻辑异常。</p>:<div className="operations-attention-list">{referral.alerts.map(alert=><article key={`${alert.kind}-${alert.reference_id}`} data-level={alert.severity}><b>{alert.severity} · {alert.message}</b><p>{alert.kind} · {alert.reference_id.slice(-8)}</p><small>{japanDate(alert.created_at)}</small></article>)}</div>}<p className="operations-hint">设备指纹、注册IP、支付方式指纹尚未采集，因此目前不会把这些项目误报为“已检测”。</p></div>
                <div><h3>推荐关系明细</h3>{referral.relations.length===0?<p className="operations-empty">暂无推荐关系。</p>:<div className="operations-dispatch-list operations-referral-list">{referral.relations.map(row=><article key={row.id}><div><b>{row.inviter_name||row.inviter_email} → {row.invitee_name||row.invitee_email}</b><span>{row.discount_percent}%</span></div><span>{row.trip_title??'尚未购买行程'} · {row.order_status??'尚未付款'}</span><small>新人券：{row.invitee_coupon_status??'缺失'} · 推荐券：{row.inviter_coupon_status??'缺失'}{row.available_at?` · ${japanDate(row.available_at)}解锁`:''}</small><small>订单 ¥{row.order_amount_jpy??0} · 优惠 ¥{row.order_discount_jpy??0} · 推荐码 {row.referral_code}</small></article>)}</div>}</div>
              </div>
            </section>}
            {command&&<section className="operations-section operations-command-center">
              <header><div><span>运营指挥中心</span><h2>报名、配车与司导出勤</h2></div><small>只统计已付款/已确认游客；刷新后读取最新状态</small></header>
              <div className="operations-kpis operations-command-kpis">
                <Kpi label="游客报名" value={totals.seats}/><Kpi label="已配车辆" value={command.assignedVehicles.size}/><Kpi label="出勤司导" value={command.assignedDrivers.size}/><Kpi label="待配班次" value={snapshot.departures.filter(item=>item.dispatchPlanningStatus==="ready_for_planning"||item.dispatchPlanningStatus==="needs_manual_review").length}/><Kpi label="需关注" value={command.alerts.length}/>
              </div>
              <h3>订单运行状态</h3>
              <div className="operations-stage-strip"><span>报名中 <b>{command.stageCounts.collecting}</b></span><span>待配车 <b>{command.stageCounts.waiting}</b></span><span>已派单 <b>{command.stageCounts.assigned}</b></span><span>运行中 <b>{command.stageCounts.running}</b></span><span>已完成 <b>{command.stageCounts.completed}</b></span></div>
              <div className="operations-command-grid">
                <div><h3>司机与车辆安排</h3>{command.activeTasks.length===0?<p className="operations-empty">暂无已确认派单。</p>:<div className="operations-dispatch-list">{command.activeTasks.map(task=><article key={`command-${task.id}`}><div><b>{task.departureTitle??"班次待识别"}</b><span>{task.status}</span></div><span>{japanDate(task.departsAt)} · {task.vehicleSequence?`${task.vehicleSequence}号车 · `:""}{snapshot.vehicles.find(v=>v.id===task.fleetVehicleId)?.registration_identifier??"车辆待确认"}</span><small>司导：{snapshot.drivers.find(d=>d.id===task.driverId)?.display_name??"待确认"} · 游客 {Number(task.payload.passengerCount??0)}/{Number(task.payload.capacity??0)} 席</small></article>)}</div>}</div>
                <div><h3>需要关注</h3>{command.alerts.length===0?<p className="operations-ok">目前没有需要人工介入的异常。</p>:<div className="operations-attention-list">{command.alerts.map((alert,index)=><article key={`${alert.title}-${index}`} data-level={alert.level}><b>{alert.level} · {alert.title}</b><p>{alert.detail}</p></article>)}</div>}</div>
              </div>
            </section>}
            <p className="operations-freshness">
              更新：
              {new Date(snapshot.loadedAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Tokyo",
              })}
              （日本时间）
            </p>
            <section className="operations-section">
              <header><div><span>基础档案</span><h2>司导与车辆清单</h2></div><small>内部电话仅管理端可见；未绑定账户的司导不能接单</small></header>
              <div className="operations-registry-grid">
                <div><h3>司导人员</h3><div className="operations-dispatch-list">{snapshot.drivers.map(driver=><article key={driver.id}><div><b>{driver.display_name}</b><span>{driver.employee_code?`编号 ${driver.employee_code}`:"编号待补"}</span></div><span>{driver.employment_base??"所属待补"} · {driver.private_phone??"电话待补"}</span><small>{driver.account_id?"已绑定登录账户":"尚未绑定登录账户"} · {driver.status}</small></article>)}</div></div>
                <div><h3>运营车辆</h3><div className="operations-dispatch-list">{snapshot.vehicles.map(vehicle=><article key={vehicle.id}><div><b>{vehicle.registration_identifier}</b><span>{vehicle.model_name??"车型待补"}</span></div><span>{vehicle.public_color??"颜色待补"} · {vehicle.vehicle_type_key==="unclassified-manual"?"座位数待确认":vehicle.vehicle_type_key}</span><small>{vehicle.inspection_required?"需要车检，禁止派单":vehicle.status}{vehicle.operations_note?` · ${vehicle.operations_note}`:""}</small></article>)}</div></div>
              </div>
            </section>
            <section className="operations-section">
              <header>
                <div>
                  <span>路线内容管理</span>
                  <h2>路线安全修订</h2>
                </div>
                <small>价格与库存不在此表单中编造</small>
              </header>
              <form className="operations-controls" onSubmit={submitRoute}>
                <label>
                  路线编号（slug）
                  <input required name="slug" placeholder="例如 kyoto-nara-classic" />
                </label>
                <label>
                  路线标题
                  <input name="title" placeholder="不修改请留空" />
                </label>
                <label>
                  前台摘要
                  <textarea
                    name="summary"
                    placeholder="不修改请留空"
                  />
                </label>
                <label>
                  步行强度
                  <select name="walkingLevel" defaultValue="">
                    <option value="">不修改</option>
                    <option>轻松</option>
                    <option>中等</option>
                    <option>较多</option>
                  </select>
                </label>
                <label>
                  餐食说明
                  <textarea
                    name="mealNotes"
                    placeholder="不修改请留空"
                  />
                </label>
                <label>
                  注意事项（每行一项）
                  <textarea
                    name="notices"
                    placeholder="不修改请留空；确需清空将在产品中心提供单独操作"
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
                  <select name="status" defaultValue="">
                    <option value="">不修改</option>
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
              <header><div><span>账户与权限</span><h2>司机／导游申请审批</h2></div><small>一个账号只能有一个角色；批准后不可进入游客端</small></header>
              {(snapshot.staffApplications??[]).length===0?<p className="operations-empty">暂无工作人员账户申请。</p>:<div className="operations-dispatch-list">{(snapshot.staffApplications??[]).map(item=><article key={item.id}><div><b>{item.applicantName||"未填写姓名"}</b><span>{item.requestedRole==="driver"?"司机":"导游"} · {item.status}</span></div><span>{item.email}</span><small>{japanDate(item.createdAt)}{item.reviewNote?` · ${item.reviewNote}`:""}</small><div className="operations-task-actions">{(item.status==="pending"||item.status==="needs_information")&&<><button disabled={busy} onClick={()=>void reviewStaffApplication(item.id,"approved")}>批准</button><button disabled={busy} onClick={()=>void reviewStaffApplication(item.id,"needs_information")}>补充资料</button><button disabled={busy} onClick={()=>void reviewStaffApplication(item.id,"rejected")}>拒绝</button></>}{item.status==="approved"&&<button disabled={busy} onClick={()=>void reviewStaffApplication(item.id,"suspended")}>暂停账号</button>}</div></article>)}</div>}
            </section>
            <section className="operations-section">
              <header><div><span>出勤管理</span><h2>司导请假审批</h2></div><small>批准后自动派单将避开该时段；已有派单冲突必须人工改派</small></header>
              {(snapshot.staffLeaveRequests??[]).length===0?<p className="operations-empty">暂无司导请假申请。</p>:<div className="operations-dispatch-list">{(snapshot.staffLeaveRequests??[]).map(item=><article key={item.id}><div><b>{item.displayName||"未填写姓名"}</b><span>{item.status==='pending'?'待审核':item.status==='approved'?'已批准':item.status==='rejected'?'已拒绝':'已取消'}</span></div><span>{japanDate(item.startsAt)} — {japanDate(item.endsAt)}<br/>{item.reason}</span><small>{item.email}{item.reviewNote?` · ${item.reviewNote}`:""}{item.conflictingTasks>0?` · 冲突任务 ${item.conflictingTasks} 个`:""}</small><div className="operations-task-actions">{item.status==='pending'&&<><button disabled={busy} onClick={()=>void reviewStaffLeave(item.id,'approved')}>批准</button><button disabled={busy} onClick={()=>void reviewStaffLeave(item.id,'rejected')}>拒绝</button></>}</div></article>)}</div>}
            </section>
            <section className="operations-section">
              <header><div><span>订单与支付</span><h2>取消／退款申请</h2></div><small>司机端不可见；退款以支付渠道回调为准</small></header>
              {(snapshot.cancellationRequests??[]).length===0?<p className="operations-empty">暂无取消或退款申请。</p>:<div className="operations-dispatch-list">{(snapshot.cancellationRequests??[]).map(request=><article key={request.id}><div><b>订单尾号 {request.orderId.slice(-6)}</b><span>{request.status}</span></div><span>原因：{request.reasonCode} · 规则退款 {request.refundPercent}%</span><small>预计 ¥{request.estimatedRefundAmount} · {japanDate(request.requestedAt)}</small><CancellationReview request={request} busy={busy} onApprove={approveCancellation} onReject={rejectCancellation}/></article>)}</div>}
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
                      <p>当前环节：{draft.draftStatus === "converted" ? "已转订单" : "等待付款或转换"}</p>
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
                  <small>10座、14座自动分配；20座以上和大巴暂由人工安排</small>
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
                    manualDrivers={manualDrivers}
                    manualVehicles={manualVehicles}
                    onDriverChange={(sequence,value)=>setManualDrivers(current=>({...current,[sequence]:value}))}
                    onVehicleChange={(sequence,value)=>setManualVehicles(current=>({...current,[sequence]:value}))}
                  />
                )
              )}
              <button
                className="button"
                disabled={!allDriversMatched || !departureId || busy}
                onClick={() => void savePlan()}
              >
                系统生成待确认派单
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
function Kpi({ label, value }: { label: string; value: number|string }) {
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
  manualDrivers,
  manualVehicles,
  onDriverChange,
  onVehicleChange,
}: {
  plan: FleetPlan;
  recommendations: {
    vehicleAssignmentId: string;
    driverId: string | null;
    reason: string[];
  }[];
  snapshot: OperationsSnapshot;
  manualDrivers:Record<number,string>;
  manualVehicles:Record<number,string>;
  onDriverChange:(sequence:number,value:string)=>void;
  onVehicleChange:(sequence:number,value:string)=>void;
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
        const qualifiedDrivers=snapshot.drivers.filter(item=>item.status==='available'&&item.driver_vehicle_qualifications.some(q=>q.vehicle_type_key===vehicle.vehicleType));
        const matchingVehicles=snapshot.vehicles.filter(item=>item.status==='available'&&item.vehicle_type_key===vehicle.vehicleType);
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
            <label>人工调整司机
              <select aria-label={`第${vehicle.sequence}车司机`} value={manualDrivers[vehicle.sequence]??driver?.driverId??''} onChange={event=>onDriverChange(vehicle.sequence,event.target.value)}>
                {qualifiedDrivers.map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}
              </select>
            </label>
            <label>人工调整车辆
              <select aria-label={`第${vehicle.sequence}车车辆`} value={manualVehicles[vehicle.sequence]??matchingVehicles[0]?.id??''} onChange={event=>onVehicleChange(vehicle.sequence,event.target.value)}>
                {matchingVehicles.map(item=><option key={item.id} value={item.id}>{item.registration_identifier}</option>)}
              </select>
            </label>
          </article>
        );
      })}
    </div>
  );
}
