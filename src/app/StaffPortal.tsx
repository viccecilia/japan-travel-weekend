import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import {StaffChat} from './StaffChat';
import { isSeedEnabled } from "../shared/config/businessRules";
import { useApp } from "./store";
import {isExecutableStaffTask,isFutureActiveStaffTask,selectCurrentStaffTask,selectNextStaffTask,selectPrimaryStaffTask,taskPhase,taskSortTime,tokyoDay} from './staffTaskSelection';
import {StaffLiveMap} from './StaffLiveMap';
import {leaveCoverageForDay,taskLeaveConflict} from './staffLeave';

export type StaffTask = {
  staff_assignment_id: string;
  assignment_role: "driver" | "guide" | "operations";
  vehicle_group_id: string;
  room_id: string | null;
  room_status: string | null;
  departure_id: string;
  trip_title: string;
  departs_at: string | null;
  ends_at?: string | null;
  chat_opens_at: string | null;
  meeting_at?: string | null;
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
  driver_name?: string | null;
  guide_name?: string | null;
  assignment_acknowledged?: boolean;
  assignment_acknowledged_at?: string | null;
};
export type DriverTaskStage="pending_confirmation"|"confirmed"|"departing"|"at_meeting"|"boarded"|"in_progress"|"completed"|"cancelled"|"exception";
export function driverTaskStage(task:StaffTask,now=new Date()):DriverTaskStage{
  if(task.journey_status==='cancelled')return 'cancelled';
  if(task.journey_status==='completed')return 'completed';
  const future=Boolean(task.departs_at)&&new Date(task.departs_at!).getTime()>now.getTime();
  if(future)return task.assignment_acknowledged?'confirmed':'pending_confirmation';
  if(task.journey_status==='meeting')return 'at_meeting';
  if(task.journey_status==='in_progress')return 'in_progress';
  if(task.assignment_acknowledged===false)return 'pending_confirmation';
  return 'departing';
}
const driverStageLabel:Record<DriverTaskStage,string>={pending_confirmation:'待确认',confirmed:'已确认 · 待出发',departing:'前往集合点',at_meeting:'已到集合点',boarded:'乘客已上车',in_progress:'行程中',completed:'已完成',cancelled:'已取消',exception:'异常'};
const futureDays=(now:Date,count=7)=>Array.from({length:count},(_,index)=>new Date(now.getTime()+index*86_400_000));
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
    departs_at: new Date(Date.now() - 30*60_000).toISOString(),
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
    journey_status: "meeting",
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
    journey_status: "pending",
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
  const targetKey=tokyoDay(target);const now=new Date();
  return targetKey===tokyoDay(now)
    ? "今天"
    : targetKey===tokyoDay(new Date(now.getTime()+86_400_000))
      ? "明天"
      : targetKey===tokyoDay(new Date(now.getTime()+2*86_400_000))
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
  const [refreshKey,setRefreshKey]=useState(0);
  useEffect(() => {
    let active = true;
    if (!services)
      return () => {
        active = false;
      };
    const load=()=>void services.loadStaffTasks().then((result) => {
      if (!active) return;
      setTasks(result.data);
      setError(result.error);
      setResolved(true);
    });
    load();
    const timer=window.setInterval(load,30_000);
    const refresh=()=>{if(document.visibilityState==='visible')load()};
    document.addEventListener('visibilitychange',refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',refresh);
    };
  }, [services,refreshKey]);
  return { services, preview, tasks, resolved, error, retry:()=>{setResolved(false);setError(null);setRefreshKey(value=>value+1)} };
}

