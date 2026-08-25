import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { appConfig } from "../shared/config/businessRules";
import { TravelService } from "../shared/services/travelService";
import { describeAssistance } from "../shared/services/passengerAssistance";
import { remoteChatAvailability } from "../shared/services/realtimeAccess";
import { travelRepository } from "../shared/data/repository";
import type { ProductionBrowserServices } from "../shared/backend/productionServices";
import { useApp } from "./store";
const service = new TravelService(travelRepository);
const Empty = () => (
  <div className="empty-card">
    <b>暂无进行中的行程</b>
    <p>正式环境不会自动生成车辆、司机、倒计时、聊天或位置数据。</p>
    <Link to="/app/trips">浏览路线 →</Link>
  </div>
);
export function MyTrip() {
  const { state } = useApp();
  const order = state.orders[0];
  if (!state.tripRoom && !order)
    return (
      <>
        <div className="app-title">
          <div className="eyebrow">我的行程</div>
          <h1>行程履约</h1>
        </div>
        <Empty />
      </>
    );
  return (
    <>
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
    </>
  );
}
export function TripRoom() {
  const { state, setState, services } = useApp();
  const [notice, setNotice] = useState("");
  const [staff, setStaff] = useState(false);
  if (services) return <RemoteTripRoom services={services} />;
  if (appConfig.runtimeMode === "production")
    return (
      <div className="empty-card">
        <b>行程房间服务不可用</b>
        <p>正式账户与实时服务未配置，不会加载演示群组或消息。</p>
      </div>
    );
  const room = state.tripRoom;
  if (!room) return <Empty />;
  const dep = travelRepository.getDeparture("dep-kyoto-seed");
  const frozen = room.access === "frozen";
  const pending = "待确认；确认后将在本页面和订单详情中更新";
  const share = (enabled: boolean) => {
    if (frozen) return;
    const grant = enabled
      ? service.startLocationSharing(room, "current-passenger", 15)
      : service.stopLocationSharing(room.locationGrant);
    setState({ ...state, tripRoom: { ...room, locationGrant: grant } });
    setNotice(
      enabled
        ? "已授权共享 15 分钟，仅本车司机和司导可见。"
        : "位置共享已停止。",
    );
  };
  return (
    <div className="trip-room">
      <div className="frozen-banner" role="status">
        <b>{frozen ? "群组只读预览" : "群组已开放"}</b>
        <span>
          {frozen
            ? `群组将在${appConfig.tripRoom.opens}开放，当前可提前查看履约信息。`
            : "本车群组已开放。"}
        </span>
      </div>
      <div className="room-head">
        <div>
          <span>京都与奈良 · 本车群组</span>
          <h1>集合与到达信息</h1>
          <b>出发时间：{dep?.departureTime ?? "待确认"}</b>
          <p>
            集合地点：{dep?.meetingPointName ?? pending}
            <br />
            完整地址：{dep?.meetingAddress ?? pending}
          </p>
        </div>
        <button type="button" onClick={() => setStaff(!staff)}>
          {staff ? "乘客视图" : "工作人员视图"}
        </button>
      </div>
      <section className="fulfilment-summary">
        <h2>到达方式</h2>
        <div className="receipt">
          <div>
            <span>公共交通</span>
            <b>{dep?.arrivalInstructions.transit ?? pending}</b>
          </div>
          <div>
            <span>步行</span>
            <b>{dep?.arrivalInstructions.walking ?? pending}</b>
          </div>
          <div>
            <span>驾车</span>
            <b>{dep?.arrivalInstructions.driving ?? pending}</b>
          </div>
        </div>
        {dep?.meetingPhoto && (
          <>
            <img
              className="meeting-photo"
              src={dep.meetingPhoto}
              alt="集合地点开发占位参考图"
            />
            <p className="notice">开发占位图，不是实际集合地点照片。</p>
          </>
        )}
      </section>
      <div className="demo-map" role="img" aria-label="地图位置待确认">
        <span className="map-label">地图位置待确认 · 地图服务未连接</span>
      </div>
      <button className="button secondary full" disabled>
        打开导航（地图未连接）
      </button>
      {!frozen && (
        <div className="room-actions">
          {room.locationGrant.enabled ? (
            <button className="room-action" onClick={() => share(false)}>
              停止共享位置
            </button>
          ) : (
            <button className="room-action" onClick={() => share(true)}>
              共享我的位置 15 分钟
            </button>
          )}
        </div>
      )}
      {notice && (
        <div className="demo-notice room-notice" role="status">
          {notice}
        </div>
      )}
      {staff && (
        <section className="staff-panel">
          <h2>司机／司导工作视图</h2>
          <p>
            {frozen
              ? "群组尚未开放，当前仅可查看成员确认状态。"
              : "乘客位置仅在主动授权后对本车司机和司导可见。"}
          </p>
          <div className="member-list">
            {room.members
              .filter((m) => m.role === "passenger")
              .map((m) => (
                <div key={m.id}>
                  <b>{m.displayName}</b>
                  <span>{m.boarding}</span>
                </div>
              ))}
          </div>
        </section>
      )}
      <section className="vehicle-chat">
        <h2>本车消息</h2>
        <p className="privacy">
          仅本车乘客与被分配的工作人员可见，不展示私人联系方式。
        </p>
        {room.messages.map((m) => (
          <article key={m.id} className={m.important ? "important" : ""}>
            <header>
              <b>{m.author}</b>
              <span>{m.role === "system" ? "系统" : "成员"}</span>
            </header>
            <p>{m.content}</p>
          </article>
        ))}
        <label>
          发送消息
          <textarea
            disabled
            value=""
            onChange={() => {}}
            placeholder={
              frozen
                ? `群组将在${appConfig.tripRoom.opens}开放`
                : "消息功能尚未连接"
            }
          />
        </label>
        <button className="button full" disabled>
          {frozen ? "群组尚未开放" : "消息功能尚未连接"}
        </button>
      </section>
    </div>
  );
}

