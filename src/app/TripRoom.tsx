import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { appConfig } from "../shared/config/businessRules";
import { describeAssistance } from "../shared/services/passengerAssistance";
import { remoteChatAvailability } from "../shared/services/realtimeAccess";
import { travelRepository } from "../shared/data/repository";
import type { ProductionBrowserServices } from "../shared/backend/productionServices";
import { driverLocationNavigationUrl } from "../shared/capabilities/locationLinks";
import { attendanceSummary } from "../shared/services/attendance";
import {
  chatLanguages,
  preferredChatLanguage,
  templateTranslation,
  type ChatLanguage,
} from "../shared/services/chatTranslation";
import { useApp } from "./store";
import { PassengerChatRoom } from "./PassengerChatRoom";
import { passengerChatDemo } from "../shared/data/passengerChatDemo";
import {projectItineraryStops} from "../shared/services/itineraryMeeting";
import type {PassengerLocale} from '../shared/i18n/passengerLocale';
const myTripCopy:Record<PassengerLocale,{empty:string;emptyText:string;browse:string;eyebrow:string;title:string}>={
  'zh-CN':{empty:'暂无进行中的行程',emptyText:'正式环境不会自动生成车辆、司机、倒计时、聊天或位置数据。',browse:'浏览路线',eyebrow:'我的行程',title:'行程履约'},
  'zh-TW':{empty:'目前沒有進行中的行程',emptyText:'正式環境不會自動產生車輛、司機、倒數、聊天或位置資料。',browse:'瀏覽路線',eyebrow:'我的行程',title:'行程服務'},
  ja:{empty:'進行中の旅程はありません',emptyText:'本番環境では車両、ドライバー、カウントダウン、チャット、位置情報は自動生成されません。',browse:'ツアーを見る',eyebrow:'マイトリップ',title:'旅程サービス'},
  en:{empty:'No active trips',emptyText:'Live service does not create vehicle, driver, countdown, chat or location data until a trip is assigned.',browse:'Browse trips',eyebrow:'My Trip',title:'Trip updates'},
  es:{empty:'No hay viajes activos',emptyText:'El servicio en vivo no crea datos de vehículo, conductor, cuenta regresiva, chat o ubicación hasta que se asigna un viaje.',browse:'Explora Viajes',eyebrow:'Mi viaje',title:'Novedades sobre los viajes'},
  vi:{empty:'Không có chuyến đang diễn ra',emptyText:'Dịch vụ chính thức không tạo dữ liệu xe, tài xế, đếm ngược, trò chuyện hoặc vị trí cho đến khi chuyến được phân công.',browse:'Xem các chuyến',eyebrow:'Chuyến đi của tôi',title:'Thông tin chuyến'},
  ne:{empty:'कुनै सक्रिय यात्रा छैन',emptyText:'यात्रा तोकिएसम्म प्रत्यक्ष सेवाले गाडी, चालक, उल्टो गन्ती, च्याट वा स्थान डेटा बनाउँदैन।',browse:'यात्रा हेर्नुहोस्',eyebrow:'मेरो यात्रा',title:'यात्रा अपडेट'},
  ko:{empty:'진행 중인 여행이 없습니다',emptyText:'여행이 배정되기 전에는 실제 서비스에서 차량, 기사, 카운트다운, 채팅 또는 위치 데이터를 생성하지 않습니다.',browse:'여행 둘러보기',eyebrow:'내 여행',title:'여행 안내'},
};
const Empty = ({locale}:{locale:PassengerLocale}) => {
  const c=myTripCopy[locale]; return (
  <div className="empty-card">
    <b>{c.empty}</b><p>{c.emptyText}</p><Link to="/app/trips">{c.browse} →</Link>
  </div>
);};
type OwnTripFulfilment = {
  departs_at: string;
  meeting_name: string | null;
  meeting_address: string | null;
  vehicle_group_id: string | null;
  trip_room_id: string | null;
  boarding_ready: boolean;
};
export function MyTrip() {
  const { state, services } = useApp();
  const locale=state.ui.locale??'zh-CN';
  const mt=myTripCopy[locale];
  const aiLabel={"zh-CN":"打开本次行程的 AI 随行","zh-TW":"開啟本次行程的 AI 隨行",ja:"この旅程のAI旅ガイドを開く",en:"Open AI companion for this trip",es:"Abrir el acompañante de IA para este viaje",vi:"Mở bạn đồng hành AI cho chuyến này",ne:"यस यात्राको AI सहयात्री खोल्नुहोस्",ko:"이 여행의 AI 동행 열기"}[state.ui.locale??"zh-CN"];
  const [remote, setRemote] = useState<{
    loading: boolean;
    error: string | null;
    order: { id: string; departure_id: string; seat_count: number; status: string } | null;
    fulfilment: OwnTripFulfilment | null;
  }>({ loading: Boolean(services), error: null, order: null, fulfilment: null });
  useEffect(() => {
    let active = true;
    if (!services) return () => { active = false; };
    void services.loadOwnOrders().then(async (result) => {
      if (!active) return;
      if (result.error) {
        setRemote({ loading: false, error: result.error, order: null, fulfilment: null });
        return;
      }
      const eligible = (result.data as Array<{ id: string; departure_id: string; seat_count: number; status: string }>).filter(
        (item) => item.status === "paid" || item.status === "confirmed",
      );
      const candidates = await Promise.all(
        eligible.map(async (order) => ({ order, fulfilment: await services.loadOwnOrderFulfilment(order.id) as OwnTripFulfilment | null })),
      );
      if (!active) return;
      const withFulfilment = candidates
        .filter((item) => item.fulfilment)
        .sort((a, b) => new Date(a.fulfilment!.departs_at).getTime() - new Date(b.fulfilment!.departs_at).getTime());
      const selected = withFulfilment.find(
        (item) => new Date(item.fulfilment!.departs_at).getTime() >= Date.now(),
      ) ?? withFulfilment[0] ?? candidates[0];
      setRemote({
        loading: false,
        error: null,
        order: selected?.order ?? null,
        fulfilment: selected?.fulfilment ?? null,
      });
    }).catch(() => {
      if (active) setRemote({ loading: false, error: "暂时无法读取本人行程", order: null, fulfilment: null });
    });
    return () => { active = false; };
  }, [services]);
  if (services) {
    if (remote.loading)
      return <div className="empty-card"><b>正在读取本人行程</b><p>请稍候，正在同步订单与集合资料。</p></div>;
    if (remote.error)
      return <div className="empty-card"><b>暂时无法读取行程</b><p>{remote.error}</p></div>;
    if (!remote.order)
      return <><div className="app-title"><div className="eyebrow">{mt.eyebrow}</div><h1>{mt.title}</h1></div><Empty locale={locale} /></>;
    const fulfilment = remote.fulfilment;
    return (
      <div className="my-trip-page">
        <div className="app-title">
          <div className="eyebrow">我的账户／我的行程</div>
          <h1>已付款一日游</h1>
          <p>集合、车辆与行程房间会按运营确认进度更新。</p>
        </div>
        <div className="receipt">
          <div><span>订单编号</span><b>{remote.order.id}</b></div>
          <div><span>订单状态</span><b>{remote.order.status === "confirmed" ? "已确认" : "已付款"}</b></div>
          <div><span>出发时间</span><b>{fulfilment ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(fulfilment.departs_at)) : "等待运营确认"}</b></div>
          <div><span>集合地点</span><b>{fulfilment?.meeting_name ?? "等待运营确认"}</b></div>
          <div><span>集合地址</span><b>{fulfilment?.meeting_address ?? "等待运营确认"}</b></div>
        </div>
        <Link className="button secondary full" to={`/app/orders/${remote.order.id}`}>查看订单详情</Link>
        <Link className="button full" to="/app/ai-guide">{aiLabel}</Link>
        {fulfilment?.vehicle_group_id && fulfilment.trip_room_id ? (
          <>
            <div className="trip-status">
              <span>车辆组与行程房间已建立</span>
              <b>{fulfilment.meeting_name ?? "集合地点待确认"}</b>
              <small>{fulfilment.meeting_address ?? "请留意最新通知"}</small>
            </div>
            <Link className="button full" to="/app/my-trip/room">进入本车行程房间</Link>
          </>
        ) : (
          <p className="notice">订单已付款，车辆分组和行程房间仍在准备中；准备完成后入口会自动开放。</p>
        )}
      </div>
    );
  }
  const order = state.orders[0];
  if (!state.tripRoom && !order)
    return (
      <>
        <div className="app-title">
          <div className="eyebrow">{mt.eyebrow}</div>
          <h1>{mt.title}</h1>
        </div>
        <Empty locale={locale} />
      </>
    );
  return (
    <div className="my-trip-page">
      <div className="app-title">
        <div className="eyebrow">我的账户／我的行程</div>
        <h1>
          {order
            ? travelRepository.getTrip(order.tripSlug)?.shortTitle
            : "京都与奈良"}
        </h1>
        <p>订单与履约信息会集中在这里更新。</p>
      </div>
      {order && (
        <>
          <div className="receipt">
            <div>
              <span>订单编号</span>
              <b>{order.id}</b>
            </div>
            <div>
              <span>特殊乘车需求审核</span>
              <b>{order.assistance.operationalReviewStatus}</b>
            </div>
            <div>
              <span>需求摘要</span>
              <b>{describeAssistance(order.assistance).join("；")}</b>
            </div>
          </div>
          <Link
            className="button secondary full"
            to={`/app/orders/${order.id}`}
          >
            查看订单详情
          </Link>
          <Link className="button full" to="/app/ai-guide">{aiLabel}</Link>
        </>
      )}
      {state.tripRoom && (
        <>
          <div className="trip-status">
            <span>
              {state.tripRoom.access === "frozen"
                ? "群组尚未开放 · 可只读预览"
                : "行程房间已开放"}
            </span>
            <b>集合时间：{state.tripRoom.meeting.time}</b>
            <small>{state.tripRoom.meeting.name}</small>
          </div>
          <Link className="button full" to="/app/my-trip/room">
            查看本车行程房间
          </Link>
          <p className="privacy">开放规则：{appConfig.tripRoom.opens}</p>
        </>
      )}
    </div>
  );
}
export function TripRoom() {
  const { state, services } = useApp();
  if (services) return <RemoteTripRoom services={services} />;
  if (appConfig.runtimeMode === "production")
    return (
      <div className="empty-card">
        <b>行程房间服务不可用</b>
        <p>正式账户与实时服务未配置，不会加载演示群组或消息。</p>
      </div>
    );
  const room = state.tripRoom;
  if (!room) return <Empty locale={state.ui.locale??'zh-CN'} />;
  return <PassengerChatRoom {...passengerChatDemo} />;
}

