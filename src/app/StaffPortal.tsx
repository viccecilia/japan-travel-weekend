import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { isSeedEnabled } from "../shared/config/businessRules";
import { useApp } from "./store";

export type StaffTask = {
  staff_assignment_id: string;
  assignment_role: "driver" | "guide" | "operations";
  vehicle_group_id: string;
  room_id: string | null;
  room_status: string | null;
  departure_id: string;
  trip_title: string;
  departs_at: string | null;
  chat_opens_at: string | null;
  meeting_name: string | null;
  meeting_address: string | null;
  map_lat: number | null;
  map_lng: number | null;
  vehicle_sequence: number;
  vehicle_type: string;
  vehicle_label: string | null;
  vehicle_capacity: number;
  booked_seats: number;
  passenger_count: number;
  boarded_count: number;
  payment_ready_count: number;
  payment_review_count: number;
  payment_blocked_count: number;
};
type AttendanceRow = {
  passenger_id: string;
  passenger_label: string;
  order_id: string;
  status: string;
  status_at: string | null;
  contact_status: string | null;
  late_minutes?: number | null;
};
type AttendanceSummary = {
  total: number;
  arrived: number;
  boarded: number;
  needs_assistance: number;
  pending: number;
  all_present: boolean;
};
type StaffMessage = {
  id: string;
  content: string;
  original_content: string | null;
  important: boolean;
  created_at: string;
  template_key: string | null;
};
type StaffAction =
  | "passengers"
  | "chat"
  | "notice"
  | "meeting"
  | "journey"
  | "delay"
  | "incident"
  | "support";

const previewTasks: StaffTask[] = [
  {
    staff_assignment_id: "preview-today",
    assignment_role: "driver",
    vehicle_group_id: "preview-group",
    room_id: "preview-room",
    room_status: "open",
    departure_id: "preview-departure",
    trip_title: "京都与奈良一日游",
    departs_at: new Date(Date.now() + 3_600_000).toISOString(),
    chat_opens_at: new Date(Date.now() - 3_600_000).toISOString(),
    meeting_name: "大阪梅田集合点",
    meeting_address: "集合地址将在任务确认后显示",
    map_lat: null,
    map_lng: null,
    vehicle_sequence: 1,
    vehicle_type: "hiace-13",
    vehicle_label: "Hiace · 1号车",
    vehicle_capacity: 13,
    booked_seats: 12,
    passenger_count: 12,
    boarded_count: 8,
    payment_ready_count: 10,
    payment_review_count: 2,
    payment_blocked_count: 0,
  },
  {
    staff_assignment_id: "preview-tomorrow",
    assignment_role: "guide",
    vehicle_group_id: "preview-group-2",
    room_id: null,
    room_status: "frozen",
    departure_id: "preview-departure-2",
    trip_title: "天桥立与伊根",
    departs_at: new Date(Date.now() + 86_400_000).toISOString(),
    chat_opens_at: new Date(Date.now() + 43_200_000).toISOString(),
    meeting_name: "大阪站周边",
    meeting_address: null,
    map_lat: null,
    map_lng: null,
    vehicle_sequence: 1,
    vehicle_type: "coaster-20",
    vehicle_label: "考斯特 · 待确认",
    vehicle_capacity: 20,
    booked_seats: 18,
    passenger_count: 18,
    boarded_count: 0,
    payment_ready_count: 17,
    payment_review_count: 1,
    payment_blocked_count: 0,
  },
];
const previewAttendance: AttendanceRow[] = [
  {
    passenger_id: "preview-passenger-1",
    passenger_label: "测试乘客 A",
    order_id: "preview-order-1",
    status: "at_meeting_point",
    status_at: new Date().toISOString(),
    contact_status: null,
  },
  {
    passenger_id: "preview-passenger-2",
    passenger_label: "测试乘客 B",
    order_id: "preview-order-2",
    status: "pending",
    status_at: null,
    contact_status: null,
  },
];
const roleLabel = (role: StaffTask["assignment_role"]) =>
  role === "driver" ? "司机" : role === "guide" ? "导游" : "运营协助";
const dayLabel = (value: string | null) => {
  if (!value) return "时间待确认";
  const target = new Date(value);
  const days = Math.floor((target.getTime() - Date.now()) / 86_400_000);
  return days <= 0
    ? "今天"
    : days === 1
      ? "明天"
      : days === 2
        ? "后天"
        : new Intl.DateTimeFormat("zh-CN", {
            timeZone: "Asia/Tokyo",
            month: "numeric",
            day: "numeric",
            weekday: "short",
          }).format(target);
};
const timeLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "--:--";
const taskPath = (task: StaffTask, action: StaffAction) =>
  `/staff/tasks/${encodeURIComponent(task.staff_assignment_id)}/${action}`;
