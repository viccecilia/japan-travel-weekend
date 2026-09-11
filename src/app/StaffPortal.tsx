import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import QRCode from "qrcode";
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
  journey_status?: "pending" | "ready" | "meeting" | "in_progress" | "completed" | string;
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
const japanDateTime=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
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
  const {state}=useApp();
  const location=useLocation();
  const [selected, setSelected] = useState<string | null>(null);
  const [scheduleStatus,setScheduleStatus]=useState<'all'|'pending'|'active'|'completed'>('all');
  const [scheduleDate,setScheduleDate]=useState('');
  const [staffReferral,setStaffReferral]=useState<{code:string;completedInvites:number;pendingInvites:number}|null>(null);
  const [staffCommission,setStaffCommission]=useState<{pendingJpy?:number;availableJpy:number;lockedJpy:number;paidJpy:number;payouts:Array<{id:string;weekStart:string;amountJpy:number;status:string}>}|null>(null);
  const [qrUrl,setQrUrl]=useState('');
  const [workflowNotice, setWorkflowNotice] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [leaves,setLeaves]=useState<Array<{id:string;starts_at:string;ends_at:string;reason:string;status:string;review_note:string}>>([]);
  const [leaveOpen,setLeaveOpen]=useState(false);
  const [leaveNotice,setLeaveNotice]=useState('');
  useEffect(()=>{let mounted=true;if(services&&typeof services.loadOwnStaffLeaves==='function')void services.loadOwnStaffLeaves().then(value=>{if(mounted)setLeaves(value)});return()=>{mounted=false}},[services]);
  useEffect(()=>{let mounted=true;if(!services)return()=>{mounted=false};void Promise.all([services.loadOwnReferralSummary(),services.loadOwnCashCommissionSummary()]).then(([referral,commission])=>{if(!mounted)return;setStaffReferral(referral);setStaffCommission(commission);if(referral?.code){const link=`${window.location.origin}/app/create-account?ref=${encodeURIComponent(referral.code)}`;void QRCode.toDataURL(link,{width:220,margin:1,errorCorrectionLevel:'M'}).then(value=>{if(mounted)setQrUrl(value)})}});return()=>{mounted=false}},[services]);
  const submitLeave=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const startsDate=new Date(String(form.get('startsAt')));const endsDate=new Date(String(form.get('endsAt')));if(!Number.isFinite(startsDate.getTime())||!Number.isFinite(endsDate.getTime())||endsDate<=startsDate){setLeaveNotice('请假结束时间必须晚于开始时间。');return}const reason=String(form.get('reason')).trim();setWorkflowBusy(true);const ok=services&&typeof services.submitOwnStaffLeave==='function'?await services.submitOwnStaffLeave(startsDate.toISOString(),endsDate.toISOString(),reason):true;setWorkflowBusy(false);setLeaveNotice(ok?'请假申请已提交，批准前仍需按原派单出勤。':'提交失败，请检查时间是否重复或联系运营。');if(ok){setLeaveOpen(false);if(services&&typeof services.loadOwnStaffLeaves==='function')setLeaves(await services.loadOwnStaffLeaves())}};
  const active = useMemo(
    () =>
      tasks.find((task) => task.staff_assignment_id === selected) ??
      tasks[0] ??
      null,
    [tasks, selected],
  );
  const execute = async (type: "meeting_started") => {
    if (!active) return;
    if (!services) {
      setWorkflowNotice("本地预览：已发起集合。");
      return;
    }
    setWorkflowBusy(true);
    const ok = await services.recordStaffExecution(
      active.vehicle_group_id,
      type,
    );
    setWorkflowBusy(false);
    setWorkflowNotice(ok?"已发起集合，游客端将显示“我已到达”。":"操作未保存，请确认任务权限和群聊开放状态。");
  };
  if (!resolved)
    return (
      <StaffFrame>
        <StatusCard title="正在读取工作人员任务">
          仅加载分配给当前账户的车辆与团组。
        </StatusCard>
      </StaffFrame>
    );
  const portalView=location.pathname==='/staff/schedule'?'schedule':location.pathname==='/staff/map'?'map':location.pathname==='/staff/messages'?'messages':location.pathname==='/staff/profile'?'profile':'today';
  const taskPhase=(task:StaffTask)=>task.journey_status==='completed'?'completed' as const:task.journey_status&&['meeting','in_progress'].includes(task.journey_status)?'active' as const:'pending' as const;
  const filteredTasks=tasks.filter(task=>(scheduleStatus==='all'||taskPhase(task)===scheduleStatus)&&(!scheduleDate||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date(task.departs_at??0))===scheduleDate));
  if(portalView==='schedule')return <StaffFrame task={active}><header className="staff-welcome"><span>工作人员端</span><h1>行程</h1><p>按日期和执行状态查看本人已分配任务。</p></header><section className="staff-filter-panel"><label>日期筛选<input aria-label="行程日期" type="date" value={scheduleDate} onChange={event=>setScheduleDate(event.target.value)}/></label><div role="group" aria-label="行程状态">{([['all','全部'],['pending','待执行'],['active','进行中'],['completed','已完成']] as const).map(([value,label])=><button type="button" key={value} className={scheduleStatus===value?'active':''} onClick={()=>setScheduleStatus(value)}>{label}</button>)}</div></section>{filteredTasks.length?<section className="staff-view-list">{filteredTasks.map(task=><article key={task.staff_assignment_id}><span>{dayLabel(task.departs_at)} · {timeLabel(task.departs_at)} · {taskPhase(task)==='pending'?'待执行':taskPhase(task)==='active'?'进行中':'已完成'}</span><h2>{task.trip_title}</h2><p>{task.meeting_name??'集合点待确认'} · {task.vehicle_label??task.vehicle_type}</p><Link to={taskPath(task,'journey')}>打开行程</Link></article>)}</section>:<StatusCard title="当前筛选没有行程">更改日期或状态后，可查看其他已分配任务。</StatusCard>}</StaffFrame>;
  if(portalView==='map')return <StaffFrame task={active}><header className="staff-welcome"><span>工作人员端</span><h1>地图</h1><p>只显示当前账户获派任务的集合点与路线入口。</p></header>{tasks.length?<section className="staff-view-list">{tasks.map(task=><article key={task.staff_assignment_id}><span>{dayLabel(task.departs_at)} · {timeLabel(task.departs_at)}</span><h2>{task.trip_title}</h2><p>{task.meeting_name??'集合点待确认'}{task.meeting_address?` · ${task.meeting_address}`:''}</p>{task.map_lat!=null&&task.map_lng!=null?<a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${task.map_lat},${task.map_lng}`}>导航到集合点</a>:<small>坐标待运营确认</small>}<Link to={taskPath(task,'journey')}>查看路线节点</Link></article>)}</section>:<StatusCard title="暂无可显示的任务地图">获得任务后，这里会显示本人任务的集合点、路线节点和导航入口。</StatusCard>}</StaffFrame>;
  if(portalView==='messages')return <StaffFrame task={active}><header className="staff-welcome"><span>工作人员端</span><h1>消息</h1><p>仅列出有权访问的本车行程群与工作通知。</p></header>{tasks.some(task=>task.room_id)?<section className="staff-view-list">{tasks.filter(task=>task.room_id).map(task=><article key={task.staff_assignment_id}><span>{task.room_status==='open'?'群聊已开放':'群聊待开放'}</span><h2>{task.trip_title}</h2><p>{dayLabel(task.departs_at)} · {task.vehicle_label??task.vehicle_type}</p><Link to={taskPath(task,'chat')}>{task.room_status==='open'?'进入行程群':'查看开放时间'}</Link></article>)}</section>:<StatusCard title="暂无消息或行程群">运营通知和已授权的行程群开放后会显示在这里。</StatusCard>}</StaffFrame>;
  if(portalView==='profile'){
    const referralLink=staffReferral?.code?`${window.location.origin}/app/create-account?ref=${encodeURIComponent(staffReferral.code)}`:'';
    return <StaffFrame task={active}><header className="staff-welcome"><span>工作人员端</span><h1>我的</h1><p>资料、推广链接、佣金与提现记录。</p></header><section className="staff-profile-card"><h2>账户资料</h2><p>{state.user?.email??'当前工作人员账户'}</p><Link to="/app/profile">维护允许修改的称呼与联系资料</Link></section><section className="staff-profile-card"><h2>固定推广链接</h2>{referralLink?<><code>{referralLink}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(referralLink)}>复制链接</button>{qrUrl&&<img src={qrUrl} alt="本人固定推广链接二维码"/>}<div className="staff-kpis"><article><span>进行中</span><b>{staffReferral?.pendingInvites??0}</b><small>最近推荐状态</small></article><article><span>累计完成</span><b>{staffReferral?.completedInvites??0}</b><small>有效推荐</small></article></div></>:<p>推广资格或固定链接尚未开通，请联系运营确认。</p>}</section><section className="staff-profile-card"><h2>现金佣金</h2><div className="staff-kpis"><article><span>待结算</span><b>¥{(staffCommission?.pendingJpy??0).toLocaleString()}</b></article><article><span>提现处理中</span><b>¥{(staffCommission?.lockedJpy??0).toLocaleString()}</b></article><article><span>可提现</span><b>¥{(staffCommission?.availableJpy??0).toLocaleString()}</b></article><article><span>累计已付</span><b>¥{(staffCommission?.paidJpy??0).toLocaleString()}</b></article></div>{staffCommission?.payouts.length?<div className="staff-profile-payouts">{staffCommission.payouts.map(item=><p key={item.id}>{item.weekStart} · ¥{item.amountJpy.toLocaleString()} · {item.status}</p>)}</div>:<p>暂无提现记录。每个日本自然周最多申请一次。</p>}</section></StaffFrame>;
  }
  return (
    <StaffFrame task={active}>
      {preview && (
        <div className="staff-preview">
          本地界面预览 · 不代表真实任务或乘客
        </div>
      )}
      <header className="staff-welcome">
        <span>工作人员端</span>
        <h1>今日履约</h1>
        <p>只显示分配给你的任务和本车乘客。</p>
      </header>
      <section className="staff-actions staff-leave-panel">
        <h2>出勤与请假</h2>
        <p>无法出勤时必须提前在系统提交请假。后台批准后，该时段将停止自动派单；已有任务不会自动消失，请等待运营调整。</p>
        <div><button type="button" onClick={()=>setLeaveOpen(value=>!value)}>{leaveOpen?'收起申请':'申请请假'}</button></div>
        {leaveOpen&&<form className="staff-leave-form" onSubmit={submitLeave}><label>请假开始<input required name="startsAt" type="datetime-local"/></label><label>请假结束<input required name="endsAt" type="datetime-local"/></label><label>原因<textarea required name="reason" minLength={2} maxLength={300}/></label><button disabled={workflowBusy}>提交后台审核</button></form>}
        {leaveNotice&&<p className="staff-result" role="status">{leaveNotice}</p>}
        {leaves.length>0&&<div className="staff-leave-list">{leaves.slice(0,5).map(item=><article key={item.id}><b>{item.status==='pending'?'待审核':item.status==='approved'?'已批准':item.status==='rejected'?'已拒绝':'已取消'}</b><span>{japanDateTime(item.starts_at)} — {japanDateTime(item.ends_at)}</span><small>{item.reason}{item.review_note?` · ${item.review_note}`:''}</small>{item.status==='pending'&&<button type="button" onClick={async()=>{if(services&&typeof services.cancelOwnStaffLeave==='function'&&await services.cancelOwnStaffLeave(item.id)&&typeof services.loadOwnStaffLeaves==='function')setLeaves(await services.loadOwnStaffLeaves())}}>撤回</button>}</article>)}</div>}
      </section>
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
              <span className="staff-assignment-confirmed">已由运营确认排班</span>
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
              <span>剩余未登车</span>
              <b>{Math.max(0, active.passenger_count-active.boarded_count)}</b>
              <small>仅履约名单</small>
            </article>
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
                ? "车辆、导航、点名、司机通知和本车群聊。"
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
  const [freeMinutes,setFreeMinutes]=useState(90);
  const [busy,setBusy]=useState("");
  const [result,setResult]=useState("");
  const locationWatch=useRef<number|null>(null);
  const locationSession=useRef<{sessionId:string;expiresAt:string}>({sessionId:crypto.randomUUID(),expiresAt:new Date(Date.now()+30*60_000).toISOString()});
  const locationSequence=useRef(0);
  const locationSending=useRef(false);
  const locationFailures=useRef(0);
  const stopLocation=async()=>{if(locationWatch.current!==null){navigator.geolocation.clearWatch(locationWatch.current);locationWatch.current=null}const ok=preview||!services?true:await services.stopStaffLocation(task.vehicle_group_id);setResult(ok?'已停止采集和公开司机位置。':'当前没有可停止的位置共享。');};
  useEffect(()=>()=>{if(locationWatch.current!==null){navigator.geolocation.clearWatch(locationWatch.current);if(services)void services.stopStaffLocation(task.vehicle_group_id)}},[services,task.vehicle_group_id]);
  useEffect(()=>{let active=true;if(services)void services.tripRoom.loadItinerary(task.vehicle_group_id).then(value=>{if(active)setRouteStops(value)});return()=>{active=false}},[services,task.vehicle_group_id]);
  const transition=async(action:'stop_arrived'|'trip_completed')=>{
    if(action==='stop_arrived'&&stopName.trim().length<2)return;
    if(!window.confirm(action==='trip_completed'?'确认结束本车行程？结束后群聊将转为只读。':`确认已到达“${stopName.trim()}”？`))return;
    if(preview||!services){setResult(action==='trip_completed'?'本地预览：行程已结束，群聊转为只读。':'本地预览：已更新当前景点。');return}
    const selectedStop=routeStops.find(stop=>stop.name===stopName.trim());
    setBusy(action);const value=action==='stop_arrived'&&selectedStop?await services.advanceStaffToItineraryStop(task.vehicle_group_id,selectedStop.id,reason.trim()):await services.advanceStaffJourney(task.vehicle_group_id,action,stopName.trim(),reason.trim());setBusy("");
    if(value&&action==='trip_completed'&&locationWatch.current!==null){navigator.geolocation.clearWatch(locationWatch.current);locationWatch.current=null;if(services)await services.stopStaffLocation(task.vehicle_group_id)}
    setResult(value?action==='trip_completed'?'行程已结束：司机定位已停止，群聊已转为只读。':'当前景点已更新，游客端已生成行程通知。':'操作失败，请检查任务状态、权限和说明。');
  };
  const shareLocation=async()=>{
    if(!navigator.geolocation){setResult('当前设备不支持定位。');return}
    if(locationWatch.current!==null){setResult('行程位置正在采集中。');return}
    setBusy('location');const session=preview||!services?{sessionId:crypto.randomUUID(),expiresAt:new Date(Date.now()+30*60_000).toISOString()}:await services.startStaffLocation(task.vehicle_group_id);if(!session){setBusy('');setResult('无法开启定位会话，请检查任务、群聊和工作人员权限。');return}locationSession.current=session;locationSequence.current=0;locationFailures.current=0;locationWatch.current=navigator.geolocation.watchPosition(async position=>{if(locationSending.current)return;locationSending.current=true;let activeSession=locationSession.current;if(!preview&&services&&new Date(activeSession.expiresAt).getTime()-Date.now()<2*60_000){const renewed=await services.startStaffLocation(task.vehicle_group_id);if(!renewed){locationSending.current=false;if(locationWatch.current!==null)navigator.geolocation.clearWatch(locationWatch.current);locationWatch.current=null;setResult('定位会话无法续期，可能是任务已结束或账号权限已撤销，采集已停止。');return}locationSession.current=renewed;activeSession=renewed;locationSequence.current=0}locationSequence.current+=1;let ok=preview||!services?true:await services.publishStaffLocation(task.vehicle_group_id,activeSession.sessionId,position.coords.latitude,position.coords.longitude,position.coords.accuracy,new Date(position.timestamp).toISOString(),locationSequence.current);if(!ok&&!preview&&services){const renewed=await services.startStaffLocation(task.vehicle_group_id);if(renewed){locationSession.current=renewed;locationSequence.current=1;ok=await services.publishStaffLocation(task.vehicle_group_id,renewed.sessionId,position.coords.latitude,position.coords.longitude,position.coords.accuracy,new Date(position.timestamp).toISOString(),1)}}locationSending.current=false;setBusy('');if(ok){locationFailures.current=0;setResult(`位置持续采集中；最近采集 ${new Date(position.timestamp).toLocaleTimeString('zh-CN')}，精度约 ${Math.round(position.coords.accuracy)} 米。会话会在到期前自动续期。`)}else{locationFailures.current+=1;if(locationFailures.current>=2&&locationWatch.current!==null){navigator.geolocation.clearWatch(locationWatch.current);locationWatch.current=null;setResult('连续两次位置上报失败，可能是任务结束或权限撤销，采集已安全停止。')}else setResult('位置上报失败，系统将再尝试一次续期。')}},()=>{setBusy('');setResult('无法读取当前位置，请允许浏览器定位后重试。')},{enableHighAccuracy:true,timeout:15000,maximumAge:10000});
  };
  return <section className="staff-detail"><div className="staff-detail-note">到达景点会写入本车时间线并通知游客。开始自由活动会向已付款游客发送随行提醒；结束行程会停止定位并将群聊转为只读。</div>{task.map_lat!=null&&task.map_lng!=null&&<a className="button full" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${task.map_lat},${task.map_lng}`}>导航到今日集合点</a>}{routeStops.length>0&&<div className="staff-template-grid" aria-label="今日线路节点">{routeStops.map(stop=><article key={stop.id} className={stopName===stop.name?'active':''}><button type="button" onClick={()=>setStopName(stop.name)}><b>{stop.meetingTime}</b><span>{stop.name}</span><small>{stop.meetingPointName}</small></button><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}>导航到此站</a></article>)}</div>}<form className="staff-escalation" onSubmit={e=>{e.preventDefault();void transition('stop_arrived')}}><label>当前到达景点<input required minLength={2} maxLength={160} value={stopName} onChange={e=>setStopName(e.target.value)}/></label><label>现场说明<textarea required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy!==''}>确认到达景点</button></form><div className="staff-template-grid"><label>自由活动分钟<input type="number" min={5} max={360} value={freeMinutes} onChange={e=>setFreeMinutes(Number(e.target.value))}/></label><button type="button" disabled={busy!==''||stopName.trim().length<2} onClick={async()=>{if(!window.confirm(`确认在“${stopName.trim()}”开始约 ${freeMinutes} 分钟自由活动？`))return;setBusy('free-time');const ok=preview||!services?true:await services.startStaffFreeTime(task.vehicle_group_id,stopName.trim(),freeMinutes);setBusy('');setResult(ok?'自由活动已开始，已付款游客将收到 AI 随行与集合提醒。':'操作失败，请确认群聊已开放和工作人员权限。')}}>{busy==='free-time'?'正在发布':'开始自由活动'}</button><button type="button" disabled={busy!==''} onClick={shareLocation}>{busy==='location'?'正在读取定位':'开始共享行程位置'}</button><button type="button" disabled={busy!==''} onClick={()=>void stopLocation()}>停止位置共享</button><button type="button" disabled={busy!==''||reason.trim().length<3} onClick={()=>void transition('trip_completed')}>{busy==='trip_completed'?'正在结束':'结束本车行程'}</button></div>{result&&<p className="staff-result" role="status">{result}</p>}</section>
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
        延误通知只发给本车乘客。页面显示“已进入待发送队列”，不会把尚未送达的外部通知标记为成功。
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
  const { services } = useApp();
  const location = useLocation();
  const action = location.pathname.split("/").at(-1);
  const tabPath=action==='meeting'?'/staff/map':action==='chat'?'/staff/messages':location.pathname;
  return (
    <div className="staff-stage">
      <main className="staff-phone">
        <header className="staff-top">
          <span className="staff-logo">JT</span>
          <div>
            <b>Japan Travel Weekend</b>
            <small>工作人员工作台</small>
          </div>
          <button type="button" onClick={()=>void services?.signOut()}>退出</button>
        </header>
        <div className="staff-content">{children}</div>
        <nav className="staff-nav" aria-label="工作人员导航">
          <Link
            aria-current={tabPath === "/staff" ? "page" : undefined}
            className={
              tabPath === "/staff" ? "active" : ""
            }
            to="/staff"
          >
            今日
          </Link>
          <Link
            aria-current={tabPath === "/staff/schedule" ? "page" : undefined}
            className={tabPath === "/staff/schedule" ? "active" : ""}
            to="/staff/schedule"
          >
            行程
          </Link>
          <Link
            aria-current={tabPath === "/staff/map" ? "page" : undefined}
            className={tabPath === "/staff/map" ? "active" : ""}
            to="/staff/map"
          >
            地图
          </Link>
          <Link aria-current={tabPath === "/staff/messages" ? "page" : undefined} className={tabPath === "/staff/messages" ? "active" : ""} to="/staff/messages">
            消息
          </Link>
          <Link aria-current={tabPath === "/staff/profile" ? "page" : undefined} className={tabPath === "/staff/profile" ? "active" : ""} to="/staff/profile">我的</Link>
        </nav>
      </main>
    </div>
  );
}