type RemoteMessage = { id: string; content: string; author_id?: string };
type RemoteBoarding={order_id:string;passenger_label:string;seat_count:number;boarding_status:string;boarded_at:string|null;location_shared:boolean};
const staffTemplates=[['introduce','自我介绍'],['confirm_meeting','确认明日集合'],['vehicle_arrived','车辆已到达'],['departing_10','10 分钟后出发'],['departing_5','5 分钟后出发'],['return_vehicle','请返回车辆'],['traffic_delay','交通延误'],['meeting_changed','集合点变更']] as const;
type RemoteRoom = {
  room_id:string;vehicle_group_id:string;room_status:"frozen"|"open"|"closed";opens_at:string|null;
  departure_id:string;departs_at:string|null;meeting_name:string|null;meeting_address:string|null;map_lat:number|null;map_lng:number|null;
  vehicle_sequence:number;vehicle_type:string;vehicle_label:string|null;vehicle_capacity:number;booked_seats:number;boarded_orders:number;total_orders:number;
};
function RemoteTripRoom({ services }: { services: ProductionBrowserServices }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [room, setRoom] = useState<RemoteRoom | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RemoteMessage[]>([]);
  const [projections, setProjections] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [boardings,setBoardings]=useState<RemoteBoarding[]>([]);
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [boardingToken,setBoardingToken]=useState("");const [boardingResult,setBoardingResult]=useState("");
  const [localPhoto,setLocalPhoto]=useState<{name:string;url:string}|null>(null);
  const subscription = useRef<{
    send(payload: unknown): Promise<boolean>;
    close(): void;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await services.currentUser();
      if (cancelled) return;
      if (!user) {
        setError("请先登录账户。");
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);
      const currentRole = await services.currentRole();
      setRole(currentRole);
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
      setMessages(
        (await services.tripRoom.loadMessages(nextRoom.room_id)) as RemoteMessage[],
      );
      if (
        currentRole === "driver" ||
        currentRole === "guide" ||
        currentRole === "operations"
      )
        {setProjections(
          (await services.tripRoom.loadStaffProjection()) as Array<
            Record<string, unknown>
          >,
        );setBoardings((await services.tripRoom.loadBoardingStatus(nextRoom.vehicle_group_id)) as RemoteBoarding[]);}
      const live = await services.realtime.subscribePrivateVehicleGroup(
        nextRoom.vehicle_group_id,
        (payload) => {
          const content = (payload as { payload?: { content?: string } })
            .payload?.content;
          if (content)
            setMessages((rows) => [
              ...rows,
              { id: crypto.randomUUID(), content },
            ]);
        },
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
  const send = async () => {
    if (
      !room ||
      !remoteChatAvailability(room.room_status, connection).enabled ||
      !currentUserId ||
      !draft.trim()
    )
      return;
    const content = draft.trim();
    const stored = await services.tripRoom.sendMessage(
      room.room_id,
      currentUserId,
      content,
    );
    if (!stored) {
      setNotice("消息发送被权限策略拒绝或连接不可用。");
      return;
    }
    const broadcast = await subscription.current?.send({ content });
    if (!broadcast) {
      setNotice("消息已保存，但实时广播失败；其他成员刷新后可见。");
      return;
    }
    setMessages((rows) => [
      ...rows,
      { id: crypto.randomUUID(), content, author_id: currentUserId },
    ]);
    setDraft("");
    setNotice("消息已发送。");
  };
  if (loading)
    return (
      <div className="empty-card">
        <b>正在加载行程房间</b>
        <p>正在验证本车成员权限。</p>
      </div>
    );
  if (error)
    return (
      <div className="empty-card">
        <b>行程房间不可用</b>
        <p>{error}</p>
      </div>
    );
  if (!room) return <Empty />;
  const access = remoteChatAvailability(room.room_status, connection);
  const staff = role === "driver" || role === "guide" || role === "operations";
  const passenger = role === "passenger";
  const shareLocation=async(minutes:15|30)=>{const ok=await services.tripRoom.startOwnLocationShare(room.vehicle_group_id,minutes);setNotice(ok?`已授权共享 ${minutes} 分钟，仅本车司机和司导可见。`:"位置共享未能开启，请检查本车成员权限。");};
  const stopLocation=async()=>{const ok=await services.tripRoom.stopOwnLocationShare(room.vehicle_group_id);setNotice(ok?"位置共享已停止。":"没有可停止的位置共享或权限不足。");};
  const sendTemplate=async(key:string)=>{const ok=await services.tripRoom.sendStaffTemplate(room.room_id,key);if(!ok){setNotice("模板通知未发送：请确认房间已开放且您属于本车工作人员。");return}setMessages((await services.tripRoom.loadMessages(room.room_id)) as RemoteMessage[]);setNotice("重要模板通知已发送并保留原文。");};
  const markBoarded=async(orderId:string)=>{const ok=await services.tripRoom.markOrderBoarded(room.vehicle_group_id,orderId);if(!ok){setNotice("登车状态更新失败或订单不属于本车。");return}setBoardings((await services.tripRoom.loadBoardingStatus(room.vehicle_group_id)) as RemoteBoarding[]);setNotice("登车状态已更新。");};
  const verifyBoarding=async()=>{if(!boardingToken.trim())return;const result=await services.verifyBoardingCredential({token:boardingToken.trim(),vehicleGroupId:room.vehicle_group_id,idempotencyKey:crypto.randomUUID()});if(!result){setBoardingResult('核验被拒绝：凭证格式、工作人员权限或本车归属不正确。');return}const labels:Record<string,string>={valid:'核验成功，已登记登车。',used:'该凭证已经使用。',expired:'该凭证已经过期。',revoked:'该凭证无效或已撤销。','wrong-vehicle':'该凭证不属于本车。'};setBoardingResult(labels[result.status]??`核验结果：${result.status}`);setBoardingToken('');setBoardings((await services.tripRoom.loadBoardingStatus(room.vehicle_group_id)) as RemoteBoarding[]);};
  const previewPhoto=(file:File|undefined)=>{if(!file)return;if(!file.type.startsWith('image/')||file.size>5*1024*1024){setNotice('请选择不超过 5 MB 的图片文件。');return}const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'&&setLocalPhoto({name:file.name,url:reader.result});reader.readAsDataURL(file);};
  return (
    <div className="trip-room">
      <div className="frozen-banner" role="status">
        <b>
          {room.room_status === "open"
            ? "群组已开放"
            : room.room_status === "frozen"
              ? "群组只读预览"
              : "群组已关闭"}
        </b>
        <span>
          实时连接：
          {connection === "connected"
            ? "已连接"
            : connection === "connecting"
              ? "正在连接"
              : "连接中断"}
        </span>
      </div>
      <div className="room-head">
        <div>
          <span>本车群组 · 第 {room.vehicle_sequence} 辆车</span>
          <h1>{room.vehicle_label??room.vehicle_type}</h1>
          <p>
            当前角色：
            {role === "operations"
              ? "运营人员"
              : role === "driver"
                ? "司机"
                : role === "guide"
                  ? "司导"
                  : "乘客"}
          </p>
        </div>
      </div>
      <section className="fulfilment-summary">
        <h2>置顶履约信息</h2>
        <div className="receipt">
          <div><span>出发时间</span><b>{room.departs_at?new Date(room.departs_at).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'}):'待确认'}</b></div>
          <div><span>集合地点</span><b>{room.meeting_name??'待确认'}</b></div>
          <div><span>集合地址</span><b>{room.meeting_address??'待确认'}</b></div>
          <div><span>车辆人数</span><b>{room.booked_seats} / {room.vehicle_capacity} 席</b></div>
          <div><span>订单返回／登车</span><b>{room.boarded_orders} / {room.total_orders}</b></div>
        </div>
        {room.map_lat!=null&&room.map_lng!=null?<a className="button secondary full" href={`https://www.google.com/maps/dir/?api=1&destination=${room.map_lat},${room.map_lng}&travelmode=walking`} target="_blank" rel="noreferrer">打开集合点步行导航</a>:<button className="button secondary full" disabled>地图坐标待确认</button>}
        <button className="button secondary full" type="button" disabled>步行寻找司机（实时位置未连接）</button>
        <p className="privacy">司机实时位置尚未连接；不会显示虚假距离或移动轨迹。</p>
      </section>
      {passenger&&room.room_status==='open'&&<section className="room-actions" aria-label="位置共享">
        <button className="room-action" onClick={()=>void shareLocation(15)}>共享位置 15 分钟</button>
        <button className="room-action" onClick={()=>void shareLocation(30)}>共享位置 30 分钟</button>
        <button className="room-action" onClick={()=>void stopLocation()}>停止共享</button>
      </section>}
      <section className="photo-preview">
        <h2>发送周围照片</h2>
        <label>拍摄或选择图片<input type="file" accept="image/*" capture="environment" disabled={room.room_status!=='open'} onChange={event=>previewPhoto(event.target.files?.[0])}/></label>
        {localPhoto&&<><img src={localPhoto.url} alt="仅保存在当前浏览器会话的照片预览"/><p>{localPhoto.name}</p><button type="button" className="button secondary full" onClick={()=>setLocalPhoto(null)}>移除本地预览</button></>}
        <p className="privacy">当前仅在本机内存中预览，不上传外部服务，也不会假装已发送到群组。安全存储与内容审核接通后才开放正式发送。</p>
      </section>
      {staff && (
        <section className="staff-panel">
          <h2>工作人员履约信息</h2>
          <div className="member-list">
            {boardings.map(item=><div key={item.order_id}><span><b>{item.passenger_label}</b> · {item.seat_count} 席 {item.location_shared?'· 已主动共享位置':''}</span><button type="button" disabled={room.room_status!=='open'||item.boarding_status==='boarded'} onClick={()=>void markBoarded(item.order_id)}>{item.boarding_status==='boarded'?'已登车':room.room_status==='open'?'标记已登车':'开放后可登车'}</button></div>)}
          </div>
          <h3>模板广播</h3>
          <div className="room-actions">{staffTemplates.map(([key,label])=><button className="room-action" type="button" key={key} disabled={room.room_status!=='open'} onClick={()=>void sendTemplate(key)}>{label}</button>)}</div>
          <p className="privacy">重要通知保存 Original 原文；Translation 字段已预留，当前不生成机器翻译。</p>
          <h3>核验登车凭证</h3>
          <label>扫描或粘贴凭证<input value={boardingToken} disabled={room.room_status!=='open'} onChange={event=>setBoardingToken(event.target.value)} placeholder={room.room_status==='open'?'bp_…':'行程房间开放后可核验'}/></label>
          <button className="button full" type="button" disabled={room.room_status!=='open'||!boardingToken.trim()} onClick={()=>void verifyBoarding()}>核验并登记登车</button>
          {boardingResult&&<p className="notice" role="status">{boardingResult}</p>}
          {projections.length ? (
            projections.map((item, index) => (
              <div className="receipt" key={String(item.order_id ?? index)}>
                <div>
                  <span>儿童座椅</span>
                  <b>{String(item.child_seat_count ?? 0)}</b>
                </div>
                <div>
                  <span>无障碍车辆</span>
                  <b>
                    {item.accessible_vehicle_required ? "需要确认" : "未提出"}
                  </b>
                </div>
                <div>
                  <span>工作人员协助</span>
                  <b>
                    {item.staff_assistance_required ? "需要确认" : "未提出"}
                  </b>
                </div>
              </div>
            ))
          ) : (
            <p>暂无可见的履约需求。</p>
          )}
        </section>
      )}
      <section className="vehicle-chat">
        <h2>本车消息</h2>
        <p className="privacy">仅本车成员可见；断线时不会伪装发送成功。</p>
        {messages.map((m) => (
          <article key={m.id}>
            <header>
              <b>{m.author_id === currentUserId ? "我" : "本车成员"}</b>
            </header>
            <p>{m.content}</p>
          </article>
        ))}
        <label>
          发送消息
          <textarea
            disabled={!access.enabled}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={access.enabled ? "输入本车消息" : access.reason}
          />
        </label>
        <button
          className="button full"
          disabled={!access.enabled || !draft.trim()}
          onClick={send}
        >
          {access.enabled ? "发送消息" : access.reason}
        </button>
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