const statusLabel: Record<string, string> = {
  pending: "待确认",
  confirmed_departure: "已确认出发",
  at_meeting_point: "已到集合点",
  boarded: "已登车",
  needs_assistance: "需要协助",
  contacting: "联系中",
  unreachable: "暂时无法联系",
};
const staffTemplates = [
  ["introduce", "自我介绍"],
  ["confirm_meeting", "确认集合信息"],
  ["vehicle_arrived", "车辆已到达"],
  ["departing_10", "10分钟后出发"],
  ["departing_5", "5分钟后出发"],
  ["return_vehicle", "请返回车辆"],
  ["traffic_delay", "交通延误"],
  ["meeting_changed", "集合点变更"],
] as const;

function useStaffTasks() {
  const { services } = useApp();
  const preview = !services && isSeedEnabled;
  const [tasks, setTasks] = useState<StaffTask[]>(() =>
    preview ? previewTasks : [],
  );
  const [resolved, setResolved] = useState(!services);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!services)
      return () => {
        active = false;
      };
    void services.loadStaffTasks().then((result) => {
      if (!active) return;
      setTasks(result.data);
      setError(result.error);
      setResolved(true);
    });
    return () => {
      active = false;
    };
  }, [services]);
  return { services, preview, tasks, resolved, error };
}