type RemoteMessage = {
  id: string;
  content: string;
  original_content?: string | null;
  source_language?: string;
  template_key?: string | null;
  important?: boolean;
  author_id?: string;
  author_name?: string;
  author_role?: "passenger"|"driver"|"guide"|"operations";
  created_at?: string;
  trip_room_message_translations?: Array<{
    target_language: string;
    translated_content: string;
    provider: string;
    quality: string;
  }>;
};
type RemoteBoarding = {
  order_id: string;
  passenger_label: string;
  seat_count: number;
  boarding_status: string;
  boarded_at: string | null;
  location_shared: boolean;
};
type RemoteDriverLocation = {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  updated_at: string;
  expires_at: string;
};
type RemoteMeeting = {
  vehicle_group_id: string;
  meeting_at: string;
  meeting_name: string;
  meeting_address: string;
  latitude: number;
  longitude: number;
  landmark_description: string;
  status: "scheduled" | "active" | "completed" | "cancelled";
  revision: number;
  changed_reason: string | null;
  changed_at: string;
  acknowledged: boolean;
};
type PassengerTripContext={trip_title:string;itinerary:string[];return_at:string|null;staff_name:string|null;staff_role:'driver'|'guide'|'driver_guide'|'operations'|null;staff_phone:string|null;vehicle_type:string;vehicle_label:string|null;vehicle_color:string|null;vehicle_photo_url:string|null};
type RemoteItineraryStop={id:string;name:string;arrivalTime?:string;meetingTime:string;meetingPointName:string;meetingPointDescription?:string;meetingPointPhoto?:string;latitude:number;longitude:number};
type RemoteAttendance = {
  passenger_id: string;
  passenger_label: string;
  order_id: string;
  status:
    | "pending"
    | "confirmed_departure"
    | "at_meeting_point"
    | "boarded"
    | "needs_assistance"
    | "contacting"
    | "unreachable"
    | "no_show_confirmed";
  status_at: string | null;
  contact_status: string | null;
  late_minutes?: number | null;
};
const staffTemplates = [
  ["introduce", "自我介绍"],
  ["confirm_meeting", "确认明日集合"],
  ["vehicle_arrived", "车辆已到达"],
  ["departing_10", "10 分钟后出发"],
  ["departing_5", "5 分钟后出发"],
  ["return_vehicle", "请返回车辆"],
  ["traffic_delay", "交通延误"],
  ["meeting_changed", "集合点变更"],
] as const;
type RemoteRoom = {
  room_id: string;
  vehicle_group_id: string;
  room_status: "frozen" | "open" | "closed";
  opens_at: string | null;
  departure_id: string;
  departs_at: string | null;
  meeting_name: string | null;
  meeting_address: string | null;
  map_lat: number | null;
  map_lng: number | null;
  vehicle_sequence: number;
  vehicle_type: string;
  vehicle_label: string | null;
  vehicle_capacity: number;
  booked_seats: number;
  boarded_orders: number;
  total_orders: number;
};
function RemoteTripRoom({ services }: { services: ProductionBrowserServices }) {
  const {state}=useApp();
  const locale=state.ui.locale??'zh-CN';
  const ui=(zh:string,en:string)=>locale==='en'?en:zh;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [room, setRoom] = useState<RemoteRoom | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RemoteMessage[]>([]);
  const [translationLanguage, setTranslationLanguage] = useState<ChatLanguage>(
    () =>
      preferredChatLanguage(
        typeof navigator === "undefined" ? [] : navigator.languages,
      ),
  );
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [followDeviceLanguage, setFollowDeviceLanguage] = useState(true);
  const [boardings, setBoardings] = useState<RemoteBoarding[]>([]);
  const [attendance, setAttendance] = useState<RemoteAttendance[]>([]);
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [boardingToken, setBoardingToken] = useState("");
  const [boardingResult, setBoardingResult] = useState("");
  const [localPhoto, setLocalPhoto] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [driverLocation, setDriverLocation] =
    useState<RemoteDriverLocation | null>(null);
  const [locatingDriver, setLocatingDriver] = useState(false);
  const [meeting, setMeeting] = useState<RemoteMeeting | null>(null);
  const [passengerContext,setPassengerContext]=useState<PassengerTripContext|null>(null);
  const [routeStops,setRouteStops]=useState<RemoteItineraryStop[]>([]);
  const subscription = useRef<{
    close(): void;
  } | null>(null);
  const photoInputRef=useRef<HTMLInputElement|null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await services.currentUser();
      if (cancelled) return;
      if (!user) {
        setError(ui("请先登录账户。","Please sign in first."));
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);
      const currentRole = await services.currentRole();
      setRole(currentRole);
      const preference = await services.tripRoom.loadTranslationPreference();
      if (preference) {
        const follow = Boolean(preference.follow_device_language);
        setAutoTranslate(Boolean(preference.auto_translate));
        setFollowDeviceLanguage(follow);
        setTranslationLanguage(
          follow
            ? preferredChatLanguage(navigator.languages)
            : (preference.target_language as ChatLanguage),
        );
      }
      const result = await services.tripRoom.loadAccessibleRoom();
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      if (!result.data) {
        setLoading(false);
        return;
      }
      const nextRoom = result.data as RemoteRoom;
      setRoom(nextRoom);
      setMeeting(
        (await services.tripRoom.loadCurrentMeeting(
          nextRoom.vehicle_group_id,
        )) as RemoteMeeting | null,
      );
      if(currentRole==='passenger'){
        setPassengerContext(await services.tripRoom.loadPassengerContext(nextRoom.vehicle_group_id) as PassengerTripContext|null);
        setRouteStops(await services.tripRoom.loadItinerary(nextRoom.vehicle_group_id) as RemoteItineraryStop[]);
      }
      setDriverLocation(
        (await services.tripRoom.loadDriverLocation(
          nextRoom.vehicle_group_id,
        )) as RemoteDriverLocation | null,
      );
      setMessages(
        (await services.tripRoom.loadMessages(
          nextRoom.room_id,
        )) as RemoteMessage[],
      );
      setAttendance(
        (await services.tripRoom.loadAttendance(
          nextRoom.vehicle_group_id,
        )) as RemoteAttendance[],
      );
      if (
        currentRole === "driver" ||
        currentRole === "guide" ||
        currentRole === "operations"
      ) {
        setBoardings(
          (await services.tripRoom.loadBoardingStatus(
            nextRoom.vehicle_group_id,
          )) as RemoteBoarding[],
        );
      }
      const live = await services.realtime.subscribeTripRoom(
        nextRoom.room_id,
        () =>
          void services.tripRoom
            .loadMessages(nextRoom.room_id)
            .then((value) => setMessages(value as RemoteMessage[])),
        (roomStatus) =>
          setRoom((value) =>
            value ? { ...value, room_status: roomStatus } : value,
          ),
        () =>
          void services.tripRoom
            .loadAttendance(nextRoom.vehicle_group_id)
            .then((value) => setAttendance(value as RemoteAttendance[])),
        (status) =>
          setConnection(
            status === "SUBSCRIBED"
              ? "connected"
              : status === "CHANNEL_ERROR" ||
                  status === "TIMED_OUT" ||
                  status === "CLOSED"
                ? "disconnected"
                : "connecting",
          ),
      );
      if (cancelled) {
        live.close();
        return;
      }
      subscription.current = live;
      setConnection(live.subscribed ? "connected" : "disconnected");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      subscription.current?.close();
    };
  }, [services]);
  useEffect(() => {
    if (!room || room.room_status !== "open") return;
    const refresh = () => {
      void services.tripRoom
        .loadDriverLocation(room.vehicle_group_id)
        .then((value) =>
          setDriverLocation(value as RemoteDriverLocation | null),
        );
      void services.tripRoom
        .loadCurrentMeeting(room.vehicle_group_id)
        .then((value) => setMeeting(value as RemoteMeeting | null));
    };
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [room, services]);
  useEffect(() => {
    if (!autoTranslate || translationLanguage === "zh-CN" || !room) return;
    const missing = messages.filter(
      (message) =>
        !message.template_key &&
        message.source_language !== translationLanguage &&
        !message.trip_room_message_translations?.some(
          (item) => item.target_language === translationLanguage,
        ),
    );
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(
      missing.map((message) =>
        services.translateMessage({
          messageId: message.id,
          targetLanguage: translationLanguage,
        }),
      ),
    ).then((results) => {
      if (!cancelled && results.some(Boolean))
        void services.tripRoom
          .loadMessages(room.room_id)
          .then((value) => setMessages(value as RemoteMessage[]));
    });
    return () => {
      cancelled = true;
    };
  }, [autoTranslate, messages, room, services, translationLanguage]);
  const send = async () => {
    if (
      !room ||
      !remoteChatAvailability(room.room_status, connection).enabled ||
      !currentUserId ||
      !draft.trim()
    )
      return;
    const content = draft.trim();
    const stored = await services.tripRoom.sendMessage(room.room_id, content);
    if (!stored) {
      setNotice("消息发送被权限策略拒绝或连接不可用。");
      return;
    }
    setMessages(
      (await services.tripRoom.loadMessages(room.room_id)) as RemoteMessage[],
    );
    setDraft("");
    setNotice("消息已发送。");
  };
  if (loading)
    return (
      <div className="empty-card">
        <b>{ui("正在加载行程房间","Loading trip room")}</b>
        <p>{ui("正在验证本车成员权限。","Checking access for this vehicle.")}</p>
      </div>
    );
  if (error)
    return (
      <div className="empty-card">
        <b>{ui("行程房间不可用","Trip room unavailable")}</b>
        <p>{error}</p>
      </div>
    );
  if (!room) return <Empty locale={locale} />;
  const access = remoteChatAvailability(room.room_status, connection);
  const staff = role === "driver" || role === "guide" || role === "operations";
  const driverPublisher = role === "driver" || role === "guide";
  const passenger = role === "passenger";
  const attendanceLabels: Record<RemoteAttendance["status"], string> = {
    pending: ui("待签到","Pending check-in"),
    confirmed_departure: ui("已确认出发","Departure confirmed"),
    at_meeting_point: ui("已到集合点","At meeting point"),
    boarded: ui("已登车","Boarded"),
    needs_assistance: ui("需要协助","Needs assistance"),
    contacting: ui("联系中","Contacting"),
    unreachable: ui("暂未联系上","Not reached"),
    no_show_confirmed: ui("运营已确认未到","No-show confirmed"),
  };
  const attendanceTotals = attendanceSummary(
    attendance.map((item) => item.status),
  );
  const updateOwnAttendance = async (
    passengerId: string,
    status: "confirmed_departure" | "at_meeting_point" | "needs_assistance",
  ) => {
    const ok = await services.tripRoom.setOwnCheckin(passengerId, status);
    if (!ok) {
      setNotice("签到未能保存，请确认本车成员资格和当前账户。");
      return;
    }
    setAttendance(
      (await services.tripRoom.loadAttendance(
        room.vehicle_group_id,
      )) as RemoteAttendance[],
    );
    setNotice("签到状态已保存，司机端会同步更新。");
  };
  const updateStaffAttendance = async (
    passengerId: string,
    status:
      | "at_meeting_point"
      | "boarded"
      | "needs_assistance"
      | "contacting"
      | "unreachable",
  ) => {
    const ok = await services.tripRoom.setStaffCheckin(
      room.vehicle_group_id,
      passengerId,
      status,
    );
    if (!ok) {
      setNotice("乘客状态更新失败或您不属于本车工作人员。");
      return;
    }
    setAttendance(
      (await services.tripRoom.loadAttendance(
        room.vehicle_group_id,
      )) as RemoteAttendance[],
    );
    setNotice("乘客签到状态已更新。");
  };
  const requestContact = async (passengerId: string) => {
    const ok = await services.tripRoom.recordContact(
      room.vehicle_group_id,
      passengerId,
      "contact_requested",
    );
    if (!ok) {
      setNotice("尚未到人工联系时间，或电话联系服务未授权。请由运营协助处理。");
      return;
    }
    setAttendance(
      (await services.tripRoom.loadAttendance(
        room.vehicle_group_id,
      )) as RemoteAttendance[],
    );
    setNotice("已向运营提交电话联系请求；当前不会显示乘客电话号码。");
  };
  const shareLocation = async (minutes: 15 | 30) => {
    const ok = await services.tripRoom.startOwnLocationShare(
      room.vehicle_group_id,
      minutes,
    );
    setNotice(
      ok
        ? `已授权共享 ${minutes} 分钟，仅本车司机和司导可见。`
        : "位置共享未能开启，请检查本车成员权限。",
    );
  };
  const stopLocation = async () => {
    const ok = await services.tripRoom.stopOwnLocationShare(
      room.vehicle_group_id,
    );
    setNotice(ok ? "位置共享已停止。" : "没有可停止的位置共享或权限不足。");
  };
  const publishDriverLocation = () => {
    if (!navigator.geolocation) {
      setNotice("此设备不支持定位。");
      return;
    }
    setLocatingDriver(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const ok = await services.tripRoom.publishDriverLocation(
          room.vehicle_group_id,
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : null,
          },
          15,
        );
        setLocatingDriver(false);
        if (!ok) {
          setNotice(
            "司机位置未能共享：请确认房间开放、定位精度和本车工作人员权限。",
          );
          return;
        }
        setDriverLocation(
          (await services.tripRoom.loadDriverLocation(
            room.vehicle_group_id,
          )) as RemoteDriverLocation | null,
        );
        setNotice("司机位置已共享 15 分钟；可随时停止。");
      },
      () => {
        setLocatingDriver(false);
        setNotice("未取得定位授权，司机位置保持关闭。");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  };
  const stopDriverLocation = async () => {
    const ok = await services.tripRoom.stopDriverLocation(
      room.vehicle_group_id,
    );
    setDriverLocation(null);
    setNotice(ok ? "司机位置共享已停止。" : "没有可停止的位置共享或权限不足。");
  };
  const sendTemplate = async (key: string) => {
    const ok = await services.tripRoom.sendStaffTemplate(room.room_id, key);
    if (!ok) {
      setNotice("模板通知未发送：请确认房间已开放且您属于本车工作人员。");
      return;
    }
    setMessages(
      (await services.tripRoom.loadMessages(room.room_id)) as RemoteMessage[],
    );
    setNotice("重要模板通知已发送并保留原文。");
  };
  const saveTranslationSettings = async (
    nextLanguage: ChatLanguage,
    nextAuto = autoTranslate,
    nextFollow = followDeviceLanguage,
  ) => {
    const effective = nextFollow
      ? preferredChatLanguage(navigator.languages)
      : nextLanguage;
    setTranslationLanguage(effective);
    setAutoTranslate(nextAuto);
    setFollowDeviceLanguage(nextFollow);
    const ok = await services.tripRoom.saveTranslationPreference(
      effective,
      nextAuto,
      nextFollow,
    );
    setNotice(
      ok
        ? "聊天翻译偏好已保存。"
        : "翻译偏好暂时只在当前页面生效；数据库迁移尚未连接。",
    );
  };
  const translatedMessage = (message: RemoteMessage) => {
    if (!autoTranslate) return null;
    const stored = message.trip_room_message_translations?.find(
      (item) => item.target_language === translationLanguage,
    )?.translated_content;
    if (stored) return stored;
    return templateTranslation(message.template_key, translationLanguage);
  };
  const markBoarded = async (orderId: string) => {
    const ok = await services.tripRoom.markOrderBoarded(
      room.vehicle_group_id,
      orderId,
    );
    if (!ok) {
      setNotice("登车状态更新失败或订单不属于本车。");
      return;
    }
    setBoardings(
      (await services.tripRoom.loadBoardingStatus(
        room.vehicle_group_id,
      )) as RemoteBoarding[],
    );
    setNotice("登车状态已更新。");
  };
  const verifyBoarding = async () => {
    if (!boardingToken.trim()) return;
    const result = await services.verifyBoardingCredential({
      token: boardingToken.trim(),
      vehicleGroupId: room.vehicle_group_id,
      idempotencyKey: crypto.randomUUID(),
    });
    if (!result) {
      setBoardingResult("核验被拒绝：凭证格式、工作人员权限或本车归属不正确。");
      return;
    }
    const labels: Record<string, string> = {
      valid: "核验成功，已登记登车。",
      used: "该凭证已经使用。",
      expired: "该凭证已经过期。",
      revoked: "该凭证无效或已撤销。",
      "wrong-vehicle": "该凭证不属于本车。",
    };
    setBoardingResult(labels[result.status] ?? `核验结果：${result.status}`);
    setBoardingToken("");
    setBoardings(
      (await services.tripRoom.loadBoardingStatus(
        room.vehicle_group_id,
      )) as RemoteBoarding[],
    );
  };
  const previewPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setNotice("请选择不超过 5 MB 的图片文件。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" &&
      setLocalPhoto({ name: file.name, url: reader.result });
    reader.readAsDataURL(file);
  };
  if (passenger) {
    const meetingAt = meeting?.meeting_at ?? room.departs_at;
    const remoteStop = {
      id: `meeting-${room.vehicle_group_id}-${meeting?.revision ?? 0}`,
      name: "当前集合",
      meetingTime: meetingAt
        ? new Date(meetingAt).toLocaleTimeString("zh-CN", {
            timeZone: "Asia/Tokyo",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "00:00",
      meetingPointName:
        meeting?.meeting_name ?? room.meeting_name ?? "集合地点待司导更新",
      meetingPointDescription:
        (meeting?.landmark_description ||
          meeting?.meeting_address ||
          room.meeting_address) ??
        "集合地点说明尚未发布",
      latitude: meeting
        ? Number(meeting.latitude)
        : room.map_lat == null
          ? Number.NaN
          : Number(room.map_lat),
      longitude: meeting
        ? Number(meeting.longitude)
        : room.map_lng == null
          ? Number.NaN
          : Number(room.map_lng),
      status: "current" as const,
    };
    const projected=projectItineraryStops(routeStops,remoteStop.meetingPointName);
    const matchedIndex=projected.currentIndex;
    const itineraryStops=routeStops.length?projected.stops:(passengerContext?.itinerary??[]).filter(name=>name!==remoteStop.meetingPointName).map((name,index)=>({id:`route-${index}`,name,meetingTime:"时间待司导更新",meetingPointName:name,meetingPointDescription:"具体停留与集合安排以司导在群内发布的信息为准。",latitude:remoteStop.latitude,longitude:remoteStop.longitude,status:'upcoming' as const}));
    if(!routeStops.length&&passengerContext?.return_at)itineraryStops.push({id:'return',name:'预计返程到达',meetingTime:new Date(passengerContext.return_at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}),meetingPointName:'返回地点以订单与司导通知为准',meetingPointDescription:'预计到达时间会受当天交通影响。',latitude:remoteStop.latitude,longitude:remoteStop.longitude,status:'upcoming' as const});
    const passengerMessages = messages.map((message) => ({
      id: message.id,
      senderId: message.author_id ?? "operations",
      name:
        message.author_id === currentUserId
          ? "我"
          : message.author_name??"本车成员",
      role: (message.author_role??"passenger") as "passenger" | "driver" | "guide" | "operations",
      content: message.original_content ?? message.content,
      translated: translatedMessage(message) ?? undefined,
      sourceLanguage: message.source_language,
      time: message.created_at
        ? new Date(message.created_at).toLocaleTimeString("zh-CN", {
            timeZone: "Asia/Tokyo",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "",
    }));
    return (
      <PassengerChatRoom
        tripName={passengerContext?.trip_title??room.vehicle_label ?? "本车旅行团"}
        status={
          room.room_status === "closed"
            ? "ended"
            : meeting?.status === "active"
              ? "meeting"
              : room.room_status === "open"
                ? "traveling"
                : "preparing"
        }
        stage={
          meeting?.status === "active"
            ? "正在集合"
            : room.room_status === "open"
              ? "行程进行中"
              : "出发准备"
        }
        meetingActive={
          meeting?.status === "active" ||
          messages.some(
            (message) =>
              message.template_key === "vehicle_arrived" ||
              message.template_key === "return_vehicle",
          )
        }
        party={{
          arrived: attendanceTotals.arrived,
          total: attendanceTotals.total || room.booked_seats,
          distanceMeters: null,
          walkMinutes: null,
        }}
        guide={{
          name: passengerContext?.staff_name??"当班工作人员待分配",
          role: passengerContext?.staff_role==='guide'?"导游":passengerContext?.staff_role==='driver_guide'?"司导":passengerContext?.staff_role==='driver'?"司机":"工作人员",
          phone: passengerContext?.staff_phone??"",
          avatar: "导",
          vehicle: {
            type: passengerContext?.vehicle_type??(room.vehicle_type || "车型待定"),
            color: passengerContext?.vehicle_color??"颜色待更新",
            plate: passengerContext?.vehicle_label??room.vehicle_label ?? "车牌待更新",
            photoUrl:passengerContext?.vehicle_photo_url??undefined,
          },
        }}
        stops={matchedIndex>=0?itineraryStops:[remoteStop,...itineraryStops]}
        messages={passengerMessages}
        readOnly={!access.enabled}
        onSend={(content) =>
          void services.tripRoom.sendMessage(room.room_id, content)
        }
        onArrive={() => {
          const own = attendance[0];
          if (own)
            void updateOwnAttendance(own.passenger_id, "at_meeting_point");
        }}
        initialLateMinutes={(attendance[0] as {late_minutes?:number|null}|undefined)?.late_minutes}
        onLate={async (minutes) => {
          const own = attendance[0];
          if (!own) return false;
          const ok = await services.tripRoom.reportOwnLate(own.passenger_id, minutes);
          if (ok) setAttendance(await services.tripRoom.loadAttendance(room.vehicle_group_id) as RemoteAttendance[]);
          return ok;
        }}
      />
    );
  }
  return (
    <div className="trip-room fulfillment-room">
      <div className="frozen-banner" role="status">
        <b>
          {room.room_status === "open"
            ? ui("群组已开放","Group open")
            : room.room_status === "frozen"
              ? ui("群组只读预览","Read-only preview")
              : ui("群组已关闭","Group closed")}
        </b>
        <span>
          {ui("实时连接：","Live connection: ")}
          {connection === "connected"
            ? ui("已连接","Connected")
            : connection === "connecting"
              ? ui("正在连接","Connecting")
              : ui("连接中断","Disconnected")}
        </span>
      </div>
      <div className="room-head">
        <div>
          <span>{ui("本车群组 · 第","Vehicle group · Vehicle")} {room.vehicle_sequence}</span>
          <h1>{room.vehicle_label ?? room.vehicle_type}</h1>
          <p>
            {ui("当前角色：","Current role: ")}
            {role === "operations"
              ? ui("运营人员","Operations")
              : role === "driver"
                ? ui("司机","Driver")
                : role === "guide"
                  ? ui("司导","Driver-guide")
                  : ui("乘客","Passenger")}
          </p>
        </div>
      </div>
      <section className="fulfilment-summary fulfillment-pins">
        <h2>{ui("置顶履约信息","Pinned trip information")}</h2>
        <div className="receipt">
          <div>
            <span>{ui("出发时间","Departure time")}</span>
            <b>
              {room.departs_at
                ? new Date(room.departs_at).toLocaleString(locale, {
                    timeZone: "Asia/Tokyo",
                  })
                : ui("待确认","To be confirmed")}
            </b>
          </div>
          <div>
            <span>{ui("集合地点","Meeting point")}</span>
            <b>{room.meeting_name ?? ui("待确认","To be confirmed")}</b>
          </div>
          <div>
            <span>{ui("集合地址","Meeting address")}</span>
            <b>{room.meeting_address ?? ui("待确认","To be confirmed")}</b>
          </div>
          <div>
            <span>{ui("车辆人数","Vehicle capacity")}</span>
            <b>
              {room.booked_seats} / {room.vehicle_capacity} {ui("席","seats")}
            </b>
          </div>
          <div>
            <span>{ui("订单返回／登车","Orders / boarded")}</span>
            <b>
              {room.boarded_orders} / {room.total_orders}
            </b>
          </div>
        </div>
        {room.map_lat != null && room.map_lng != null ? (
          <a
            className="button secondary full"
            href={`https://www.google.com/maps/dir/?api=1&destination=${room.map_lat},${room.map_lng}&travelmode=walking`}
            target="_blank"
            rel="noreferrer"
          >
            {ui("打开集合点步行导航","Open walking directions")}
          </a>
        ) : (
          <button className="button secondary full" disabled>
            {ui("地图坐标待确认","Map coordinates pending")}
          </button>
        )}
        {(() => {
          const url = driverLocationNavigationUrl({
            coordinates: driverLocation
              ? {
                  lat: Number(driverLocation.latitude),
                  lng: Number(driverLocation.longitude),
                }
              : null,
            tripActive: room.room_status === "open",
            sameVehicleGroup: true,
            viewerRole:
              role === "passenger" ||
              role === "driver" ||
              role === "guide" ||
              role === "operations"
                ? role
                : "passenger",
          });
          return url ? (
            <>
              <a
                className="button secondary full"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                {ui("步行寻找司机","Walk to the driver")}
              </a>
              <p className="privacy">
                {ui("司机位置更新于","Driver location updated at")} {" "}
                {new Date(driverLocation!.updated_at).toLocaleTimeString(
                  locale,
                  { timeZone: "Asia/Tokyo" },
                )}
                {ui("，精度约","; accuracy approximately")} {" "}
                {driverLocation!.accuracy_meters == null
                  ? ui("未知","unknown")
                  : `${Math.round(Number(driverLocation!.accuracy_meters))} ${ui("米","m")}`}
                {ui("；到期后自动隐藏。","; it will be hidden automatically when it expires.")}
              </p>
            </>
          ) : (
            <>
              <button className="button secondary full" type="button" disabled>
                {ui("步行寻找司机（位置未共享）","Walk to the driver (location not shared)")}
              </button>
              <p className="privacy">
                {ui("司机位置默认关闭；仅在本车工作人员主动共享且房间开放时显示，不生成虚假距离或移动轨迹。","Driver location is off by default. It appears only when staff in this vehicle actively share it while the room is open.")}
              </p>
            </>
          );
        })()}
      </section>
      {driverPublisher && (
        <section className="room-actions" aria-label={ui("司机位置共享","Driver location sharing")}>
          <button
            className="room-action"
            type="button"
            disabled={room.room_status !== "open" || locatingDriver}
            onClick={publishDriverLocation}
          >
            {locatingDriver ? ui("正在获取定位…","Getting location…") : ui("共享司机位置 15 分钟","Share driver location for 15 minutes")}
          </button>
          <button
            className="room-action"
            type="button"
            disabled={room.room_status !== "open"}
            onClick={() => void stopDriverLocation()}
          >
            {ui("停止司机位置共享","Stop sharing driver location")}
          </button>
        </section>
      )}
      {passenger && room.room_status === "open" && (
        <section className="room-actions" aria-label={ui("位置共享","Location sharing")}>
          <button
            className="room-action"
            onClick={() => void shareLocation(15)}
          >
            {ui("共享位置 15 分钟","Share location for 15 minutes")}
          </button>
          <button
            className="room-action"
            onClick={() => void shareLocation(30)}
          >
            {ui("共享位置 30 分钟","Share location for 30 minutes")}
          </button>
          <button className="room-action" onClick={() => void stopLocation()}>
            {ui("停止共享","Stop sharing")}
          </button>
        </section>
      )}
      <section className="fulfilment-summary" aria-label={ui("集合签到","Meeting check-in")}>
        <h2>{staff ? ui("全员签到看板","Group check-in board") : ui("我的同行乘客签到","My group check-in")}</h2>
        <p className="notice">
          {ui("已到集合点或已登车：","At meeting point or boarded: ")}{attendanceTotals.arrived} /{" "}
          {attendanceTotals.total}
          {attendanceTotals.allPresent ? ui(" · 全员已到齐"," · Everyone is present") : ""}
        </p>
        <div className="member-list">
          {attendance.map((item) => (
            <div key={item.passenger_id}>
              <span>
                <b>{item.passenger_label}</b> · {attendanceLabels[item.status]}
                {item.late_minutes ? ` · ${ui("预计迟到","Expected delay ")}${item.late_minutes}${item.late_minutes===15?ui('分钟以上','+ minutes'):ui('分钟',' minutes')}` : ''}
              </span>
              {passenger ? (
                <div className="room-actions">
                  <button
                    type="button"
                    className="room-action"
                    onClick={() =>
                      void updateOwnAttendance(
                        item.passenger_id,
                        "confirmed_departure",
                      )
                    }
                  >
                    {ui("确认出发","Confirm departure")}
                  </button>
                  <button
                    type="button"
                    className="room-action"
                    onClick={() =>
                      void updateOwnAttendance(
                        item.passenger_id,
                        "at_meeting_point",
                      )
                    }
                  >
                    {ui("已到集合点","At meeting point")}
                  </button>
                  <button
                    type="button"
                    className="room-action"
                    onClick={() =>
                      void updateOwnAttendance(
                        item.passenger_id,
                        "needs_assistance",
                      )
                    }
                  >
                    {ui("需要协助","Need assistance")}
                  </button>
                </div>
              ) : (
                <div className="room-actions">
                  <button
                    type="button"
                    className="room-action"
                    onClick={() =>
                      void updateStaffAttendance(
                        item.passenger_id,
                        "at_meeting_point",
                      )
                    }
                  >
                    {ui("确认已到","Confirm arrival")}
                  </button>
                  <button
                    type="button"
                    className="room-action"
                    onClick={() =>
                      void updateStaffAttendance(item.passenger_id, "boarded")
                    }
                  >
                    {ui("确认登车","Confirm boarding")}
                  </button>
                  {item.status !== "at_meeting_point" &&
                    item.status !== "boarded" && (
                      <button
                        type="button"
                        className="room-action"
                        onClick={() => void requestContact(item.passenger_id)}
                      >
                        {ui("请求电话联系","Request phone contact")}
                      </button>
                    )}
                </div>
              )}
            </div>
          ))}
        </div>
        {staff && (
          <p className="privacy">
            {ui("电话号码不会展示在群组或看板中。超过集中配置的等待时间后，可请求运营通过受控电话能力联系；电话中继尚未连接时不会伪装已拨打。","Phone numbers are not shown in the group or board. After the configured wait time, operations can be asked to make controlled contact.")}
          </p>
        )}
      </section>
      {staff && (
        <section className="staff-panel">
          <h2>{ui("工作人员履约信息","Staff trip information")}</h2>
          <div className="member-list">
            {boardings.map((item) => (
              <div key={item.order_id}>
                <span>
                  <b>{item.passenger_label}</b> · {item.seat_count} {ui("席","seats")}{" "}
                  {item.location_shared ? ui("· 已主动共享位置","· Location shared") : ""}
                </span>
                <button
                  type="button"
                  disabled={
                    room.room_status !== "open" ||
                    item.boarding_status === "boarded"
                  }
                  onClick={() => void markBoarded(item.order_id)}
                >
                  {item.boarding_status === "boarded"
                    ? ui("已登车","Boarded")
                    : room.room_status === "open"
                      ? ui("标记已登车","Mark as boarded")
                      : ui("开放后可登车","Available when room opens")}
                </button>
              </div>
            ))}
          </div>
          <h3>{ui("模板广播","Message templates")}</h3>
          <div className="room-actions">
            {staffTemplates.map(([key, label]) => (
              <button
                className="room-action"
                type="button"
                key={key}
                disabled={room.room_status !== "open"}
                onClick={() => void sendTemplate(key)}
              >
                {ui(label,{introduce:'Introduce yourself',confirm_meeting:'Confirm tomorrow’s meeting',vehicle_arrived:'Vehicle has arrived',departing_10:'Departing in 10 minutes',departing_5:'Departing in 5 minutes',return_vehicle:'Please return to the vehicle',traffic_delay:'Traffic delay',meeting_changed:'Meeting point changed'}[key])}
              </button>
            ))}
          </div>
          <p className="privacy">
            {ui("重要通知保存 Original 原文；Translation 字段已预留，当前不生成机器翻译。","Important notices preserve the Original text. A Translation field is reserved; machine translation is not generated yet.")}
          </p>
          <h3>{ui("核验登车凭证","Verify boarding pass")}</h3>
          <label>
            {ui("扫描或粘贴凭证","Scan or paste pass")}
            <input
              value={boardingToken}
              disabled={room.room_status !== "open"}
              onChange={(event) => setBoardingToken(event.target.value)}
              placeholder={
                room.room_status === "open" ? "bp_…" : ui("行程房间开放后可核验","Verification opens with the trip room")
              }
            />
          </label>
          <button
            className="button full"
            type="button"
            disabled={room.room_status !== "open" || !boardingToken.trim()}
            onClick={() => void verifyBoarding()}
          >
            {ui("核验并登记登车","Verify and record boarding")}
          </button>
          {boardingResult && (
            <p className="notice" role="status">
              {boardingResult}
            </p>
          )}
        </section>
      )}
      <section className="vehicle-chat fulfillment-chat">
        <h2>{ui("本车消息","Vehicle messages")}</h2>
        <p className="privacy">{ui("仅本车成员可见；断线时不会伪装发送成功。","Visible only to members of this vehicle. Messages are never shown as sent while offline.")}</p>
        <fieldset className="translation-settings">
          <legend>{ui("聊天翻译","Chat translation")}</legend>
          <label>
            <input
              type="checkbox"
              checked={followDeviceLanguage}
              onChange={(event) =>
                void saveTranslationSettings(
                  translationLanguage,
                  autoTranslate,
                  event.target.checked,
                )
              }
            />{" "}
            {ui("跟随手机系统语言","Follow device language")}
          </label>
          <label>
            {ui("翻译成","Translate into")}
            <select
              value={translationLanguage}
              disabled={followDeviceLanguage}
              onChange={(event) =>
                void saveTranslationSettings(event.target.value as ChatLanguage)
              }
            >
              {chatLanguages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={autoTranslate}
              onChange={(event) =>
                void saveTranslationSettings(
                  translationLanguage,
                  event.target.checked,
                )
              }
            />{" "}
            {ui("自动显示译文","Show translations automatically")}
          </label>
          <p className="privacy">
            {ui("当前目标：","Current target: ")}
            {
              chatLanguages.find((item) => item.code === translationLanguage)
                ?.label
            }
            {ui("。始终保留原文；重要模板使用预置译文，自由聊天需翻译服务连接后才生成译文。",". Original text is always preserved. Important templates use prepared translations; free chat is translated only when the translation service is connected.")}
          </p>
        </fieldset>
        {messages.map((m) => (
          <article
            key={m.id}
            className={`${m.important ? "important " : ""}${!m.author_id ? "system-card" : m.author_id === currentUserId ? "self-message" : "member-message"}`}
          >
            <header>
              <b>{m.author_id === currentUserId ? ui("我","Me") : ui("本车成员","Vehicle member")}</b>
            </header>
            <p>
              <small>
                {ui("原文","Original")}
                {m.source_language && m.source_language !== "und"
                  ? ` · ${m.source_language}`
                  : ""}
              </small>
              <br />
              {m.original_content ?? m.content}
            </p>
            {translatedMessage(m) ? (
              <p className="message-translation">
                <small>
                  {
                    chatLanguages.find(
                      (item) => item.code === translationLanguage,
                    )?.label
                  }
                  {ui("译文"," translation")}
                </small>
                <br />
                {translatedMessage(m)}
              </p>
            ) : autoTranslate &&
              translationLanguage !== "zh-CN" &&
              !m.template_key ? (
              <p className="translation-unavailable">
                {ui("自由聊天翻译服务尚未连接，当前保留原文。","Free-chat translation is not connected; the original text is shown.")}
              </p>
            ) : null}
          </article>
        ))}
        <label>
          {ui("发送消息","Send message")}
          <textarea
            disabled={!access.enabled}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={access.enabled ? ui("输入本车消息","Enter a vehicle message") : access.reason}
          />
        </label>
        {localPhoto&&<div className="chat-photo-preview"><img src={localPhoto.url} alt={ui("仅保存在当前浏览器会话的照片预览","Photo preview stored only in this browser session")}/><span>{localPhoto.name}</span><button type="button" onClick={()=>setLocalPhoto(null)} aria-label={ui("移除本地预览","Remove photo")}>×</button></div>}
        <div className="chat-composer-actions">
          <input ref={photoInputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" disabled={!access.enabled} onChange={(event)=>previewPhoto(event.target.files?.[0])}/>
          <button type="button" className="chat-attachment-button" disabled={!access.enabled} onClick={()=>photoInputRef.current?.click()} aria-label={ui("拍摄或选择图片","Take or choose a photo")}>＋</button>
          <button className="button chat-send-button" disabled={!access.enabled || !draft.trim()} onClick={send}>{access.enabled ? ui("发送消息","Send message") : access.reason}</button>
        </div>
        <p className="privacy">{ui("图片发送功能将在安全存储与内容审核接通后开放。","Photo sending will open after secure storage and moderation are connected.")}</p>
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}
export function AppPrivateGroups() {
  return (
    <>
      <div className="app-title">
        <div className="eyebrow">与公共拼席分开</div>
        <h1>私人团体</h1>
        <p>面向企业、学校、社团、朋友与家庭。</p>
      </div>
      <div className="private-card">
        <b>约 30 人的团体也可从这里开始</b>
        <ul>
          <li>自选日期与接送地点</li>
          <li>单车或多车规划</li>
          <li>多语言支持需求</li>
          <li>专业运输安排</li>
        </ul>
      </div>
      <button className="button full" type="button" disabled>
        询价功能尚未连接
      </button>
      <p className="privacy">
        当前不会提交资料或生成报价，价格与可用性待确认。
      </p>
    </>
  );
}