export function StaffPortal() {
  const { services, preview, tasks, resolved, error, retry } = useStaffTasks();
  const {state,clearIdentity}=useApp();
  const location=useLocation();
  const [searchParams,setSearchParams]=useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const scheduleDate=searchParams.get('date')??tokyoDay(new Date());
  const [staffReferral,setStaffReferral]=useState<{code:string;completedInvites:number;pendingInvites:number}|null>(null);
  const [staffDashboard,setStaffDashboard]=useState<Awaited<ReturnType<NonNullable<typeof services>['loadOwnAmbassadorDashboard']>>|null>(null);
  const [qrUrl,setQrUrl]=useState('');
  const [workflowNotice, setWorkflowNotice] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [leaves,setLeaves]=useState<Array<{id:string;starts_at:string;ends_at:string;reason:string;status:string;review_note:string}>>([]);
  const [leaveOpen,setLeaveOpen]=useState(false);
  const [leaveNotice,setLeaveNotice]=useState('');
  const [staffDisplayName,setStaffDisplayName]=useState('');
  const [profileNotice,setProfileNotice]=useState('');
  const [workNotifications,setWorkNotifications]=useState<Array<{id:string;event_type:string;order_id?:string|null;status?:string;payload?:Record<string,unknown>|null;created_at:string;updated_at:string}>>([]);
  const [notificationError,setNotificationError]=useState('');
  const [selectionClock,setSelectionClock]=useState(()=>new Date());
  useEffect(()=>{const tick=()=>setSelectionClock(new Date());const timer=window.setInterval(tick,60_000);document.addEventListener('visibilitychange',tick);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',tick)}},[]);
  useEffect(()=>{let mounted=true;if(services&&typeof services.loadOwnStaffLeaves==='function')void services.loadOwnStaffLeaves().then(value=>{if(mounted)setLeaves(value)});return()=>{mounted=false}},[services]);
  useEffect(()=>{let mounted=true;if(!services)return()=>{mounted=false};void Promise.all([services.loadOwnReferralSummary(),services.loadOwnAmbassadorDashboard()]).then(([referral,dashboard])=>{if(!mounted)return;setStaffReferral(referral);setStaffDashboard(dashboard);if(referral?.code){const link=`${window.location.origin}/r/${encodeURIComponent(referral.code)}`;void QRCode.toDataURL(link,{width:220,margin:1,errorCorrectionLevel:'M'}).then(value=>{if(mounted)setQrUrl(value)})}});return()=>{mounted=false}},[services]);
  useEffect(()=>{let mounted=true;if(services)void services.loadOwnDisplayName().then(result=>{if(mounted&&result.data)setStaffDisplayName(result.data)});return()=>{mounted=false}},[services]);
  useEffect(()=>{let mounted=true;if(services)void services.loadOwnNotifications().then(result=>{if(!mounted)return;setWorkNotifications(result.data as Array<{id:string;event_type:string;order_id?:string|null;status?:string;payload?:Record<string,unknown>|null;created_at:string;updated_at:string}>);setNotificationError(result.error??'')});return()=>{mounted=false}},[services]);
  const saveStaffProfile=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!services)return;setWorkflowBusy(true);const result=await services.updateOwnDisplayName(staffDisplayName);setWorkflowBusy(false);setProfileNotice(result.ok?'称呼已保存，刷新后仍会保留。':result.error??'资料保存失败。')};
  const copyReferralLink=async(link:string)=>{try{await navigator.clipboard.writeText(link);setProfileNotice('推广链接已复制。')}catch{setProfileNotice('复制失败，请长按链接手动复制。')}};
  const submitLeave=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const startsDate=new Date(String(form.get('startsAt')));const endsDate=new Date(String(form.get('endsAt')));if(!Number.isFinite(startsDate.getTime())||!Number.isFinite(endsDate.getTime())||endsDate<=startsDate){setLeaveNotice('请假结束时间必须晚于开始时间。');return}const reason=String(form.get('reason')).trim();setWorkflowBusy(true);const ok=services&&typeof services.submitOwnStaffLeave==='function'?await services.submitOwnStaffLeave(startsDate.toISOString(),endsDate.toISOString(),reason):true;setWorkflowBusy(false);setLeaveNotice(ok?'请假申请已提交，批准前仍需按原派单出勤。':'提交失败，请检查时间是否重复或联系运营。');if(ok){setLeaveOpen(false);if(services&&typeof services.loadOwnStaffLeaves==='function')setLeaves(await services.loadOwnStaffLeaves())}};
  const currentTask=useMemo(()=>selectCurrentStaffTask(tasks,selectionClock),[tasks,selectionClock]);
  const nextTask=useMemo(()=>selectNextStaffTask(tasks,selectionClock),[tasks,selectionClock]);
  const primaryTask=useMemo(()=>selectPrimaryStaffTask(tasks,selectionClock),[tasks,selectionClock]);
  const active = useMemo(()=>{
    const requested=selected??searchParams.get('task');
    const chosen=tasks.find(task=>task.staff_assignment_id===requested);
    if(location.pathname==='/staff')return chosen&&isExecutableStaffTask(chosen)&&(taskPhase(chosen)==='active'||(chosen.departs_at&&tokyoDay(chosen.departs_at)===tokyoDay(selectionClock)))?chosen:currentTask;
    return chosen&&isExecutableStaffTask(chosen)?chosen:primaryTask;
  },[tasks,selected,searchParams,location.pathname,primaryTask,currentTask,selectionClock]);
  if(selected&&!tasks.some(task=>task.staff_assignment_id===selected&&isExecutableStaffTask(task)))setSelected(null);
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
    if(ok)retry();
  };
  const acknowledgeAssignment=async()=>{
    if(!active||workflowBusy)return;
    if(!services){setWorkflowNotice('本地预览：任务确认不会写入数据库。');return}
    setWorkflowBusy(true);
    const result=await services.acknowledgeStaffAssignment(active.staff_assignment_id);
    setWorkflowBusy(false);
    setWorkflowNotice(result.ok?'任务已确认，运营后台可查看确认时间。':result.error??'任务确认失败。');
    if(result.ok)retry();
  };
  if (!resolved)
    return (
      <StaffFrame>
        <StatusCard title="正在读取工作人员任务">
          仅加载分配给当前账户的车辆与团组。
        </StatusCard>
      </StaffFrame>
    );
  const portalView=location.pathname==='/staff/schedule'?'schedule':location.pathname==='/staff/map'?'map':location.pathname==='/staff/messages'?'messages':location.pathname.startsWith('/staff/profile')?'profile':'today';
  const updateSchedule=(value:string)=>{const next=new URLSearchParams(searchParams);next.set('date',value);setSearchParams(next,{replace:true})};
  const nowDate=selectionClock;const todayKey=tokyoDay(nowDate);
  const todayTasks=tasks.filter(task=>task.departs_at&&tokyoDay(task.departs_at)===todayKey&&taskPhase(task)!=='cancelled');
  const activeConflicts=tasks.filter(task=>taskPhase(task)==='active'&&!isFutureActiveStaffTask(task,selectionClock));
  const futureActiveTasks=tasks.filter(task=>isFutureActiveStaffTask(task,selectionClock));
  const upcomingTasks=tasks.filter(task=>isExecutableStaffTask(task)&&task.departs_at&&tokyoDay(task.departs_at)>todayKey).sort((a,b)=>taskSortTime(a)-taskSortTime(b)).slice(0,2);
  const filteredTasks=tasks.filter(task=>task.departs_at&&tokyoDay(task.departs_at)===scheduleDate).sort((a,b)=>taskSortTime(a)-taskSortTime(b));
  if(portalView==='schedule'){
    const days=futureDays(nowDate);
    const coverage=leaveCoverageForDay(scheduleDate,leaves);
    return <StaffFrame task={active}><header className="staff-welcome"><span>7-DAY SCHEDULE</span><h1>行程</h1><p>{new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'long',day:'numeric'}).format(new Date(`${scheduleDate}T00:00:00+09:00`))}</p></header><section className="staff-week-calendar" aria-label="未来7天工作日历">{days.map((day,index)=>{const key=tokyoDay(day);const count=tasks.filter(task=>task.departs_at&&tokyoDay(task.departs_at)===key&&taskPhase(task)!=='cancelled').length;const dayCoverage=leaveCoverageForDay(key,leaves);return <button type="button" key={key} className={key===scheduleDate?'active':''} aria-pressed={key===scheduleDate} onClick={()=>updateSchedule(key)}><small>{index===0?'今天':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',weekday:'short'}).format(day)}</small><b>{new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',day:'numeric'}).format(day)}</b><em>{dayCoverage==='full'?'全天请假':dayCoverage==='partial'?'部分请假':count?`${count}单`:'—'}</em></button>})}</section>{coverage!=='none'&&<p className="staff-result" role="status">{coverage==='full'?'这一天已批准全天请假；已有任务仍保留显示，必须由运营确认调整。':'这一天有已批准的部分时段请假；请逐项核对任务冲突。'}</p>}{filteredTasks.length?<section className="staff-day-tasks">{filteredTasks.map(task=>{const conflict=taskLeaveConflict(task.departs_at,task.ends_at,leaves);return <article key={task.staff_assignment_id} data-status={driverTaskStage(task,nowDate)}><div><b>{timeLabel(task.departs_at)}</b><span>{driverStageLabel[driverTaskStage(task,nowDate)]}</span></div><h2>{task.trip_title}</h2>{conflict==='conflict'&&<p className="staff-late-alert" role="alert">与已批准请假时段冲突，请联系运营处理。</p>}{conflict==='unknown'&&<p className="staff-late-alert" role="status">任务结束时间待核对，无法自动判断请假冲突。</p>}<p>集合：{task.meeting_name??'待确认'}</p><p>车辆：{task.vehicle_label??task.vehicle_type} · 乘客：{task.passenger_count}人</p><div><Link to={taskPath(task,'meeting')}>集合点</Link>{taskPhase(task)!=='cancelled'&&<Link to={taskPath(task,'journey')}>打开任务</Link>}</div></article>})}</section>:<StatusCard title={coverage==='full'?"这一天已批准全天请假。":"这一天没有任务。"}>{coverage==='full'?'当前没有已分配任务。请假不会自动取消或隐藏已有派单。':'可选择其他日期查看已分配行程。'}</StatusCard>}</StaffFrame>;
  }
  if(portalView==='map')return <StaffFrame task={active}><header className="staff-welcome"><span>LIVE PASSENGER MAP</span><h1>地图</h1><p>仅显示当前正式负责班次中主动共享且仍有效的位置。</p></header>{active?<><label className="staff-task-select">当前任务<select aria-label="地图任务" value={active.staff_assignment_id} onChange={event=>setSelected(event.target.value)}>{tasks.filter(task=>taskPhase(task)!=='cancelled').map(task=><option value={task.staff_assignment_id} key={task.staff_assignment_id}>{dayLabel(task.departs_at)} {timeLabel(task.departs_at)} · {task.trip_title}</option>)}</select></label><StaffLiveMap key={active.vehicle_group_id} task={active}/></>:<StatusCard title="暂无可显示的任务地图">获得任务后，这里会显示本人任务的集合点与已授权位置。</StatusCard>}</StaffFrame>;
  if(portalView==='messages')return <StaffFrame task={active}><header className="staff-welcome"><span>COMMUNICATION</span><h1>消息</h1><p>{workNotifications.length} 条工作通知</p></header><section className="staff-thread-list" aria-label="消息线程">{tasks.filter(task=>task.room_id).sort((a,b)=>a.staff_assignment_id===active?.staff_assignment_id?-1:b.staff_assignment_id===active?.staff_assignment_id?1:taskSortTime(a)-taskSortTime(b)).map(task=><Link className="staff-thread" key={task.staff_assignment_id} to={taskPath(task,'chat')}><span className="staff-thread-avatar">旅</span><span><b>{task.trip_title}</b><small>{task.room_status==='open'?'本车群已开放，点击进入聊天':'本车群尚未开放或只读'}</small><em>{dayLabel(task.departs_at)} · {task.vehicle_label??task.vehicle_type}</em></span></Link>)}{active&&<Link className="staff-thread" to={taskPath(active,'support')}><span className="staff-thread-avatar operations">运</span><span><b>运营消息</b><small>提交与当前任务关联的调度请求</small><em>记录任务与提交人</em></span></Link>}{!tasks.some(task=>task.room_id)&&!active&&<p className="operations-empty">暂无有权访问的消息线程。</p>}</section>{notificationError&&<p role="alert">{notificationError}</p>}</StaffFrame>;
  if(portalView==='profile'){
    const profileRole=active?.assignment_role;
    const referralLink=staffReferral?.code?`${window.location.origin}/r/${encodeURIComponent(staffReferral.code)}`:'';
    const leavePanel=<section className="staff-profile-card staff-leave-panel"><h2>出勤与请假</h2><p>无法出勤时必须提前提交请假。批准前已有任务仍需按原安排出勤，不能把“今天无任务”视为自动休假。</p><button type="button" onClick={()=>setLeaveOpen(value=>!value)}>{leaveOpen?'收起申请':'申请请假'}</button>{leaveOpen&&<form className="staff-leave-form" onSubmit={submitLeave}><label>请假开始<input required name="startsAt" type="datetime-local"/></label><label>请假结束<input required name="endsAt" type="datetime-local"/></label><label>原因<textarea required name="reason" minLength={2} maxLength={300}/></label><button disabled={workflowBusy}>提交后台审核</button></form>}{leaveNotice&&<p className="staff-result" role="status">{leaveNotice}</p>}{leaves.length>0&&<div className="staff-leave-list">{leaves.slice(0,5).map(item=><article key={item.id}><b>{item.status==='pending'?'待审核':item.status==='approved'?'已批准':item.status==='rejected'?'已拒绝':'已取消'}</b><span>{japanDateTime(item.starts_at)} — {japanDateTime(item.ends_at)}</span><small>{item.reason}{item.review_note?` · ${item.review_note}`:''}</small>{item.status==='pending'&&<button type="button" onClick={async()=>{if(services&&typeof services.cancelOwnStaffLeave==='function'&&await services.cancelOwnStaffLeave(item.id)&&typeof services.loadOwnStaffLeaves==='function')setLeaves(await services.loadOwnStaffLeaves())}}>撤回</button>}</article>)}</div>}</section>;
    return <StaffFrame task={active}><header className="staff-welcome"><span>STAFF PROFILE</span><h1>我的</h1><p>工作设置优先，推广信息按需展开。</p></header>{profileNotice&&<p role="status" className="notice">{profileNotice}</p>}<section className="staff-profile-card"><h2>{profileRole?`${roleLabel(profileRole)}资料`:'工作人员资料'}</h2><p>{state.user?.email??'当前工作人员账户'}</p><form onSubmit={saveStaffProfile}><label>对游客显示的称呼<input value={staffDisplayName} maxLength={80} required onChange={event=>setStaffDisplayName(event.target.value)}/></label><button disabled={workflowBusy||!staffDisplayName.trim()}>{workflowBusy?'正在保存':'保存资料'}</button></form></section><h2 className="staff-profile-group-title">工作设置</h2>{leavePanel}{profileRole!=='guide'&&<VehicleInspectionPlaceholder/>}<section className="staff-profile-card"><h2>联系运营</h2>{active?<Link to={taskPath(active,'support')}>联系当前任务调度</Link>:<p>当前没有可关联任务。</p>}</section><h2 className="staff-profile-group-title">推广计划</h2><details className="staff-profile-card" id="promotion"><summary>我的推广码</summary>{referralLink?<><code>{referralLink}</code><button type="button" onClick={()=>void copyReferralLink(referralLink)}>复制链接</button>{qrUrl&&<><img src={qrUrl} alt="本人固定推广链接二维码"/><a download="jtw-referral-qr.png" href={qrUrl}>下载推广二维码</a></>}<div className="staff-kpis"><article><span>本月新增注册</span><b>{staffDashboard?.currentMonth.registered??0}</b></article><article><span>本月有效推荐</span><b>{staffDashboard?.currentMonth.validReferrals??0}</b></article><article><span>本月推广感谢金</span><b>¥{(staffDashboard?.currentMonth.rewardAmount??0).toLocaleString()}</b></article></div></>:<p>固定推广链接正在准备中，请稍后刷新。</p>}</details><button className="staff-logout" type="button" onClick={()=>void services?.signOut().then(()=>clearIdentity())}>退出登录</button></StaffFrame>;
  }
  return (
    <StaffFrame task={active}>
      {preview && (
        <div className="staff-preview">
          本地界面预览 · 不代表真实任务或乘客
        </div>
      )}
      <header className="staff-home-head">
        <div><span>{new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'long',day:'numeric',weekday:'short'}).format(new Date())}</span><b>{staffDisplayName||'工作人员'} · {active?roleLabel(active.assignment_role):'工作人员'}</b></div>
        <small>{todayTasks.length?`今日 ${todayTasks.length} 个任务`:(nextTask?'下次任务已排定':'今日无任务')}</small>
      </header>
      {error && (
        <StatusCard title="任务读取失败" alert>
          {error} <button type="button" onClick={retry}>重新读取</button>
        </StatusCard>
      )}
      {!error&&futureActiveTasks.length>0&&<div className="staff-conflict" role="alert"><b>发现未来班次已进入执行状态</b><p>该状态不会作为当前行程执行。请联系调度核对测试时间或班次状态。</p></div>}
      {activeConflicts.length>1&&<div className="staff-conflict" role="alert"><b>发现 {activeConflicts.length} 个同时进行中的任务</b><p>请先联系调度确认当前负责车辆；系统不会静默隐藏其他进行中任务。</p></div>}
      {!error&&!active&&nextTask&&<section className="driver-next-card" aria-label="下一班任务">
        <header><span>NEXT DUTY</span><b>{driverStageLabel[driverTaskStage(nextTask,nowDate)]}</b></header>
        <h2>{nextTask.trip_title}</h2>
        <p><strong>{dayLabel(nextTask.departs_at)} {timeLabel(nextTask.departs_at)}</strong> · {nextTask.meeting_name??'集合点待确认'}</p>
        <dl><div><dt>车辆</dt><dd>{nextTask.vehicle_label??nextTask.vehicle_type}</dd></div><div><dt>乘客</dt><dd>{nextTask.passenger_count} 人</dd></div><div><dt>待确认</dt><dd>{Math.max(0,nextTask.passenger_count-nextTask.boarded_count)} 人</dd></div></dl>
        <Link className="button full" to={taskPath(nextTask,'journey')}>查看任务详情</Link>
      </section>}
      {!error&&!active ? (
        <StatusCard title="今天暂无已安排任务">
          {nextTask?<>下一次出勤：{dayLabel(nextTask.departs_at)} {timeLabel(nextTask.departs_at)} · {nextTask.trip_title}。<br/></>:null}无任务不代表休息或请假，请查看排班或联系调度。<br/><Link to="/staff/schedule">查看排班</Link> · <Link to="/staff/messages?channel=dispatch">联系调度</Link> · <Link to="/staff/profile#promotion">我的推广码</Link>
        </StatusCard>
      ) : !error&&active ? (
        <>
          <section
            id="tasks"
            className="staff-task-strip"
            aria-label="任务列表"
          >
            {tasks.filter(task=>isExecutableStaffTask(task)&&(taskPhase(task)==='active'||(task.departs_at&&tokyoDay(task.departs_at)===todayKey))).map((task) => (
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
          <section className="staff-current-task">
            <TaskSummary task={active} compact />
            <div className="staff-current-state"><b>当前：{active.journey_status==='meeting'?'集合中':active.journey_status==='in_progress'?'行程中':active.journey_status==='completed'?'已完成':'待集合'} · {active.boarded_count}/{active.passenger_count} 人已登车</b><span>我的派班：{active.assignment_acknowledged?'已确认':'待确认'}</span></div>
            {!active.assignment_acknowledged&&<button type="button" className="staff-acknowledge" disabled={workflowBusy} onClick={()=>void acknowledgeAssignment()}>{workflowBusy?'正在确认':'确认本人派班'}</button>}
            <div className="staff-passenger-counts"><span>本车 <b>{active.passenger_count}</b> 人</span><span>已登车 <b>{active.boarded_count}</b> 人</span><span>未登车 <b>{Math.max(0,active.passenger_count-active.boarded_count)}</b> 人</span></div>
            <div className="staff-primary-action">
              {active.journey_status==='meeting'?<Link to={taskPath(active,'passengers')}>打开乘客名单</Link>:active.journey_status==='in_progress'?<Link to={taskPath(active,'journey')}>打开行程控制台</Link>:active.journey_status==='completed'?<Link to={taskPath(active,'journey')}>查看任务记录</Link>:active.assignment_acknowledged?<button type="button" disabled={workflowBusy||active.room_status!=='open'} onClick={()=>void execute('meeting_started')}>{workflowBusy?'正在发起':'发起集合'}</button>:<Link to={taskPath(active,'journey')}>查看任务详情</Link>}
            </div>
            {workflowNotice&&<p className="staff-result" role="status">{workflowNotice}</p>}
          </section>
          <section className="staff-core-actions" aria-label="当前任务快捷入口">
            <Link to={taskPath(active,'passengers')}><DriverIcon name="user"/>乘客名单</Link>
            <Link to={taskPath(active,'chat')}><DriverIcon name="message"/>团队群聊</Link>
            <Link to={active.map_lat!=null&&active.map_lng!=null?`/staff/map?task=${encodeURIComponent(active.staff_assignment_id)}`:taskPath(active,'meeting')}><DriverIcon name="map"/>集合 / 车辆位置</Link>
            <Link to={taskPath(active,'journey')}><DriverIcon name="calendar"/>路线行程</Link>
          </section>
          <details className="staff-more-actions"><summary>更多操作</summary><div><Link to={taskPath(active,'notice')}>发送通知</Link><Link to={taskPath(active,'meeting')}>集合管理</Link><Link to={taskPath(active,'delay')}>报告延误</Link><Link to={taskPath(active,'incident')}>异常上报</Link><Link className="urgent" to={taskPath(active,'support')}>联系运营</Link></div></details>
        </>
      ):null}
      {!error&&workNotifications.length>0&&<section className="staff-home-notices"><header><span>IMPORTANT</span><h2>重要通知</h2></header>{workNotifications.slice(0,3).map(item=><article key={item.id}><b>{item.event_type==='departure-rescheduled'?'班次时间已变更':item.event_type==='departure-cancelled'?'任务已取消':item.event_type==='meeting-updated'?'集合信息已变更':'工作状态更新'}</b><small>{japanDateTime(item.updated_at??item.created_at)} · 已读不代表已确认</small><Link to="/staff/messages">查看通知</Link></article>)}</section>}
      {!error&&upcomingTasks.length>0&&<section className="staff-upcoming"><header><span>NEXT</span><h2>后续安排</h2></header>{upcomingTasks.map(task=><article key={task.staff_assignment_id}><b>{dayLabel(task.departs_at)} {timeLabel(task.departs_at)} · {task.trip_title}</b><small>{task.meeting_name??'集合点待确认'} · {task.vehicle_label??'车辆待确认'}</small></article>)}<Link to="/staff/schedule">查看全部行程</Link></section>}
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
  if(taskPhase(task)==='cancelled')return <StaffFrame task={task}><StatusCard title="任务已取消">该任务仅供查看，开始、核销、位置共享和结束操作均已关闭。<br/><Link to="/staff/schedule?status=cancelled">返回已取消行程</Link></StatusCard></StaffFrame>;
  return (
    <StaffFrame task={task}>
      {action!=='chat'&&<header className="staff-welcome">
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
      </header>}
      {action!=='chat'&&<TaskSummary task={task} />}
      {action === "passengers" ? (
        <PassengerAction task={task} preview={preview} />
      ) : action === "chat" ? (
        <StaffChat key={task.staff_assignment_id} task={task} />
      ) : action === "notice" ? (
        <NoticeAction task={task} />
      ) : action === "meeting" ? (
        <MeetingAction task={task} />
      ) : action === "journey" ? (
        <JourneyAction task={task} preview={preview} />
      ) : action === "delay" ? (
        <DelayAction task={task} preview={preview} />
      ) : (
        <EscalationAction task={task} kind={action as "incident" | "support"} />
      )}
      {action!=='chat'&&<Link className="staff-back" to={action==='meeting'||action==='journey'?'/staff/map':'/staff'}>
        ‹ 返回
      </Link>}
    </StaffFrame>
  );
}

function JourneyAction({task,preview}:{task:StaffTask;preview:boolean}){
  const {services}=useApp();
  const [stopName,setStopName]=useState("");
  const [routeStops,setRouteStops]=useState<Array<{id:string;name:string;meetingTime:string;meetingPointName:string;meetingPointDescription?:string;latitude:number;longitude:number}>>([]);
  const [reason,setReason]=useState("按今日行程到达");
  const [freeMinutes,setFreeMinutes]=useState(90);
  const [busy,setBusy]=useState("");
  const [result,setResult]=useState("");
  const locationWatch=useRef<number|null>(null);
  const locationSession=useRef<{sessionId:string;expiresAt:string}>({sessionId:'',expiresAt:''});
  const locationSequence=useRef(0);
  const locationSending=useRef(false);
  const locationFailures=useRef(0);
  const stopLocation=async()=>{if(locationWatch.current!==null){navigator.geolocation.clearWatch(locationWatch.current);locationWatch.current=null}const ok=preview||!services?true:await services.stopStaffLocation(task.vehicle_group_id);setResult(ok?'已停止采集和公开司机位置。':'当前没有可停止的位置共享。');};
  useEffect(()=>()=>{if(locationWatch.current!==null){navigator.geolocation.clearWatch(locationWatch.current);if(services)void services.stopStaffLocation(task.vehicle_group_id)}},[services,task.vehicle_group_id]);
  useEffect(()=>{let active=true;if(services)void services.tripRoom.loadItinerary(task.vehicle_group_id).then(value=>{if(active){setRouteStops(value);setStopName(current=>value.some(stop=>stop.name===current)?current:(value[0]?.name??''))}});return()=>{active=false}},[services,task.vehicle_group_id]);
  const transition=async(action:'stop_arrived'|'trip_completed')=>{
    const selectedStop=routeStops.find(stop=>stop.name===stopName);
    if(action==='stop_arrived'&&!selectedStop)return;
    if(!window.confirm(action==='trip_completed'?'确认结束本车行程？结束后群聊将转为只读。':`确认已到达“${stopName.trim()}”？`))return;
    if(preview||!services){setResult('当前操作未提交。');return}
    setBusy(action);const value=action==='stop_arrived'&&selectedStop?await services.advanceStaffToItineraryStop(task.vehicle_group_id,selectedStop.id,reason.trim()):await services.advanceStaffJourney(task.vehicle_group_id,action,selectedStop?.name??'',reason.trim());setBusy("");
    if(value&&action==='trip_completed'&&locationWatch.current!==null){navigator.geolocation.clearWatch(locationWatch.current);locationWatch.current=null;if(services)await services.stopStaffLocation(task.vehicle_group_id)}
    setResult(value?action==='trip_completed'?'行程已结束：司机定位已停止，群聊已转为只读。':'当前景点已更新，游客端已生成行程通知。':'操作失败，请检查任务状态、权限和说明。');
  };
  const shareLocation=async()=>{
    if(!navigator.geolocation){setResult('当前设备不支持定位。');return}
    if(locationWatch.current!==null){setResult('行程位置正在采集中。');return}
    setBusy('location');const session=preview||!services?{sessionId:crypto.randomUUID(),expiresAt:new Date(Date.now()+30*60_000).toISOString()}:await services.startStaffLocation(task.vehicle_group_id);if(!session){setBusy('');setResult('无法开启定位会话，请检查任务、群聊和工作人员权限。');return}locationSession.current=session;locationSequence.current=0;locationFailures.current=0;locationWatch.current=navigator.geolocation.watchPosition(async position=>{if(locationSending.current)return;locationSending.current=true;let activeSession=locationSession.current;if(!preview&&services&&new Date(activeSession.expiresAt).getTime()-Date.now()<2*60_000){const renewed=await services.startStaffLocation(task.vehicle_group_id);if(!renewed){locationSending.current=false;if(locationWatch.current!==null)navigator.geolocation.clearWatch(locationWatch.current);locationWatch.current=null;setResult('定位会话无法续期，可能是任务已结束或账号权限已撤销，采集已停止。');return}locationSession.current=renewed;activeSession=renewed;locationSequence.current=0}locationSequence.current+=1;let ok=preview||!services?true:await services.publishStaffLocation(task.vehicle_group_id,activeSession.sessionId,position.coords.latitude,position.coords.longitude,position.coords.accuracy,new Date(position.timestamp).toISOString(),locationSequence.current);if(!ok&&!preview&&services){const renewed=await services.startStaffLocation(task.vehicle_group_id);if(renewed){locationSession.current=renewed;locationSequence.current=1;ok=await services.publishStaffLocation(task.vehicle_group_id,renewed.sessionId,position.coords.latitude,position.coords.longitude,position.coords.accuracy,new Date(position.timestamp).toISOString(),1)}}locationSending.current=false;setBusy('');if(ok){locationFailures.current=0;setResult(`位置持续采集中；最近采集 ${new Date(position.timestamp).toLocaleTimeString('zh-CN')}，精度约 ${Math.round(position.coords.accuracy)} 米。会话会在到期前自动续期。`)}else{locationFailures.current+=1;if(locationFailures.current>=2&&locationWatch.current!==null){navigator.geolocation.clearWatch(locationWatch.current);locationWatch.current=null;setResult('连续两次位置上报失败，可能是任务结束或权限撤销，采集已安全停止。')}else setResult('位置上报失败，系统将再尝试一次续期。')}},()=>{setBusy('');setResult('无法读取当前位置，请允许浏览器定位后重试。')},{enableHighAccuracy:true,timeout:15000,maximumAge:10000});
  };
  const selectedStop=routeStops.find(stop=>stop.name===stopName);
  return <section className="staff-detail"><div className="staff-detail-note">按已发布路线确认到站、自由活动和行程结束。路线内容如需变更，请联系运营。</div>{task.map_lat!=null&&task.map_lng!=null&&<a className="button full" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${task.map_lat},${task.map_lng}`}>导航到今日集合点</a>}{routeStops.length>0?<div className="staff-template-grid" aria-label="今日线路节点">{routeStops.map(stop=><article key={stop.id} className={stopName===stop.name?'active':''}><button type="button" onClick={()=>setStopName(stop.name)}><b>{stop.meetingTime}</b><span>{stop.name}</span><small>{stop.meetingPointName}</small></button><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}>导航到此站</a></article>)}</div>:<p className="staff-result">当前路线尚未发布行程节点，请联系运营确认。</p>}<form className="staff-escalation" onSubmit={e=>{e.preventDefault();void transition('stop_arrived')}}><label>当前到达景点<select required value={stopName} onChange={e=>setStopName(e.target.value)}><option value="">请选择已发布景点</option>{routeStops.map(stop=><option key={stop.id} value={stop.name}>{stop.meetingTime} · {stop.name}</option>)}</select></label><label>现场说明<textarea required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy!==''||!selectedStop}>确认到达景点</button></form><div className="staff-template-grid"><label>自由活动分钟<input type="number" min={5} max={360} value={freeMinutes} onChange={e=>setFreeMinutes(Number(e.target.value))}/></label><button type="button" disabled={busy!==''||!selectedStop} onClick={async()=>{if(!selectedStop||!window.confirm(`确认在“${selectedStop.name}”开始约 ${freeMinutes} 分钟自由活动？`))return;setBusy('free-time');const ok=preview||!services?true:await services.startStaffFreeTime(task.vehicle_group_id,selectedStop.name,freeMinutes);setBusy('');setResult(ok?'自由活动已开始，游客将收到随行与集合提醒。':'操作失败，请确认群聊已开放和工作人员权限。')}}>{busy==='free-time'?'正在发布':'开始自由活动'}</button><button type="button" disabled={busy!==''} onClick={shareLocation}>{busy==='location'?'正在读取定位':'开始共享行程位置'}</button><button type="button" disabled={busy!==''} onClick={()=>void stopLocation()}>停止位置共享</button><button type="button" disabled={busy!==''||reason.trim().length<3} onClick={()=>void transition('trip_completed')}>{busy==='trip_completed'?'正在结束':'结束本车行程'}</button></div>{result&&<p className="staff-result" role="status">{result}</p>}</section>
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
  const orderGroups=useMemo(()=>{
    const grouped=new Map<string,AttendanceRow[]>();
    for(const row of rows)grouped.set(row.order_id,[...(grouped.get(row.order_id)??[]),row]);
    return [...grouped.entries()].map(([orderId,passengers])=>({orderId,passengers}));
  },[rows]);
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
        [row.order_id]: {
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
    setContacts((value) => ({ ...value, [row.order_id]: contact }));
    setNotice("订单联系人已按履约需要显示，本次查看已记录。");
  };
  return (
    <section className="staff-detail">
      <div className="staff-detail-note">
        仅履约名单和必要联系信息可见。联系电话只在允许联系后按需显示，并记录查看人和时间。
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
        <div className="staff-order-groups">
          {orderGroups.map(({orderId,passengers})=>{const arrived=passengers.filter(row=>row.status==='at_meeting_point'||row.status==='boarded').length;const boarded=passengers.filter(row=>row.status==='boarded').length;const assistance=passengers.filter(row=>row.status==='needs_assistance').length;const contact=contacts[orderId];return <details className="staff-order-group" key={orderId} open>
            <summary><span><b>订单尾号 {orderId.slice(-6)}</b><small>本车 {passengers.length} 人 · 已到 {arrived} · 已登车 {boarded}{assistance?` · 协助 ${assistance}`:''}</small></span><em>{boarded===passengers.length?'本车成员已登车':'逐人确认'}</em></summary>
            <div className="staff-order-contact"><span>主要联系人：{contact?contact.contact_name:'按需读取正式订单联系人'}</span>{contact?.phone?<a href={`tel:${contact.phone}`}>{contact.phone}</a>:contact?<small>订单未提供联系电话</small>:<button type="button" disabled={busy!==''} aria-label="拨打乘客电话" onClick={()=>void reveal(passengers[0])}>查看订单联系人</button>}</div>
            <div className="staff-passenger-list">{passengers.map((row)=><article key={row.passenger_id}>
              <header><div><b>{row.passenger_label}</b><small>本订单乘客</small></div><em>{statusLabel[row.status] ?? row.status}</em></header>
              {row.late_minutes ? <p className="staff-late-alert" role="status">预计迟到 {row.late_minutes}{row.late_minutes===15?' 分钟以上':' 分钟'}</p> : null}
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
                <button
                  disabled={busy !== ""}
                  onClick={() => void escalate(row)}
                >
                  联系运营
                </button>
              </div>
            </article>)}</div>
          </details>})}
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

function MeetingAction({task}:{task:StaffTask}) {
  const {services}=useApp();
  const taskMeeting=task.meeting_name&&task.meeting_at&&task.map_lat!=null&&task.map_lng!=null?{meeting_at:task.meeting_at,meeting_name:task.meeting_name,meeting_address:task.meeting_address??'',latitude:task.map_lat,longitude:task.map_lng}:null;
  const [meeting,setMeeting]=useState<{meeting_at:string;meeting_name:string;meeting_address:string;latitude:number;longitude:number;landmark_description?:string|null}|null>(()=>services?null:taskMeeting);
  const [loading,setLoading]=useState(Boolean(services));
  useEffect(()=>{let active=true;if(services)void services.loadStaffMeeting(task.vehicle_group_id).then(value=>{if(active){setMeeting(value);setLoading(false)}});return()=>{active=false}},[services,task.vehicle_group_id]);
  if(loading)return <StatusCard title="正在读取集合信息">请稍候。</StatusCard>;
  if(!meeting)return <StatusCard title="集合资料尚未确认">请稍后刷新；如临近集合时间仍未显示，请联系运营。</StatusCard>;
  return <section className="staff-detail staff-meeting-readonly">
    <dl>
      <div><dt>集合时间</dt><dd>{japanDateTime(meeting.meeting_at)}</dd></div>
      <div><dt>集合地点</dt><dd>{meeting.meeting_name}</dd></div>
      <div><dt>详细地址</dt><dd>{meeting.meeting_address||'地址待确认'}</dd></div>
      {meeting.landmark_description&&<div><dt>识别提示</dt><dd>{meeting.landmark_description}</dd></div>}
      <div><dt>车辆</dt><dd>{task.vehicle_label??task.vehicle_type} · {task.vehicle_capacity}席</dd></div>
    </dl>
    <a className="button full" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${meeting.latitude},${meeting.longitude}`}>打开地图导航</a>
  </section>;
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

function TaskSummary({ task,compact=false }: { task: StaffTask;compact?:boolean }) {
  return (
    <section className="staff-active-card">
      <div>
        <span>
          {dayLabel(task.departs_at)} {timeLabel(task.departs_at)} · 集合 {timeLabel(task.meeting_at??task.departs_at)} ·{" "}
          {roleLabel(task.assignment_role)}
        </span>
        <h2>{task.trip_title}</h2>
        <p>
          {task.meeting_name ?? "集合点待确认"}
          {task.meeting_address ? ` · ${task.meeting_address}` : ""}
        </p>
        {!compact&&<p>{task.vehicle_label??task.vehicle_type} · 本车 {task.passenger_count} 人 / {task.vehicle_capacity} 席 · 空余 {Math.max(0,task.vehicle_capacity-task.booked_seats)} 席 · 已登车 {task.boarded_count} · 待登车 {Math.max(0,task.passenger_count-task.boarded_count)}</p>}
        {compact&&<p>{task.vehicle_label??task.vehicle_type} · {task.vehicle_capacity} 席</p>}
        <p>司机：{task.driver_name??'未配司机'} · 导游：{task.guide_name??'未配导游'}</p>
        {task.chat_opens_at && task.room_status !== "open" && (
          <p>团队聊天将于 {dayLabel(task.chat_opens_at)} {timeLabel(task.chat_opens_at)} 开放</p>
        )}
      </div>
      <em>{driverStageLabel[driverTaskStage(task)]}</em>
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
  const tabPath=location.pathname.startsWith('/staff/tasks/')?(action==='chat'?'/staff/messages':action==='meeting'||action==='journey'?'/staff/map':'/staff'):location.pathname;
  return (
    <div className="staff-stage">
      <main className="staff-phone">
        <header className="staff-top">
          <span className="staff-logo">JT</span>
          <div>
            <b>Japan Travel Weekend</b>
            <small>{task?`${roleLabel(task.assignment_role)}工作台`:'工作人员工作台'}</small>
          </div>
          <span className="staff-top-actions"><Link to="/staff/messages" aria-label="通知"><DriverIcon name="bell"/></Link><Link to="/staff/profile" aria-label="更多"><DriverIcon name="more"/></Link></span>
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
            <DriverIcon name="home"/>首页
          </Link>
          <Link
            aria-current={tabPath === "/staff/schedule" ? "page" : undefined}
            className={tabPath === "/staff/schedule" ? "active" : ""}
            to="/staff/schedule"
          >
            <DriverIcon name="calendar"/>行程
          </Link>
          <Link
            aria-current={tabPath === "/staff/map" ? "page" : undefined}
            className={tabPath === "/staff/map" ? "active" : ""}
            to="/staff/map"
          >
            <DriverIcon name="map"/>地图
          </Link>
          <Link aria-current={tabPath === "/staff/messages" ? "page" : undefined} className={tabPath === "/staff/messages" ? "active" : ""} to="/staff/messages">
            <DriverIcon name="message"/>消息
          </Link>
          <Link aria-current={tabPath.startsWith("/staff/profile") ? "page" : undefined} className={tabPath.startsWith("/staff/profile") ? "active" : ""} to="/staff/profile"><DriverIcon name="user"/>我的</Link>
        </nav>
      </main>
    </div>
  );
}
function DriverIcon({name}:{name:'home'|'calendar'|'map'|'message'|'user'|'bell'|'more'}){
  const paths={home:<><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>,map:<><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15m6-12v15"/></>,message:<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>,user:<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>};
  return <svg className="driver-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
import {VehicleInspectionPlaceholder} from './VehicleInspectionPlaceholder';