export function StaffPortal() {
  const { services, preview, tasks, resolved, error } = useStaffTasks();
  const [selected, setSelected] = useState<string | null>(null);
  const [workflowNotice, setWorkflowNotice] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const active = useMemo(
    () =>
      tasks.find((task) => task.staff_assignment_id === selected) ??
      tasks[0] ??
      null,
    [tasks, selected],
  );
  const execute = async (type: "task_accepted" | "meeting_started") => {
    if (!active) return;
    if (!services) {
      setWorkflowNotice(
        type === "task_accepted"
          ? "本地预览：任务已接受。"
          : "本地预览：已发起集合。",
      );
      return;
    }
    setWorkflowBusy(true);
    const ok = await services.recordStaffExecution(
      active.vehicle_group_id,
      type,
    );
    setWorkflowBusy(false);
    setWorkflowNotice(
      ok
        ? type === "task_accepted"
          ? "任务已接受并留下操作记录。"
          : "已发起集合，游客端将显示“我已到达”。"
        : "操作未保存，请确认任务权限和群聊开放状态。",
    );
  };
  if (!resolved)
    return (
      <StaffFrame>
        <StatusCard title="正在读取工作人员任务">
          仅加载分配给当前账户的车辆与团组。
        </StatusCard>
      </StaffFrame>
    );
  return (
    <StaffFrame task={active}>
      {preview && (
        <div className="staff-preview">
          本地界面预览 · 不代表真实任务、乘客或付款状态
        </div>
      )}
      <header className="staff-welcome">
        <span>工作人员端</span>
        <h1>今日履约</h1>
        <p>只显示分配给你的任务和本车乘客。</p>
      </header>
      {error && (
        <StatusCard title="任务读取失败" alert>
          {error}
        </StatusCard>
      )}
      {!active ? (
        <StatusCard title="暂无已分配任务">
          任务由运营后台分配后，会显示在今天、明天和后天列表中。
        </StatusCard>
      ) : (
        <>
          <section
            id="tasks"
            className="staff-task-strip"
            aria-label="任务列表"
          >
            {tasks.map((task) => (
              <button
                type="button"
                key={task.staff_assignment_id}
                className={
                  task.staff_assignment_id === active.staff_assignment_id
                    ? "active"
                    : ""
                }
                onClick={() => setSelected(task.staff_assignment_id)}
              >
                <span>
                  {dayLabel(task.departs_at)} · {timeLabel(task.departs_at)}
                </span>
                <b>{task.trip_title}</b>
                <small>
                  {roleLabel(task.assignment_role)} ·{" "}
                  {task.vehicle_label ?? task.vehicle_type}
                </small>
              </button>
            ))}
          </section>
          <TaskSummary task={active} />
          <section className="staff-actions">
            <h2>执行状态</h2>
            <div>
              <button
                type="button"
                disabled={workflowBusy}
                onClick={() => void execute("task_accepted")}
              >
                接受任务
              </button>
              <button
                type="button"
                disabled={workflowBusy || active.room_status !== "open"}
                onClick={() => void execute("meeting_started")}
              >
                发起集合
              </button>
            </div>
            {workflowNotice && (
              <p className="staff-result" role="status">
                {workflowNotice}
              </p>
            )}
          </section>
          <section className="staff-kpis">
            <article>
              <span>本车乘客</span>
              <b>{active.passenger_count}</b>
              <small>
                {active.booked_seats}/{active.vehicle_capacity} 席
              </small>
            </article>
            <article>
              <span>已登车</span>
              <b>{active.boarded_count}</b>
              <small>按乘客点名</small>
            </article>
            <article>
              <span>可登车订单</span>
              <b>{active.payment_ready_count}</b>
              <small>不显示金额</small>
            </article>
          </section>
          <section className="staff-payment">
            <header>
              <div>
                <span>付款与登车资格</span>
                <h2>本车订单状态</h2>
              </div>
              <small>仅履约状态</small>
            </header>
            <div>
              <b className="ready">可登车 {active.payment_ready_count}</b>
              <b className="review">待人工确认 {active.payment_review_count}</b>
              <b className="blocked">不可登车 {active.payment_blocked_count}</b>
            </div>
            <p>
              工作人员不显示支付金额、卡号、优惠和退款金额；待确认订单交由运营处理。
            </p>
          </section>
          <section className="staff-actions">
            <h2>当前任务</h2>
            <div>
              {active.map_lat != null && active.map_lng != null ? (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${active.map_lat},${active.map_lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  集合点导航
                </a>
              ) : (
                <button type="button" disabled>
                  导航待确认
                </button>
              )}
              <Link to={taskPath(active, "passengers")}>乘客点名</Link>
              <Link to={taskPath(active, "chat")}>团队群聊</Link>
              <Link to={taskPath(active, "notice")}>发送通知</Link>
              <Link to={taskPath(active, "meeting")}>集合管理</Link>
              <Link to={taskPath(active, "journey")}>行程控制台</Link>
              <Link to={taskPath(active, "delay")}>报告延误</Link>
              <Link to={taskPath(active, "incident")}>异常上报</Link>
              <Link to={taskPath(active, "support")}>联系运营</Link>
            </div>
          </section>
          <section className="staff-permission-note">
            <b>{roleLabel(active.assignment_role)}权限</b>
            <p>
              {active.assignment_role === "driver"
                ? "车辆、导航、付款资格、点名、司机通知和本车群聊。"
                : active.assignment_role === "guide"
                  ? "团员、行程节点、点名、广播、翻译和本团群聊。"
                  : "运营授权范围内的履约协助。"}
            </p>
          </section>
        </>
      )}
    </StaffFrame>
  );
}

export function StaffTaskAction() {
  const { preview, tasks, resolved } = useStaffTasks();
  const { assignmentId = "", action = "" } = useParams();
  const task =
    tasks.find((item) => item.staff_assignment_id === assignmentId) ?? null;
  const valid = (
    [
      "passengers",
      "chat",
      "notice",
      "meeting",
      "journey",
      "delay",
      "incident",
      "support",
    ] as string[]
  ).includes(action);
  if (!resolved)
    return (
      <StaffFrame>
        <StatusCard title="正在验证任务">
          只读取分配给当前账户的任务。
        </StatusCard>
      </StaffFrame>
    );
  if (!task || !valid)
    return (
      <StaffFrame>
        <StatusCard title="无权访问此任务">
          任务不存在、未分配给当前账户或入口无效。
          <br />
          <Link to="/staff">返回工作台</Link>
        </StatusCard>
      </StaffFrame>
    );
  return (
    <StaffFrame task={task}>
      <header className="staff-welcome">
        <span>{roleLabel(task.assignment_role)}任务</span>
        <h1>
          {action === "passengers"
            ? "乘客点名"
            : action === "chat"
              ? "团队群聊"
              : action === "notice"
                ? "发送通知"
                : action === "meeting"
                  ? "集合管理"
                  : action === "journey"
                    ? "行程当天控制台"
                  : action === "delay"
                    ? "报告延误"
                    : action === "incident"
                      ? "异常上报"
                      : "联系运营"}
        </h1>
        <p>
          {task.trip_title} · {task.vehicle_label ?? task.vehicle_type}
        </p>
      </header>
      <TaskSummary task={task} />
      {action === "passengers" ? (
        <PassengerAction task={task} preview={preview} />
      ) : action === "chat" ? (
        <ChatAction task={task} />
      ) : action === "notice" ? (
        <NoticeAction task={task} />
      ) : action === "meeting" ? (
        <MeetingAction task={task} preview={preview} />
      ) : action === "journey" ? (
        <JourneyAction task={task} preview={preview} />
      ) : action === "delay" ? (
        <DelayAction task={task} preview={preview} />
      ) : (
        <EscalationAction task={task} kind={action as "incident" | "support"} />
      )}
      <Link className="staff-back" to="/staff">
        返回工作台
      </Link>
    </StaffFrame>
  );
}

function JourneyAction({task,preview}:{task:StaffTask;preview:boolean}){
  const {services}=useApp();
  const [stopName,setStopName]=useState(task.meeting_name??"");
  const [routeStops,setRouteStops]=useState<Array<{id:string;name:string;meetingTime:string;meetingPointName:string;meetingPointDescription?:string;latitude:number;longitude:number}>>([]);
  const [reason,setReason]=useState("按今日行程到达");
  const [busy,setBusy]=useState("");
  const [result,setResult]=useState("");
  useEffect(()=>{let active=true;if(services)void services.tripRoom.loadItinerary(task.vehicle_group_id).then(value=>{if(active)setRouteStops(value)});return()=>{active=false}},[services,task.vehicle_group_id]);
  const transition=async(action:'stop_arrived'|'trip_completed')=>{
    if(action==='stop_arrived'&&stopName.trim().length<2)return;
    if(!window.confirm(action==='trip_completed'?'确认结束本车行程？结束后群聊将转为只读。':`确认已到达“${stopName.trim()}”？`))return;
    if(preview||!services){setResult(action==='trip_completed'?'本地预览：行程已结束，群聊转为只读。':'本地预览：已更新当前景点。');return}
    const selectedStop=routeStops.find(stop=>stop.name===stopName.trim());
    setBusy(action);const value=action==='stop_arrived'&&selectedStop?await services.advanceStaffToItineraryStop(task.vehicle_group_id,selectedStop.id,reason.trim()):await services.advanceStaffJourney(task.vehicle_group_id,action,stopName.trim(),reason.trim());setBusy("");
    setResult(value?action==='trip_completed'?'行程已结束：司机定位已停止，群聊已转为只读。':'当前景点已更新，游客端已生成行程通知。':'操作失败，请检查任务状态、权限和说明。');
  };
  const shareLocation=()=>{
    if(!navigator.geolocation){setResult('当前设备不支持定位。');return}
    setBusy('location');navigator.geolocation.getCurrentPosition(async position=>{const ok=services?await services.publishStaffLocation(task.vehicle_group_id,position.coords.latitude,position.coords.longitude,position.coords.accuracy):true;setBusy('');setResult(ok?'司机位置已共享 15 分钟，游客仅能在本车行程中查看。':'位置共享失败，请检查定位权限和群聊状态。')},()=>{setBusy('');setResult('无法读取当前位置，请允许浏览器定位后重试。')},{enableHighAccuracy:true,timeout:10000,maximumAge:15000});
  };
  return <section className="staff-detail"><div className="staff-detail-note">到达景点会写入本车时间线并通知游客。选择下一节点后，可直接带入该线路的正式集合点资料；结束行程会停止定位并将群聊转为只读。</div>{routeStops.length>0&&<div className="staff-template-grid" aria-label="今日线路节点">{routeStops.map(stop=><button type="button" key={stop.id} className={stopName===stop.name?'active':''} onClick={()=>setStopName(stop.name)}><b>{stop.meetingTime}</b><span>{stop.name}</span><small>{stop.meetingPointName}</small></button>)}</div>}<form className="staff-escalation" onSubmit={e=>{e.preventDefault();void transition('stop_arrived')}}><label>当前到达景点<input required minLength={2} maxLength={160} value={stopName} onChange={e=>setStopName(e.target.value)}/></label><label>现场说明<textarea required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy!==''}>确认到达景点</button></form><div className="staff-template-grid"><button type="button" disabled={busy!==''} onClick={shareLocation}>{busy==='location'?'正在读取定位':'共享司机实时位置'}</button><button type="button" disabled={busy!==''} onClick={async()=>{setBusy('stop-location');const ok=services?await services.stopStaffLocation(task.vehicle_group_id):true;setBusy('');setResult(ok?'已停止共享司机位置。':'当前没有可停止的位置共享。')}}>停止位置共享</button><button type="button" disabled={busy!==''||reason.trim().length<3} onClick={()=>void transition('trip_completed')}>{busy==='trip_completed'?'正在结束':'结束本车行程'}</button></div>{result&&<p className="staff-result" role="status">{result}</p>}</section>
}

function PassengerAction({
  task,
  preview,
}: {
  task: StaffTask;
  preview: boolean;
}) {
  const { services } = useApp();
  const [rows, setRows] = useState<AttendanceRow[]>(() =>
    preview ? previewAttendance : [],
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [contacts, setContacts] = useState<
    Record<string, { contact_name: string; phone: string }>
  >({});
  const refresh = async () => {
    if (services) {
      setRows(
        (await services.tripRoom.loadAttendance(
          task.vehicle_group_id,
        )) as AttendanceRow[],
      );
      setSummary(
        (await services.tripRoom.loadAttendanceSummary(
          task.vehicle_group_id,
        )) as AttendanceSummary | null,
      );
    }
  };
  useEffect(() => {
    let active = true;
    if (!services)
      return () => {
        active = false;
      };
    void services.tripRoom
      .loadAttendance(task.vehicle_group_id)
      .then((value) => {
        if (active) setRows(value as AttendanceRow[]);
      });
    void services.tripRoom
      .loadAttendanceSummary(task.vehicle_group_id)
      .then((value) => {
        if (active) setSummary(value as AttendanceSummary | null);
      });
    return () => {
      active = false;
    };
  }, [services, task.vehicle_group_id]);
  const update = async (
    row: AttendanceRow,
    status: "at_meeting_point" | "boarded" | "needs_assistance",
  ) => {
    if (!services) {
      setRows((value) =>
        value.map((item) =>
          item.passenger_id === row.passenger_id ? { ...item, status } : item,
        ),
      );
      setNotice("本地预览已更新，不会写入服务器。");
      return;
    }
    setBusy(row.passenger_id + status);
    const ok = await services.tripRoom.setStaffCheckin(
      task.vehicle_group_id,
      row.passenger_id,
      status,
    );
    setBusy("");
    setNotice(ok ? "乘客状态已保存。" : "状态保存失败，请确认本车权限。");
    if (ok) await refresh();
  };
  const escalate = async (row: AttendanceRow) => {
    if (!services) {
      setNotice("已生成联系运营预览，不会发送外部通知。");
      return;
    }
    setBusy(row.passenger_id + "ops");
    const ok = await services.tripRoom.recordContact(
      task.vehicle_group_id,
      row.passenger_id,
      "escalated_to_operations",
    );
    setBusy("");
    setNotice(
      ok
        ? "已记录运营协助请求；不会显示乘客私人联系方式。"
        : "请求未保存，请联系运营后台核对。",
    );
    if (ok) await refresh();
  };
  const reveal = async (row: AttendanceRow) => {
    if (!services) {
      setContacts((value) => ({
        ...value,
        [row.passenger_id]: {
          contact_name: "TEST-订单联系人",
          phone: "000-0000-0000",
        },
      }));
      return;
    }
    setBusy(row.passenger_id + "phone");
    const contact = await services.tripRoom.loadStaffPassengerContact(
      task.vehicle_group_id,
      row.passenger_id,
    );
    setBusy("");
    if (!contact) {
      setNotice("尚未到直接联系时间，或订单没有可用联系电话。");
      return;
    }
    setContacts((value) => ({ ...value, [row.passenger_id]: contact }));
    setNotice("联系电话已按履约需要显示，本次查看已记录。");
  };
  return (
    <section className="staff-detail">
      <div className="staff-detail-note">
        仅显示本车团员和履约必要信息。联系电话只在允许联系后按需显示，并记录查看人和时间。
      </div>
      {summary && (
        <div
          className="staff-kpis staff-attendance-summary"
          aria-label="本车签到汇总"
        >
          <article>
            <span>已到集合点</span>
            <b>
              {summary.arrived}/{summary.total}
            </b>
            <small>
              {summary.all_present ? "全员已到" : `待确认 ${summary.pending}`}
            </small>
          </article>
          <article>
            <span>已登车</span>
            <b>{summary.boarded}</b>
            <small>按本人逐一确认</small>
          </article>
          <article>
            <span>需要协助</span>
            <b>{summary.needs_assistance}</b>
            <small>优先处理</small>
          </article>
        </div>
      )}
      {rows.length === 0 ? (
        <StatusCard title="暂无本车乘客">
          订单分车后，乘客会按车辆群组显示。
        </StatusCard>
      ) : (
        <div className="staff-passenger-list">
          {rows.map((row) => (
            <article key={row.passenger_id}>
              <header>
                <div>
                  <b>{row.passenger_label}</b>
                  <small>订单尾号 {row.order_id.slice(-6)}</small>
                </div>
                <em>{statusLabel[row.status] ?? row.status}</em>
              </header>
              {row.late_minutes ? <p className="staff-late-alert" role="status">预计迟到 {row.late_minutes}{row.late_minutes===15?' 分钟以上':' 分钟'}</p> : null}
              {contacts[row.passenger_id] && (
                <p>
                  <b>{contacts[row.passenger_id].contact_name}</b> ·{" "}
                  <a href={`tel:${contacts[row.passenger_id].phone}`}>
                    {contacts[row.passenger_id].phone}
                  </a>
                </p>
              )}
              <div>
                <button
                  disabled={busy !== ""}
                  onClick={() => void update(row, "at_meeting_point")}
                >
                  已到集合点
                </button>
                <button
                  disabled={busy !== ""}
                  onClick={() => void update(row, "boarded")}
                >
                  已登车
                </button>
                <button
                  disabled={busy !== ""}
                  onClick={() => void update(row, "needs_assistance")}
                >
                  需要协助
                </button>
                <button disabled={busy !== ""} onClick={() => void reveal(row)}>
                  拨打乘客电话
                </button>
                <button
                  disabled={busy !== ""}
                  onClick={() => void escalate(row)}
                >
                  联系运营
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {notice && (
        <p className="staff-result" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

function ChatAction({ task }: { task: StaffTask }) {
  const { services } = useApp();
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const open = task.room_status === "open" && Boolean(task.room_id);
  const refresh = async () => {
    if (services && task.room_id)
      setMessages(
        (await services.tripRoom.loadMessages(task.room_id)) as StaffMessage[],
      );
  };
  useEffect(() => {
    let active = true;
    if (!services || !task.room_id)
      return () => {
        active = false;
      };
    void services.tripRoom.loadMessages(task.room_id).then((value) => {
      if (active) setMessages(value as StaffMessage[]);
    });
    return () => {
      active = false;
    };
  }, [services, task.room_id]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!services || !task.room_id || !content.trim()) return;
    const ok = await services.tripRoom.sendMessage(task.room_id, content);
    setNotice(
      ok ? "消息已发送到本车群组。" : "发送失败，请确认房间状态和本车权限。",
    );
    if (ok) {
      setContent("");
      await refresh();
    }
  };
  return (
    <section className="staff-detail">
      <div className="staff-detail-note">
        群聊成员仅限本车乘客、司机、导游和授权运营；不会展示私人
        LINE、微信或手机号。
      </div>
      <div className="staff-chat-list">
        {messages.length === 0 ? (
          <p>暂无消息。</p>
        ) : (
          messages.map((item) => (
            <article
              className={item.important ? "important" : ""}
              key={item.id}
            >
              <header>
                <b>{item.important ? "重要通知" : "本车消息"}</b>
                <small>
                  {new Intl.DateTimeFormat("zh-CN", {
                    timeZone: "Asia/Tokyo",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(item.created_at))}
                </small>
              </header>
              <p>{item.original_content ?? item.content}</p>
            </article>
          ))
        )}
      </div>
      <form className="staff-composer" onSubmit={(event) => void submit(event)}>
        <label>
          发送到本车群组
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={1000}
            disabled={!open}
            placeholder={open ? "输入本车群消息" : "Trip Room 尚未开放"}
          />
        </label>
        <button disabled={!open || !content.trim()}>发送消息</button>
      </form>
      {notice && (
        <p className="staff-result" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

function NoticeAction({ task }: { task: StaffTask }) {
  const { services } = useApp();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const open = task.room_status === "open" && Boolean(task.room_id);
  const send = async (key: string) => {
    if (!services || !task.room_id) return;
    setBusy(key);
    const ok = await services.tripRoom.sendStaffTemplate(task.room_id, key);
    setBusy("");
    setNotice(
      ok
        ? "重要通知已发送并保留原文；翻译服务可按乘客偏好追加译文。"
        : "发送失败，请确认房间已开放且您属于本车工作人员。",
    );
  };
  return (
    <section className="staff-detail">
      <div className="staff-detail-note">
        模板通知仅发送到本车 Trip Room。没有接入短信、LINE
        或外部推送时，不会伪装已经送达。
      </div>
      <div className="staff-template-grid">
        {staffTemplates.map(([key, label]) => (
          <button
            type="button"
            key={key}
            disabled={!open || busy !== ""}
            onClick={() => void send(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {!open && (
        <p className="staff-result">Trip Room 尚未开放，通知按钮保持禁用。</p>
      )}
      {notice && (
        <p className="staff-result" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

function MeetingAction({
  task,
  preview,
}: {
  task: StaffTask;
  preview: boolean;
}) {
  const { services } = useApp();
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingName, setMeetingName] = useState(task.meeting_name ?? "");
  const [meetingAddress, setMeetingAddress] = useState(
    task.meeting_address ?? "",
  );
  const [latitude, setLatitude] = useState(task.map_lat?.toString() ?? "");
  const [longitude, setLongitude] = useState(task.map_lng?.toString() ?? "");
  const [landmark, setLandmark] = useState("");
  const [reason, setReason] = useState("首次确认集合信息");
  const [revision, setRevision] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "saving">(
    services ? "loading" : "idle",
  );
  const [result, setResult] = useState("");
  useEffect(() => {
    let active = true;
    if (!services) {
      return () => {
        active = false;
      };
    }
    void services.loadStaffMeeting(task.vehicle_group_id).then((meeting) => {
      if (!active) return;
      if (meeting) {
        const local = new Date(meeting.meeting_at);
        local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
        setMeetingAt(local.toISOString().slice(0, 16));
        setMeetingName(meeting.meeting_name);
        setMeetingAddress(meeting.meeting_address);
        setLatitude(String(meeting.latitude));
        setLongitude(String(meeting.longitude));
        setLandmark(meeting.landmark_description);
        setReason("");
        setRevision(meeting.revision);
      }
      setStatus("idle");
    });
    return () => {
      active = false;
    };
  }, [services, task.vehicle_group_id]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const lat = Number(latitude),
      lng = Number(longitude);
    if (
      !meetingAt ||
      !meetingName.trim() ||
      !meetingAddress.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      reason.trim().length < 3
    )
      return;
    if (preview || !services) {
      setRevision((value) => (value ?? 0) + 1);
      setResult("本地预览已更新，不会写入服务器或通知游客。");
      return;
    }
    setStatus("saving");
    const nextRevision = await services.updateStaffMeeting({
      vehicleGroupId: task.vehicle_group_id,
      meetingAt: new Date(meetingAt).toISOString(),
      meetingName: meetingName.trim(),
      meetingAddress: meetingAddress.trim(),
      latitude: lat,
      longitude: lng,
      landmarkDescription: landmark.trim(),
      reason: reason.trim(),
    });
    setStatus("idle");
    if (nextRevision == null) {
      setResult("集合信息未保存，请检查坐标、变更原因和本车权限。");
      return;
    }
    setRevision(nextRevision);
    setReason("");
    setResult(
      "集合信息已保存；游客端将读取新坐标，已开放群聊会生成重大变更通知。",
    );
  };
  if (status === "loading")
    return (
      <StatusCard title="正在读取当前集合点">核对当前版本与坐标。</StatusCard>
    );
  return (
    <section className="staff-detail">
      <div className="staff-detail-note">
        当前版本：{revision ?? "尚未建立"}
        。首次确认和每次变更都必须填写原因；提交后旧坐标立即失效。
      </div>
      <form
        className="staff-escalation"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          集合时间（设备时区）
          <input
            type="datetime-local"
            required
            value={meetingAt}
            onChange={(event) => setMeetingAt(event.target.value)}
          />
        </label>
        <label>
          集合地点名称
          <input
            required
            minLength={2}
            maxLength={160}
            value={meetingName}
            onChange={(event) => setMeetingName(event.target.value)}
          />
        </label>
        <label>
          详细地址
          <input
            required
            minLength={3}
            maxLength={300}
            value={meetingAddress}
            onChange={(event) => setMeetingAddress(event.target.value)}
          />
        </label>
        <div className="staff-coordinate-grid">
          <label>
            纬度
            <input
              inputMode="decimal"
              required
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </label>
          <label>
            经度
            <input
              inputMode="decimal"
              required
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </label>
        </div>
        <label>
          明显地标说明
          <textarea
            maxLength={500}
            value={landmark}
            onChange={(event) => setLandmark(event.target.value)}
          />
        </label>
        <label>
          确认／变更原因
          <textarea
            required
            minLength={3}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <button disabled={status === "saving"}>
          {status === "saving" ? "正在保存" : "保存集合信息"}
        </button>
      </form>
      {result && (
        <p className="staff-result" role="status">
          {result}
        </p>
      )}
    </section>
  );
}

function DelayAction({ task, preview }: { task: StaffTask; preview: boolean }) {
  const { services } = useApp();
  const [minutes, setMinutes] = useState("15");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const delayMinutes = Number(minutes);
    if (
      !Number.isInteger(delayMinutes) ||
      delayMinutes < 1 ||
      delayMinutes > 360 ||
      reason.trim().length < 3
    )
      return;
    if (preview || !services) {
      setResult("本地预览：延误记录不会写入服务器或通知乘客。");
      return;
    }
    setBusy(true);
    const ok = await services.reportStaffDelay(
      task.vehicle_group_id,
      delayMinutes,
      reason.trim(),
    );
    setBusy(false);
    setResult(
      ok
        ? "延误已记录；群聊重大通知与本车乘客必要通知已进入待发送队列。"
        : "延误未保存，请检查本车权限、分钟数和原因。",
    );
    if (ok) setReason("");
  };
  return (
    <section className="staff-detail">
      <div className="staff-detail-note">
        延误通知只发给本车已付款乘客。页面显示“已进入待发送队列”，不会把尚未送达的外部通知标记为成功。
      </div>
      <form
        className="staff-escalation"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          预计延误分钟数
          <input
            type="number"
            min={1}
            max={360}
            required
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
        <label>
          延误原因
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="例如：高速公路事故拥堵，预计晚到约 20 分钟"
          />
        </label>
        <button disabled={busy || reason.trim().length < 3}>
          {busy ? "正在提交" : "提交延误通知"}
        </button>
      </form>
      {result && (
        <p className="staff-result" role="status">
          {result}
        </p>
      )}
    </section>
  );
}

function EscalationAction({
  task,
  kind,
}: {
  task: StaffTask;
  kind: "incident" | "support";
}) {
  const { services } = useApp();
  const [category, setCategory] = useState(
    kind === "incident" ? "车辆或交通异常" : "需要运营协助",
  );
  const [detail, setDetail] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail.trim()) return;
    if (!services) {
      setResult(`本地预览：已生成“${category}”记录，不会写入服务器。`);
      return;
    }
    setBusy(true);
    const eventType =
      kind === "incident"
        ? category === "车辆或交通异常"
          ? "delay_reported"
          : "incident_reported"
        : "support_requested";
    const ok = await services.recordStaffExecution(
      task.vehicle_group_id,
      eventType,
      { category, detail: detail.trim() },
    );
    setBusy(false);
    setResult(
      ok
        ? "已提交运营记录并保留提交人、时间和任务范围。"
        : "提交失败，请检查任务权限或稍后重试。",
    );
  };
  return (
    <section className="staff-detail">
      <div className="staff-detail-note">
        任务将绑定当前 Vehicle Group：{task.vehicle_group_id.slice(-8)}
        。禁止填写乘客支付资料或不必要的私人信息。
      </div>
      <form className="staff-escalation" onSubmit={submit}>
        <label>
          类型
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {kind === "incident" ? (
              <>
                <option>车辆或交通异常</option>
                <option>集合点变更</option>
                <option>乘客走散</option>
                <option>医疗或安全事件</option>
              </>
            ) : (
              <>
                <option>需要运营协助</option>
                <option>付款资格人工核对</option>
                <option>乘客联系请求</option>
                <option>调度调整请求</option>
              </>
            )}
          </select>
        </label>
        <label>
          情况说明
          <textarea
            required
            maxLength={800}
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder="填写事实、地点和需要的协助；不要填写卡号或私人聊天账号"
          />
        </label>
        <button disabled={!detail.trim() || busy}>
          {busy ? "正在提交" : "提交运营记录"}
        </button>
      </form>
      {result && (
        <p className="staff-result" role="status">
          {result}
        </p>
      )}
      <p className="privacy">
        记录保存在运营审计队列；对接 Yuzu Dispatch
        后可继续使用同一幂等接口外发。
      </p>
    </section>
  );
}

function TaskSummary({ task }: { task: StaffTask }) {
  return (
    <section className="staff-active-card">
      <div>
        <span>
          {dayLabel(task.departs_at)} {timeLabel(task.departs_at)} ·{" "}
          {roleLabel(task.assignment_role)}
        </span>
        <h2>{task.trip_title}</h2>
        <p>
          {task.meeting_name ?? "集合点待确认"}
          {task.meeting_address ? ` · ${task.meeting_address}` : ""}
        </p>
        {task.chat_opens_at && task.room_status !== "open" && (
          <p>团队聊天将于 {dayLabel(task.chat_opens_at)} {timeLabel(task.chat_opens_at)} 开放</p>
        )}
      </div>
      <em>
        {task.room_status === "open"
          ? "执行中"
          : task.room_status === "frozen"
            ? "待开放"
            : "待确认"}
      </em>
    </section>
  );
}
function StatusCard({
  title,
  children,
  alert = false,
}: {
  title: string;
  children: ReactNode;
  alert?: boolean;
}) {
  return (
    <div className="staff-empty" role={alert ? "alert" : undefined}>
      <b>{title}</b>
      <p>{children}</p>
    </div>
  );
}
function StaffFrame({
  children,
  task = null,
}: {
  children: ReactNode;
  task?: StaffTask | null;
}) {
  const location = useLocation();
  const action = location.pathname.split("/").at(-1);
  const passengerPath = task ? taskPath(task, "passengers") : "/staff#tasks";
  const chatPath = task ? taskPath(task, "chat") : "/staff#tasks";
  return (
    <div className="staff-stage">
      <main className="staff-phone">
        <header className="staff-top">
          <span className="staff-logo">JT</span>
          <div>
            <b>Japan Travel Weekend</b>
            <small>工作人员工作台</small>
          </div>
          <Link to="/app">乘客端</Link>
        </header>
        <div className="staff-content">{children}</div>
        <nav className="staff-nav" aria-label="工作人员导航">
          <Link
            className={
              location.pathname === "/staff" && !location.hash ? "active" : ""
            }
            to="/staff"
          >
            今日
          </Link>
          <Link
            className={location.hash === "#tasks" ? "active" : ""}
            to="/staff#tasks"
          >
            任务
          </Link>
          <Link
            className={action === "passengers" ? "active" : ""}
            to={passengerPath}
          >
            乘客
          </Link>
          <Link className={action === "chat" ? "active" : ""} to={chatPath}>
            消息
          </Link>
          <Link
            className={location.pathname === "/app/profile" ? "active" : ""}
            to="/app/profile"
          >
            我的
          </Link>
        </nav>
      </main>
    </div>
  );
}
