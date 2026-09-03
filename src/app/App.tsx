import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  Navigate,
  NavLink,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { travelRepository } from "../shared/data/repository";
import { backend } from "../shared/backend";
import { TripCard } from "../shared/components/TripCard";
import { appConfig, nextTier, tierFor } from "../shared/config/businessRules";
import {
  createChildSeatRequest,
  describeAssistance,
  describeChildSeat,
  emptyAssistance,
  reviewStatusFor,
} from "../shared/services/passengerAssistance";
import type { ChildSeatChoice } from "../shared/types";
import { GoogleMapsAdapter } from "../shared/integrations/googleMaps";
import { useApp } from "./store";
import { referralCodeFromSearch, safeReturnTo } from "./auth";
import { passwordRules, passwordRuleText } from "../shared/config/authConfig";
import { seatOrderTotal } from "../shared/services/pricing";
const trips = travelRepository.listTrips();
const Empty = ({
  title = "暂无内容",
  text = "当前没有可显示的数据。",
}: {
  title?: string;
  text?: string;
}) => (
  <div className="empty-card">
    <b>{title}</b>
    <p>{text}</p>
  </div>
);
export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  return (
    <label className={`language-select${compact ? " compact" : ""}`}>
      {compact ? <span aria-hidden="true">CN</span> : "语言"}
      <select aria-label="语言" value="zh-CN" onChange={() => {}}>
        <option value="zh-CN">{compact ? "CN" : "简体中文"}</option>
        <option disabled>English（后续开放）</option>
        <option disabled>日本語（后续开放）</option>
      </select>
    </label>
  );
}
export function AppShell({
  children,
  nav = false,
}: {
  children: ReactNode;
  nav?: boolean;
}) {
  const { pathname } = useLocation();
  const screen = pathname.split('/').filter(Boolean).slice(1, 2)[0] ?? 'home';
  return (
    <div className="app-stage">
      <div className={`app-frame passenger-v2 screen-${screen}`}>
        <header className="app-top">
          <Link className="app-brand" to="/app" aria-label="返回游客端首页"><i>JT</i><span>Japan Travel Weekend</span></Link>
          <LanguageSelect compact />
        </header>
        <main className="app-content passenger-screen">{children}</main>
        {nav && (
          <nav className="bottom-nav" aria-label="应用导航">
            <NavLink end to="/app">
              ⌂<span>首页</span>
            </NavLink>
            <NavLink to="/app/trips">
              ◇<span>行程</span>
            </NavLink>
            <NavLink to="/app/orders">
              ▤<span>订单</span>
            </NavLink>
            <NavLink to="/app/my-trip/room">
              ◉<span>消息</span>
            </NavLink>
            <NavLink to="/app/profile">
              ○<span>我的</span>
            </NavLink>
          </nav>
        )}
      </div>
    </div>
  );
}
const AppTitle = ({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) => (
  <div className="app-title">
    <div className="eyebrow">{eyebrow}</div>
    <h1>{title}</h1>
    {text && <p>{text}</p>}
  </div>
);
const BookingSteps = ({ current }: { current: 1 | 2 | 3 | 4 }) => (
  <ol className="booking-steps" aria-label={`预订进度，第 ${current} 步，共 4 步`}>
    {['选择班次','乘客资料','确认订单','提交订单'].map((label,index)=><li className={index+1<=current?'active':''} aria-current={index+1===current?'step':undefined} key={label}><span>{index+1}</span><b>{label}</b></li>)}
  </ol>
);
export function Login() {
  const { state, setState, services, authResolved } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get("returnTo"));
  const referralCode = referralCodeFromSearch(location.search);
  const [error, setError] = useState("");
  const connected = backend.connected || services?.authAvailable === true;
  const production = appConfig.runtimeMode === "production";
  useEffect(() => {
    if (authResolved && state.user) nav(returnTo, { replace: true });
  }, [authResolved, state.user, nav, returnTo]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (services) {
        const result = await services.signIn(
          String(f.get("email")),
          String(f.get("password")),
        );
        const user = result?.user ?? (await services.currentUser());
        if (!user?.email) throw new Error("登录失败，请检查账户信息");
        setState({ ...state, user: { email: user.email } });
      } else {
        const result = await backend.auth.register(
          String(f.get("email")),
          String(f.get("password")),
        );
        setState({ ...state, user: { email: result.account.email } });
      }
      nav(returnTo, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "账户服务暂时不可用");
    }
  };
  if (!authResolved)
    return <div className="empty-card" role="status"><b>正在恢复账户会话</b><p>请稍候，正在安全确认登录状态。</p></div>;
  return (
    <>
      <AppTitle
        eyebrow="欢迎"
        title="从关西周末出发"
        text={
          services
            ? production
              ? "登录账户"
              : "登录测试账户"
            : backend.connected
              ? "创建仅限当前会话的本地开发账户"
              : "正式账户服务尚未连接"
        }
      />
      <form className="form" onSubmit={submit}>
        <label>
          电子邮箱
          <input
            required
            name="email"
            type="email"
            autoComplete="username"
            placeholder="请输入电子邮箱"
          />
        </label>
        <label>
          密码
          <input
            required
            minLength={passwordRules.minLength}
            name="password"
            type="password"
            autoComplete={services ? "current-password" : "new-password"}
            placeholder={passwordRuleText}
          />
        </label>
      {!services && !production && (
          <label>
            推荐码 <small>选填</small>
            <input
              name="referral"
              autoComplete="off"
              defaultValue={referralCode}
              aria-describedby={referralCode ? "referral-link-note" : undefined}
            />
            {referralCode && <small id="referral-link-note">已从邀请链接自动填写</small>}
          </label>
        )}
        {error && (
          <div className="danger" role="alert">
            {error}
          </div>
        )}
        <button className="button full" disabled={!connected}>
          {services
            ? production
              ? "登录账户"
              : "登录测试账户"
            : backend.connected
              ? "创建本地开发账户"
              : "账户服务未连接"}
        </button>
        <p className="privacy">
          {services
            ? production
              ? "使用安全账户会话；您只能查看本人有权访问的订单与行程。"
              : "测试账户会话由 Supabase 管理；订单读取受本人 RLS 限制。"
            : production
              ? "正式账户服务未配置，不会创建本地账户或加载演示订单。"
              : "本地开发账户和会话只存在于内存，不写入 localStorage。"}
        </p>
        {production && services?.authAvailable && (
          <div className="auth-links">
            <Link to="/app/create-account">创建账户</Link>
            <Link to="/app/forgot-password">忘记密码</Link>
          </div>
        )}
      </form>
    </>
  );
}
export function AppHome() {
  const {
    state,
    departures: deps,
    departuresResolved,
    departuresError,
  } = useApp();
  const featuredTrips = trips.slice(0, 4);
  return (
    <div className="fulfillment-home passenger-home-v2">
      <section className="passenger-yellow-hero">
        <div className="passenger-welcome"><div><span>周末，从大阪出发</span><h1>你好，今天想去哪里？</h1></div><Link to="/app/notifications" aria-label="查看通知"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><em aria-hidden="true" /></Link></div>
        <div className="next-trip-pass">
          <div><span>{state.tripRoom ? "下一次行程" : "JAPAN TRAVEL PASS"}</span><h2>{state.tripRoom ? "京都与奈良 · 明日出发" : "把关西周末装进口袋"}</h2><p>{state.tripRoom ? "08:00 大阪梅田集合 · 车辆信息已更新" : "路线、订单、集合与旅行消息集中查看"}</p></div>
          <Link to={state.tripRoom ? "/app/my-trip" : "/app/trips"}>{state.tripRoom ? "查看行程" : "开始选路线"} →</Link>
        </div>
      </section>
      <section className="passenger-member-strip" aria-label="会员信息"><div><small>旅行金</small><b>¥{state.credits}</b></div><div><small>会员等级</small><b>{tierFor(state.completedTrips).name}</b></div><Link to="/app/rewards">查看权益 →</Link></section>
      <nav className="passenger-quick-actions" aria-label="常用功能">
        <Link to="/app/my-trip"><i>行</i><span>集合行程</span></Link>
        <Link to="/app/guides"><i>读</i><span>旅行指南</span></Link>
        <Link to="/app/rewards"><i>惠</i><span>会员权益</span></Link>
        <Link to="/app/support"><i>问</i><span>客服</span></Link>
      </nav>
      <Link className="passenger-alert-ribbon" to="/app/notifications"><span>出发提醒</span><b>付款、集合与车辆通知集中查看</b><strong>›</strong></Link>
      <div className="passenger-section-heading"><div><span>WEEKEND PICKS</span><h2>这个周末，去看更远的风景</h2></div><Link to="/app/trips">全部路线</Link></div>
      <div className="passenger-route-rail">
        {featuredTrips.map((trip)=><Link to={`/app/trips/${trip.slug}`} key={trip.id}><img src={trip.heroImage} alt=""/><div><small>{trip.region} · {trip.duration}</small><h3>{trip.shortTitle}</h3><p>{trip.stops.slice(0,3).join(' → ')}</p></div></Link>)}
      </div>
      <div className="passenger-section-heading compact"><div><span>AVAILABLE</span><h2>近期可订班次</h2></div><Link to="/app/trips">查看全部</Link></div>
      {!departuresResolved ? (
        <Empty title="正在读取可售班次" text="请稍候，正在同步最新出发信息。" />
      ) : departuresError ? (
        <Empty title="暂时无法读取班次" text="请稍后刷新页面重试。" />
      ) : deps.length ? (
        <div className="passenger-departure-list">
          {deps.slice(0,3).map((departure) => {
            const trip = travelRepository.getTrip(departure.tripSlug);
            if (!trip) return null;
            return (
              <Link className="passenger-departure-row" key={departure.id} to={`/app/booking/${trip.slug}`}><time><b>{departure.weekend}</b><small>{departure.dateLabel}</small></time><div><h3>{trip.shortTitle}</h3><p>{trip.stops.slice(0,3).join(' → ')}</p><span>{departure.price==null?'价格待确认':`每席 ¥${departure.price.toLocaleString('ja-JP')}`} {departure.availableSeats==null?'':` · 余 ${departure.availableSeats} 席`}</span></div><strong>›</strong></Link>
            );
          })}
        </div>
      ) : (
        <Empty
          title="暂无开放班次"
          text="正式环境不会自动生成日期、价格、余位或即将出发的行程。"
        />
      )}
      <div className="passenger-section-heading compact"><div><span>TRAVEL IDEAS</span><h2>出发前，看一点有用的</h2></div><Link to="/app/guides">全部内容</Link></div>
      <div className="passenger-guide-grid"><Link to="/app/guides#food"><span>当地餐食</span><b>京都与奈良的一日用餐建议</b><small>6 分钟阅读</small></Link><Link to="/app/guides#meeting"><span>集合指南</span><b>第一次参加巴士一日游怎么准备</b><small>4 分钟阅读</small></Link></div>
      <Link className="passenger-private-card" to="/app/private-groups"><div><span>PRIVATE GROUPS</span><b>企业、学校或亲友团体出行</b><p>告诉我们人数和日期，获取专属方案。</p></div><strong>咨询 →</strong></Link>
    </div>
  );
}

export function AppNotifications(){
  const [filter,setFilter]=useState<'all'|'order'|'trip'|'system'>('all');
  const items=[
    {type:'order',label:'订单通知',title:'订单资料已保存',text:'可继续核对乘客资料与取消规则；当前尚未扣款。',time:'刚刚'},
    {type:'trip',label:'旅行团通知',title:'出发前一天将开放集合提醒',text:'集合地点、车辆和司导信息确认后会显示在“我的行程”。',time:'今天'},
    {type:'system',label:'系统通知',title:'多语言翻译功能准备中',text:'行程群消息将支持按手机语言查看译文，原文始终保留。',time:'8月30日'},
  ];
  return <div className="passenger-page"><AppTitle eyebrow="消息中心" title="通知" text="只保留与订单、出发和账户安全有关的重要信息。"/><div className="notification-filters">{([['all','全部'],['order','订单'],['trip','旅行团'],['system','系统']] as const).map(([key,label])=><button className={filter===key?'active':''} onClick={()=>setFilter(key)} key={key}>{label}</button>)}</div><div className="notification-list">{items.filter(item=>filter==='all'||item.type===filter).map(item=><article key={item.title}><i>{item.type==='order'?'单':item.type==='trip'?'旅':'系'}</i><div><span>{item.label} · {item.time}</span><h2>{item.title}</h2><p>{item.text}</p></div></article>)}</div><p className="passenger-page-note">司机、司导的工作通知不会混入游客通知；营销内容默认不推送。</p></div>
}

export function AppGuides(){
  return <div className="passenger-page"><AppTitle eyebrow="旅行灵感" title="关西旅行指南" text="餐食、集合、礼仪和季节提醒，帮助你在出发前做好准备。"/><div className="guide-feature"><img src="/images/kyoto-nara.jpg" alt="京都古街"/><div><span>初次参加指南</span><h2>第一次参加周末一日游</h2><p>从订单确认、集合签到到返程提醒，一次看懂完整流程。</p><Link to="/how-it-works">查看流程 →</Link></div></div><div className="guide-list" id="food"><article><span>餐食推荐</span><h2>京都与奈良的一日用餐建议</h2><p>了解午餐自理、过敏信息申报和行程中的用餐时间安排。</p></article><article id="meeting"><span>集合指南</span><h2>如何快速找到集合车辆</h2><p>出发前确认地标、提前到达，并在行程房间查看最新车辆提示。</p></article><article><span>旅行礼仪</span><h2>神社、温泉与观光巴士礼仪</h2><p>用简单的准备，让自己和同团旅客都更舒适。</p></article></div></div>
}

export function AppSupport(){
  const [open,setOpen]=useState('');
  const faqs=[['booking','怎样确认订单是否成立？','以订单页面显示“已确认”为准。仅保存资料或订单草稿不代表已经付款或占位。'],['meeting','集合地点什么时候显示？','运营确认集合点、车辆和工作人员后，会同步到订单详情与我的行程。'],['cancel','如何申请取消？','请从订单详情发起申请。取消时间统一按日本时间，以系统成功受理时间为准。']];
  return <div className="passenger-page"><AppTitle eyebrow="帮助与客服" title="需要帮助吗？" text="先查看常见问题；紧急履约问题会在行程房间提供专用入口。"/><div className="support-actions"><Link to="/app/orders"><i>单</i><b>订单问题</b><span>查看订单状态</span></Link><Link to="/app/my-trip/room"><i>行</i><b>出发当天</b><span>进入行程房间</span></Link></div><div className="support-faq"><h2>常见问题</h2>{faqs.map(([key,title,text])=><article key={key}><button onClick={()=>setOpen(open===key?'':key)} aria-expanded={open===key}><b>{title}</b><span>{open===key?'−':'＋'}</span></button>{open===key&&<p>{text}</p>}</article>)}</div><a className="button full" href="mailto:alerts@japan-travel.info?subject=Japan%20Travel%20Weekend%20客服咨询">发送邮件咨询</a><p className="passenger-page-note">邮件不适合处理出发当天的紧急问题；行程开放后请使用行程房间联系运营。</p></div>
}
export function AppTrips() {
  return (
    <div className="route-catalog">
      <AppTitle
        eyebrow="路线预告"
        title="下一次想去哪里？"
        text="路线可浏览，日期、价格和余位以正式开放信息为准。"
      />
      <div className="catalog-intro"><b>{trips.length} 条精选路线</b><span>从经典古都到海岸、温泉与亲子主题</span></div>
      <div className="app-list route-card-list">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} app />
        ))}
      </div>
    </div>
  );
}
export function AppTrip() {
  const t = travelRepository.getTrip(useParams().slug || "");
  const {departures}=useApp();
  if (!t) return <Empty title="未找到行程" />;
  const routeDepartures=departures.filter(item=>item.tripSlug===t.slug);
  const sellable=routeDepartures.filter(item=>item.price!=null&&item.availableSeats!==0);
  return (
    <div className="route-detail-page">
      <section className="route-detail-hero"><img src={t.heroImage} alt={`${t.shortTitle}路线风景`} /><div className="route-detail-overlay"><span>{t.region} · {t.duration}</span><h1>{t.shortTitle}</h1><p>{t.subtitle}</p></div></section>
      <div className="route-facts"><span><small>行程时长</small><b>{t.duration}</b></span><span><small>步行强度</small><b>{t.walkingLevel}</b></span><span><small>服务语言</small><b>{t.languages.join('、')}</b></span></div>
      <p className="route-lead">{t.description}</p>
      <h2>行程亮点</h2>
      <ul className="check-list">
        {t.highlights.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <h2>参考行程顺序</h2>
      <div className="route-timeline">
        {t.timeline.map((item,index)=><article key={`${item.title}-${index}`}><span>{item.time??'时间以班次为准'}</span><div><h3>{item.title}</h3><b>{item.location}</b><p>{item.detail}</p></div></article>)}
      </div>
      <div className="route-detail-grid">
        <section><h2>适合人群</h2><ul className="check-list">{t.suitableFor.map(item=><li key={item}>{item}</li>)}</ul></section>
        <section><h2>餐食与步行</h2><p>{t.mealOptions}</p><p>步行强度：{t.walkingLevel}</p></section>
        <section><h2>包含项目</h2><ul>{t.included.map(item=><li key={item}>{item}</li>)}</ul></section>
        <section><h2>不包含项目</h2><ul>{t.excluded.map(item=><li key={item}>{item}</li>)}</ul></section>
      </div>
      <h2>预订前须知</h2>
      <ul className="check-list">{t.notices.map(item=><li key={item}>{item}</li>)}</ul>
      <p className="notice">{t.assistanceStatus}。未确认或无法提供的附加服务不会提前收费。</p>
      <div className="route-booking-bar"><div><small>{sellable.length?'当前最低每席':'开放状态'}</small><b>{sellable.length?`¥${Math.min(...sellable.map(item=>item.price as number)).toLocaleString('ja-JP')}`:'班次待发布'}</b></div><Link className="button" to={`/app/booking/${t.slug}`}>{sellable.length?'选择班次':'查看开放状态'}</Link></div>
    </div>
  );
}
export function BookingPage() {
  const t = travelRepository.getTrip(useParams().slug || "") ?? trips[0];
  const { state, updateBooking, departures } = useApp();
  const deps = departures.filter((d) => d.tripSlug === t.slug);
  const nav = useNavigate();
  const sellable = deps.filter((departure) => departure.price != null && departure.availableSeats !== 0);
  const datedDepartures=deps.filter(departure=>departure.departureTime).sort((a,b)=>new Date(a.departureTime!).getTime()-new Date(b.departureTime!).getTime()).slice(0,30);
  const displayedDepartures=datedDepartures.length?datedDepartures:deps;
  const firstDisplayedSellable=displayedDepartures.find(item=>item.price!=null&&item.availableSeats!==0);
  const firstCalendarDate=displayedDepartures.find(item=>item.departureTime)?.departureTime;
  const calendarWeekdays=['周一','周二','周三','周四','周五','周六','周日'];
  const firstCalendarWeekday=firstCalendarDate?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',weekday:'short'}).format(new Date(firstCalendarDate)):calendarWeekdays[0];
  const calendarLeadingBlanks=Math.max(0,calendarWeekdays.indexOf(firstCalendarWeekday));
  const initialDeparture=state.booking?.tripSlug===t.slug&&displayedDepartures.some(item=>item.id===state.booking?.departureId)?state.booking.departureId:firstDisplayedSellable?.id??'';
  const [selectedDeparture,setSelectedDeparture]=useState(initialDeparture);
  const [adults,setAdults]=useState(state.booking?.tripSlug===t.slug?state.booking?.adults??1:1);
  const [children,setChildren]=useState(state.booking?.tripSlug===t.slug?state.booking?.children??0:0);
  const [infants,setInfants]=useState(state.booking?.tripSlug===t.slug?state.booking?.infants??0:0);
  const effectiveDepartureId=displayedDepartures.some(item=>item.id===selectedDeparture)?selectedDeparture:firstDisplayedSellable?.id??'';
  const chosen=sellable.find(item=>item.id===effectiveDepartureId);
  const bookingTotal=seatOrderTotal(chosen?.price,adults+children+infants);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const departureId=String(f.get("departure"));
    if(!sellable.some((departure)=>departure.id===departureId))return;
    updateBooking({
      tripSlug: t.slug,
      departureId,
      adults: Number(f.get("adults")),
      children: Number(f.get("children")),
      infants: Number(f.get("infants")),
    });
    nav("/app/passengers");
  };
  return (
    <>
      <BookingSteps current={1}/>
      <section className="booking-route-summary"><img src={t.heroImage} alt=""/><div><span>{t.region} · {t.duration}</span><h1>{t.shortTitle}</h1><p>{t.subtitle}</p></div></section>
      {deps.length ? (
        <form className="form" onSubmit={submit}>
          <fieldset className="departure-calendar"><legend>选择出发日期 <small>未来 30 天 · 日本时间</small></legend><div className="departure-calendar-weekdays" aria-hidden="true">{calendarWeekdays.map(day=><span className={day==='周六'||day==='周日'?'weekend':''} key={day}>{day}</span>)}</div><div className="departure-calendar-grid">{Array.from({length:calendarLeadingBlanks},(_,index)=><span className="calendar-blank" aria-hidden="true" key={`blank-${index}`}/>) }{displayedDepartures.map(d=>{const date=d.departureTime?new Date(d.departureTime):null;const day=date?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',day:'numeric'}).format(date):d.dateLabel;const weekday=date?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',weekday:'short'}).format(date):'';const weekend=weekday==='周六'||weekday==='周日';return <label className={`${effectiveDepartureId===d.id?'selected ':''}${weekend?'weekend':''}`} key={d.id}><input required type="radio" name="departure" value={d.id} checked={effectiveDepartureId===d.id} disabled={d.price==null||d.availableSeats===0} onChange={()=>setSelectedDeparture(d.id)}/><b>{day}</b><small>{d.price==null?'待定':`¥${d.price.toLocaleString('ja-JP')}`}</small></label>})}</div></fieldset>
          {chosen&&<><div className="selected-departure-summary"><div><span>已选日期</span><b>{chosen.dateLabel}</b></div><div><span>出发时间</span><b>{chosen.departureTime?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(chosen.departureTime)):'待确认'}</b></div><div><span>每席价格</span><b>{chosen.price==null?'待公布':`¥${chosen.price.toLocaleString('ja-JP')}`}</b></div><div><span>余位</span><b>{chosen.availableSeats==null?'待公布':`${chosen.availableSeats} 席`}</b></div></div><p className="booking-calendar-note">{chosen.expectedEndTime?`预计 ${new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(chosen.expectedEndTime))} 返回`:'返回时间待确认'} · {chosen.meetingPointName?`集合：${chosen.meetingPointName}`:'集合地点确认后在订单中显示'} · 日本时间</p></>}
          <h2 className="booking-subtitle">出行人数</h2>
          <div className="form-row booking-party-grid">
            <label>
              成人座位
              <input
                min="1"
                max="6"
                name="adults"
                type="number"
                value={adults}
                onChange={event=>setAdults(Number(event.target.value))}
              />
            </label>
            <label>
              儿童座位
              <input
                min="0"
                max="6"
                name="children"
                type="number"
                value={children}
                onChange={event=>setChildren(Number(event.target.value))}
              />
            </label>
            <label>
              婴儿
              <input
                min="0"
                max="6"
                name="infants"
                type="number"
                value={infants}
                onChange={event=>setInfants(Number(event.target.value))}
              />
            </label>
          </div>
          <p className="privacy">成人、儿童及婴儿均计入配车人数；婴儿占座与费用规则由运营确认后再进入付款。</p>
          <div className="booking-note"><b>座位与车辆说明</b><p>成人、儿童及婴儿均计入配车人数。车辆由平台根据最终人数统一安排，购买时不指定车型。</p></div>
          {!sellable.length&&<p className="notice" role="status">该班次价格或库存尚未开放，目前不能进入结账。开放后将在此显示最终每席价格。</p>}
          <div className="booking-submit"><span><small>合计</small><b>{bookingTotal==null?'待确认':`¥${bookingTotal.toLocaleString('ja-JP')}`}</b></span><button className="button" disabled={!sellable.length||adults+children+infants<1}>继续填写资料</button></div>
        </form>
      ) : (
        <Empty
          title="该路线暂无开放班次"
          text="正式环境不会编造日期、价格或余位。请稍后查看。"
        />
      )}
    </>
  );
}
export function Passengers() {
  const { state, updateBooking, departures } = useApp();
  const nav = useNavigate();
  const childCount = state.booking?.children ?? 0;
  const [seatChoice, setSeatChoice] = useState<ChildSeatChoice | "">("");
  const [hasStroller, setHasStroller] = useState(false);
  const [needsWheelchair, setNeedsWheelchair] = useState(false);
  const selectedDeparture=departures.find((departure)=>departure.id===state.booking?.departureId);
  const selectedTrip=travelRepository.getTrip(state.booking?.tripSlug??'');
  const partySize=(state.booking?.adults??0)+(state.booking?.children??0)+(state.booking?.infants??0);
  const bookingReady=Boolean(selectedDeparture&&selectedDeparture.price!=null&&selectedDeparture.availableSeats!==0);
  if(!bookingReady)return <Navigate replace to={`/app/booking/${state.booking?.tripSlug??'kyoto-nara-classic'}?reason=select-departure`}/>;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const assistance = emptyAssistance();
    if (childCount > 0) {
      const children = Array.from({ length: childCount }, (_, index) => ({
        age: Number(f.get(`childAge${index}`)),
      }));
      assistance.childSeat = createChildSeatRequest(
        children,
        seatChoice as ChildSeatChoice,
        seatChoice === "platform" ? Number(f.get("childSeatQuantity")) : 0,
      );
      assistance.stroller = {
        bringing: hasStroller,
        quantity: hasStroller ? Number(f.get("strollerQuantity")) : 0,
        foldable: hasStroller ? f.get("strollerFoldable") === "yes" : null,
        oversized: hasStroller ? f.get("strollerOversized") === "yes" : null,
      };
    }
    assistance.wheelchair = needsWheelchair
      ? {
          needed: true,
          source: String(f.get("wheelchairSource")) as "own" | "rental",
          type: String(f.get("wheelchairType")) as "manual" | "electric",
          foldable: f.get("wheelchairFoldable") === "yes",
          dimensions: String(f.get("wheelchairDimensions")),
          weightKg: f.get("wheelchairWeight")
            ? Number(f.get("wheelchairWeight"))
            : null,
          canTransfer: f.get("canTransfer") === "yes",
          requiresLift: f.get("requiresLift") === "on",
          requiresAccessibleVehicle: f.get("accessibleVehicle") === "on",
          requiresStaffAssistance: f.get("staffAssistance") === "on",
          notes: String(f.get("mobilityNotes")),
        }
      : assistance.wheelchair;
    assistance.other = {
      largeLuggage: Number(f.get("largeLuggage") || 0),
      walker: f.get("walker") === "on",
      foldingEquipment: String(f.get("foldingEquipment")),
      serviceDog: f.get("serviceDog") === "on",
      reducedWalkingMeeting: f.get("reducedWalkingMeeting") === "on",
      notes: String(f.get("otherNeeds")),
    };
    assistance.operationalReviewStatus = reviewStatusFor(assistance);
    updateBooking({
      passenger: {
        name: String(f.get("name")),
        nationality: String(f.get("nationality")),
        language: String(f.get("language")),
        phone: String(f.get("phone")),
        emergency: String(f.get("emergency")),
        dietary: String(f.get("dietary")),
        notes: String(f.get("notes")),
      },
      assistance,
    });
    nav("/app/checkout");
  };
  return (
    <>
      <BookingSteps current={2}/>
      <AppTitle
        eyebrow="第 2 步，共 4 步"
        title="填写出行联系人"
        text="用于发送订单确认和行前集合通知，请填写当天能够联系到的信息。"
      />
      <div className="passenger-trip-summary"><span>{selectedDeparture?.dateLabel}</span><b>{selectedTrip?.shortTitle}</b><small>{partySize} 人出行 · {state.booking?.adults??0} 成人 · {state.booking?.children??0} 儿童 · {state.booking?.infants??0} 婴儿</small></div>
      <form className="form" onSubmit={submit}>
        <section className="form-section"><header><span>01</span><div><h2>主要联系人</h2><p>订单与紧急联络信息</p></div></header>
        <label>
          主要乘客姓名
          <input required name="name" autoComplete="name" placeholder="请与旅行证件姓名保持一致" />
        </label>
        <label>
          国籍
          <input required name="nationality" autoComplete="country-name" placeholder="例如：中国、日本" />
        </label>
        <label>
          首选沟通语言
          <select name="language">
            <option>简体中文</option>
            <option>日本語</option>
            <option>English</option>
            <option>Tiếng Việt</option>
            <option>नेपाली</option>
          </select>
        </label>
        <label>
          手机号码
          <input required name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="包含国家或地区代码" />
        </label>
        <label>
          紧急联系人
          <input required name="emergency" placeholder="姓名及联系电话" />
        </label>
        </section>
        <div className="form-section-heading"><span>02</span><div><h2>乘车与协助需求</h2><p>没有特殊需求时保持默认即可</p></div></div>
        {childCount > 0 && (
          <fieldset className="assistance-module">
            <legend>儿童乘车需求</legend>
            <p>
              本订单包含 {childCount}{" "}
              名儿童。年龄用于运营判断乘车需求；身高和体重字段已在结构中预留，本轮不收集。
            </p>
            {Array.from({ length: childCount }, (_, index) => (
              <label key={index}>
                儿童 {index + 1} 年龄
                <input
                  required
                  name={`childAge${index}`}
                  type="number"
                  min="0"
                  max="17"
                  step="1"
                  inputMode="numeric"
                />
              </label>
            ))}
            <label>
              是否需要提供儿童安全座椅
              <select
                required
                name="childSeatChoice"
                value={seatChoice}
                onChange={(event) =>
                  setSeatChoice(event.target.value as ChildSeatChoice | "")
                }
              >
                <option value="" disabled>
                  请选择
                </option>
                <option value="platform">需要平台提供</option>
                <option value="own">自带儿童安全座椅</option>
                <option value="none">不需要</option>
                <option value="contact">暂不确定，需要工作人员联系确认</option>
              </select>
            </label>
            {seatChoice === "platform" && (
              <>
                <label>
                  需要平台提供的数量
                  <input
                    required
                    name="childSeatQuantity"
                    type="number"
                    min="1"
                    max={childCount}
                    step="1"
                    defaultValue="1"
                  />
                </label>
                <p className="notice">
                  需求已提交，设备类型、车辆适配及可能费用需由运营确认，不代表已经租赁成功。
                </p>
              </>
            )}
            <label>
              是否携带婴儿车
              <select
                name="hasStroller"
                value={hasStroller ? "yes" : "no"}
                onChange={(event) =>
                  setHasStroller(event.target.value === "yes")
                }
              >
                <option value="no">不携带</option>
                <option value="yes">携带</option>
              </select>
            </label>
            {hasStroller && (
              <div className="form-row">
                <label>
                  婴儿车数量
                  <input
                    required
                    name="strollerQuantity"
                    type="number"
                    min="1"
                    max={childCount}
                    defaultValue="1"
                  />
                </label>
                <label>
                  是否可折叠
                  <select required name="strollerFoldable">
                    <option value="yes">可折叠</option>
                    <option value="no">不可折叠</option>
                  </select>
                </label>
                <label>
                  是否为大型婴儿车
                  <select required name="strollerOversized">
                    <option value="no">否</option>
                    <option value="yes">是</option>
                  </select>
                </label>
              </div>
            )}
          </fieldset>
        )}
        <fieldset className="assistance-module">
          <legend>轮椅／行动协助</legend>
          <label className="check">
            <input
              name="needsWheelchair"
              type="checkbox"
              checked={needsWheelchair}
              onChange={(event) => setNeedsWheelchair(event.target.checked)}
            />{" "}
            需要轮椅或行动协助
          </label>
          {needsWheelchair && (
            <>
              <div className="form-row">
                <label>
                  来源
                  <select required name="wheelchairSource">
                    <option value="own">自带</option>
                    <option value="rental">申请租赁（需确认）</option>
                  </select>
                </label>
                <label>
                  类型
                  <select required name="wheelchairType">
                    <option value="manual">手动轮椅</option>
                    <option value="electric">电动轮椅</option>
                  </select>
                </label>
                <label>
                  是否可折叠
                  <select required name="wheelchairFoldable">
                    <option value="yes">可折叠</option>
                    <option value="no">不可折叠</option>
                  </select>
                </label>
                <label>
                  能否转移到车辆座椅
                  <select required name="canTransfer">
                    <option value="yes">可以</option>
                    <option value="no">不可以</option>
                  </select>
                </label>
              </div>
              <label>
                尺寸 <small>选填，用于空间确认</small>
                <input name="wheelchairDimensions" placeholder="长 × 宽 × 高" />
              </label>
              <label>
                重量（千克）<small>选填，用于设备与装载确认</small>
                <input
                  name="wheelchairWeight"
                  type="number"
                  min="0"
                  step="0.1"
                />
              </label>
              <label className="check">
                <input name="requiresLift" type="checkbox" /> 需要升降设备
              </label>
              <label className="check">
                <input name="accessibleVehicle" type="checkbox" />{" "}
                需要无障碍车辆
              </label>
              <label className="check">
                <input name="staffAssistance" type="checkbox" />{" "}
                需要工作人员协助
              </label>
              <label>
                行动协助说明
                <textarea
                  name="mobilityNotes"
                  placeholder="仅填写履约所需信息，不要填写无关健康诊断"
                />
              </label>
              <p className="notice">
                租赁、无障碍车辆、升降设备及工作人员协助均需运营确认，提交需求不代表一定能够提供。
              </p>
            </>
          )}
        </fieldset>
        <fieldset className="assistance-module">
          <legend>其他配车与集合需求</legend>
          <label>
            大件行李数量
            <input
              name="largeLuggage"
              type="number"
              min="0"
              max="20"
              defaultValue="0"
            />
          </label>
          <label className="check">
            <input name="walker" type="checkbox" /> 携带助行器
          </label>
          <label>
            其他折叠设备
            <input name="foldingEquipment" placeholder="选填，例如折叠推车" />
          </label>
          <label className="check">
            <input name="serviceDog" type="checkbox" /> 携带服务犬（需运营确认）
          </label>
          <label className="check">
            <input name="reducedWalkingMeeting" type="checkbox" />{" "}
            需要减少步行的集合方式
          </label>
          <label>
            其他特殊说明
            <textarea
              name="otherNeeds"
              placeholder="选填；不要填写无关健康诊断"
            />
          </label>
        </fieldset>
        <section className="form-section optional-notes"><header><span>03</span><div><h2>补充信息</h2><p>均为选填，请只填写本次行程需要的信息</p></div></header><label>
          饮食需求
          <textarea name="dietary" placeholder="选填" />
        </label>
        <label>
          订单备注
          <textarea name="notes" placeholder="选填" />
        </label>
        </section>
        <button className="button full">核对订单</button>
        <p className="privacy">继续后仍可返回修改。平台只向本次行程必要的工作人员提供最少履约信息。</p>
      </form>
    </>
  );
}
export function Checkout() {
  const { state, updateBooking, departures } = useApp();
  const nav = useNavigate();
  const dep = departures.find((item) => item.id === state.booking?.departureId);
  const guests = (state.booking?.adults ?? 0) + (state.booking?.children ?? 0) + (state.booking?.infants ?? 0);
  const total = seatOrderTotal(dep?.price, guests);
  const summaries = describeAssistance(state.booking?.assistance);
  const trip=travelRepository.getTrip(state.booking?.tripSlug || "");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateBooking({ acceptedCancellation: true, acceptedTerms: true });
    nav("/app/payment");
  };
  if(!state.booking?.passenger||!dep||total==null||guests<1)return <><AppTitle eyebrow="订单资料不完整" title="请先选择有效班次" text="只有价格、库存和乘客资料均已确认后，才能进入结账。"/><Link className="button full" to={`/app/booking/${state.booking?.tripSlug??'kyoto-nara-classic'}`}>返回选择出发班次</Link></>;
  return (
    <>
      <BookingSteps current={3}/>
      <AppTitle eyebrow="第 3 步，共 4 步" title="确认预订信息" text="请特别核对出发日期、人数和联系电话。提交后会先保存订单，不会在本阶段扣款。" />
      <section className="checkout-hero"><img src={trip?.heroImage} alt=""/><div><span>{dep.dateLabel}</span><h2>{trip?.shortTitle??'行程待确认'}</h2><p>{guests} 人 · {trip?.duration}</p></div></section>
      <div className="checkout-section-title"><h2>行程与费用</h2><Link to={`/app/booking/${state.booking.tripSlug}`}>修改</Link></div>
      <div className="receipt checkout-receipt">
        <div>
          <span>行程</span>
          <b>
            {travelRepository.getTrip(state.booking?.tripSlug || "")
              ?.shortTitle ?? "待选择"}
          </b>
        </div>
        <div>
          <span>出发班次</span>
          <b>{dep?.dateLabel ?? "待选择"}</b>
        </div>
        <div>
          <span>成人／儿童／婴儿</span>
          <b>
            {state.booking?.adults ?? 0} 名成人／{state.booking?.children ?? 0}{" "}
            名儿童／{state.booking?.infants ?? 0} 名婴儿
          </b>
        </div>
        <div>
          <span>特殊乘车需求</span>
          <b>
            {summaries.map((item) => (
              <span className="summary-line" key={item}>
                {item}
              </span>
            ))}
          </b>
        </div>
        <div>
          <span>运营审核状态</span>
          <b>
            {state.booking?.assistance?.operationalReviewStatus ?? "未提出"}
          </b>
        </div>
        <div>
          <span>每席价格</span>
          <b>{dep?.price == null ? "待公布" : `¥${dep.price}`}</b>
        </div>
        <div>
          <span>应付总额</span>
          <b className="checkout-total">{total == null ? "待公布" : `¥${total.toLocaleString('ja-JP')}`}</b>
        </div>
      </div>
      <div className="checkout-section-title"><h2>主要联系人</h2><Link to="/app/passengers">修改</Link></div>
      <div className="receipt checkout-contact"><div><span>姓名</span><b>{state.booking.passenger.name}</b></div><div><span>联系电话</span><b>{state.booking.passenger.phone}</b></div><div><span>沟通语言</span><b>{state.booking.passenger.language}</b></div></div>
      {state.booking?.assistance?.operationalReviewStatus !== "未提出" && (
        <p className="notice">
          待确认项会由运营人员审核；提交不代表设备、无障碍车辆、人员协助或费用已经确认。
        </p>
      )}
      <section className="cancellation-summary"><header><span>取消规则</span><b>按日本时间计算</b></header><div><span><b>3天前</b><small>退还 100%</small></span><span><b>2～3天</b><small>退还 50%</small></span><span><b>前1天起</b><small>原则不退</small></span></div><p>取消以系统成功受理时间为准；依法应退款、解除或补偿的情形不受排除。</p></section>
      <form className="form checkout-consent" onSubmit={submit}>
        <label className="check">
          <input required type="checkbox" /> <span>我已阅读并理解上述取消退款规则</span>
        </label>
        <label className="check">
          <input required type="checkbox" /> <span>我同意预订条款及隐私政策</span>
        </label>
        <button className="button full">
          确认并进入提交页
        </button>
      </form>
    </>
  );
}
export function Payment() {
  const { state, services, departures, updateBooking } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [draftStatus,setDraftStatus]=useState('');
  const [draftKey]=useState(()=>crypto.randomUUID());
  const production=appConfig.runtimeMode==='production';
  const selectedDeparture=departures.find(item=>item.id===state.booking?.departureId);
  const seatImpact=(state.booking?.adults??0)+(state.booking?.children??0)+(state.booking?.infants??0);
  const payableTotal=seatOrderTotal(selectedDeparture?.price,seatImpact);
  const nav = useNavigate();
  const paymentReady=Boolean(state.booking?.passenger&&selectedDeparture&&payableTotal!=null&&state.booking?.acceptedCancellation&&state.booking?.acceptedTerms);
  const saveDraft=async()=>{if(!services||!state.booking?.passenger||!state.booking.assistance||!selectedDeparture||!state.booking.acceptedCancellation||!state.booking.acceptedTerms)return;setSubmitting(true);setDraftStatus('正在安全保存订单草稿…');const result=await services.saveOwnBookingDraft({departureId:selectedDeparture.id,adults:state.booking.adults,children:state.booking.children,infants:state.booking.infants,passengerPrivate:state.booking.passenger as unknown as Record<string,unknown>,assistancePrivate:state.booking.assistance as unknown as Record<string,unknown>,reviewStatus:state.booking.assistance.operationalReviewStatus,acceptedCancellation:true,acceptedTerms:true,idempotencyKey:draftKey});setSubmitting(false);if(result.id){updateBooking({draftId:result.id});setDraftStatus(`订单草稿已保存：${result.id}。尚未发起支付，也未占用正式库存。`)}else setDraftStatus(result.error??'订单草稿保存失败')};
  return (
    <>
      <BookingSteps current={4}/>
      <AppTitle eyebrow="第 4 步，共 4 步" title="支付前确认" text="本阶段停在支付前：先保存可恢复的订单草稿，不会发起扣款。" />
      {!paymentReady&&<div className="notice" role="alert">订单的班次、价格、乘客资料或条款确认不完整。请返回重新核对，系统不会创建付款。</div>}
      <div className="receipt"><div><span>订单金额</span><b>{payableTotal==null?'待确认':`¥${payableTotal}`}</b></div></div>
      <div className="notice">
        {production?'支付功能尚未开放。本页只安全保存订单草稿；在线支付不会创建付款请求，银行转账也不会生成收款指示。':'支付功能尚未开放。本页只把草稿保存到隔离测试数据库；Stripe 不会创建 Payment Intent，银行转账也不会生成收款指示。'}
      </div>
      <button className="button full" disabled={!services?.ordersAvailable||!paymentReady||submitting||Boolean(state.booking?.draftId)} onClick={()=>void saveDraft()}>{state.booking?.draftId?'订单草稿已保存':submitting?'正在保存…':'保存订单草稿（不扣款）'}</button>
      {draftStatus&&<p className="notice" role="status">{draftStatus}</p>}
      {state.booking?.draftId&&<Link className="button secondary full" to="/app/orders">查看账户中的订单草稿</Link>}
      <button className="text-link" onClick={() => nav(-1)}>
        返回修改
      </button>
    </>
  );
}
export function PaymentResult() {
  const location = useLocation();
  const nav = useNavigate();
  const { state, services } = useApp();
  const query = new URLSearchParams(location.search);
  const id =
    (location.state as null | { id?: string })?.id ??
    query.get("order_id") ??
    undefined;
  const order = state.orders.find((item) => item.id === id);
  const [seconds, setSeconds] = useState(3);
  const [remoteOrder, setRemoteOrder] = useState<{
    id: string;
    status: string;
  } | null>(null);
  const manual = query.get("manual") === "1";
  useEffect(() => {
    if (!services || !id) return;
    let active = true;
    let attempts = 0;
    const check = async () => {
      const result = await services.loadOwnOrders();
      const found = (
        result.data as Array<{ id: string; status: string }>
      ).find((item) => item.id === id) ?? null;
      if (active) setRemoteOrder(found);
      attempts += 1;
      if (
        active &&
        found &&
        !["paid", "payment_review", "refunded", "cancelled"].includes(
          found.status,
        ) &&
        attempts < 10
      )
        window.setTimeout(check, 1000);
    };
    void check();
    return () => {
      active = false;
    };
  }, [services, id]);
  useEffect(() => {
    if (!id || services) return;
    const redirect = window.setTimeout(
      () => nav(`/app/orders/${id}`, { replace: true }),
      3000,
    );
    const tick = window.setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => {
      window.clearTimeout(redirect);
      window.clearInterval(tick);
    };
  }, [id, nav, services]);
  if (id && services) {
    const paid = remoteOrder?.status === "paid";
    const pending =
      manual ||
      remoteOrder?.status === "pending_manual_review" ||
      remoteOrder?.status === "pending_payment";
    return (
      <div className="result">
        <div className="result-icon" aria-hidden="true">
          {paid ? "✓" : "…"}
        </div>
        <AppTitle
          eyebrow="支付状态"
          title={paid ? "支付成功" : pending ? "等待付款确认" : "正在确认订单"}
          text={
            paid
              ? "订单已支付，并已加入“我的账户／我的行程”。"
              : manual
                ? "银行转账申请已记录，到账后由工作人员确认。"
                : "正在等待服务端确认支付结果，请勿重复付款。"
          }
        />
        <div className="receipt">
          <div>
            <span>订单编号</span>
            <b>{id}</b>
          </div>
          <div>
            <span>订单状态</span>
            <b>{paid ? "已支付" : pending ? "待确认" : "确认中"}</b>
          </div>
        </div>
        <Link className="button full" to={`/app/orders/${id}`}>
          查看我的订单
        </Link>
      </div>
    );
  }
  return id ? (
    <div className="result">
      <div className="result-icon" aria-hidden="true">
        ✓
      </div>
      <AppTitle
        eyebrow="开发模拟订购状态"
        title="订购成功"
        text="订单已加入“我的账户／我的行程”。未发生真实扣款。"
      />
      <div className="receipt">
        <div>
          <span>订单编号</span>
          <b>{id}</b>
        </div>
        <div>
          <span>订单状态</span>
          <b>已确认（开发模拟）</b>
        </div>
        <div>
          <span>特殊乘车需求</span>
          <b>{order?.assistance.operationalReviewStatus ?? "未提出"}</b>
        </div>
      </div>
      {order?.assistance.operationalReviewStatus !== "未提出" && (
        <p className="notice">
          需求已随订单提交，确认结果将在订单详情中更新；当前不代表设备或服务已提供。
        </p>
      )}
      <p className="countdown" aria-live="polite">
        将在 {seconds} 秒后自动前往本订单详情
      </p>
      <Link className="button full" to={`/app/orders/${id}`}>
        立即查看我的行程
      </Link>
    </div>
  ) : (
    <>
      <AppTitle
        eyebrow="支付状态"
        title="暂时无法确认支付"
        text="支付服务尚未连接，未创建订单，也未扣款。"
      />
      <Link className="button full" to="/app/orders">
        返回我的账户
      </Link>
    </>
  );
}
export function Orders() {
  const { state, services } = useApp();
  const [remote, setRemote] = useState<{
    loading: boolean;
    error: string | null;
    rows: Array<{
      id: string;
      departure_id: string;
      seat_count: number;
      status: string;
    }>;
  }>({ loading: Boolean(services), error: null, rows: [] });
  const [drafts,setDrafts]=useState<Array<{id:string;departure_id:string;adults:number;children:number;infants:number;seat_impact:number;operational_review_status:string;status:string;created_at:string;updated_at:string;expires_at:string}>>([]);
  const [draftNotice,setDraftNotice]=useState('');
  useEffect(() => {
    if (services)
      void Promise.all([services.loadOwnOrders(),services.loadOwnDrafts()])
        .then(([result,draftResult]) => {
          setDrafts(draftResult.data as typeof drafts);
          setRemote({
            loading: false,
            error: result.error??draftResult.error,
            rows: result.data as Array<{
              id: string;
              departure_id: string;
              seat_count: number;
              status: string;
            }>,
          });
        });
  }, [services]);
  return (
    <>
      <AppTitle eyebrow="行程与座位订单" title="我的行程" />
      {state.tripRoom && (
        <Link className="my-trip-banner" to="/app/my-trip">
          <span>开发种子行程</span>
          <b>京都与奈良</b>
          <small>打开本车行程房间 →</small>
        </Link>
      )}
      <h2>订单</h2>
      {services&&drafts.length>0&&<section className="draft-list"><h2>支付前订单草稿</h2>{drafts.map(draft=><article className="order-card" key={draft.id}><b>{draft.status==='expired'?'草稿已过期':draft.status==='cancelled'?'草稿已放弃':'订单草稿 · 尚未支付'}</b><span>{draft.adults} 成人／{draft.children} 儿童／{draft.infants} 婴儿 · 配车人数 {draft.seat_impact}</span><small>最后更新：{new Date(draft.updated_at).toLocaleString('zh-CN')} · 辅助需求审核：{draft.operational_review_status}</small>{draft.status==='payment_not_started'||draft.status==='pending_manual_review'?<div className="inline-actions"><Link className="text-link" to="/app/checkout">继续填写</Link><button type="button" className="text-button" onClick={()=>void services.abandonOwnDraft(draft.id).then(result=>{setDraftNotice(result.error??'草稿已放弃，不再进入结账流程。');if(result.ok)setDrafts(rows=>rows.map(row=>row.id===draft.id?{...row,status:'cancelled'}:row))})}>放弃草稿</button></div>:null}</article>)}</section>}
      {draftNotice&&<p className="notice" role="status">{draftNotice}</p>}
      {services ? (
        remote.loading ? (
          <Empty title="正在读取订单" text="请稍候。" />
        ) : remote.error ? (
          <Empty title="订单暂时不可用" text={remote.error} />
        ) : remote.rows.length ? (
          remote.rows.map((o) => (
            <article className="order-card" key={o.id}>
              <b>本人订单</b>
              <span>
                {o.id} · {o.seat_count} 个座位
              </span>
              <small>{o.status}</small>
            </article>
          ))
        ) : (
          <Empty title="暂无订单" text="当前账户没有可见订单。" />
        )
      ) : appConfig.runtimeMode === "production" ? (
        <Empty
          title="订单服务不可用"
          text="正式账户服务未配置，不会加载演示订单。"
        />
      ) : state.orders.length ? (
        state.orders.map((o) => (
          <Link
            className="order-card"
            key={o.id}
            to={`/app/orders/${o.id}`}
          >
            <b>{travelRepository.getTrip(o.tripSlug)?.shortTitle}</b>
            <span>
              {o.id} · {o.guests} 个座位
            </span>
            <small>{o.status}</small>
          </Link>
        ))
      ) : (
        <Empty title="暂无订单" text="完成真实支付后，订单会显示在这里。" />
      )}
    </>
  );
}
export function OrderDetail() {
  const { state, services, departures } = useApp();
  const { id } = useParams();
  const [remoteOrder,setRemoteOrder]=useState<{id:string;departure_id:string;seat_count:number;status:string;amount:number|null;currency:string}|null>(null);
  const [remoteFulfilment,setRemoteFulfilment]=useState<{departs_at:string|null;meeting_name:string|null;meeting_address:string|null;map_lat:number|string|null;map_lng:number|string|null}|null>(null);
  const [remoteResolved,setRemoteResolved]=useState(!services);
  useEffect(()=>{if(!services||!id)return;let active=true;void Promise.all([services.loadOwnOrders(),services.loadOwnOrderFulfilment(id)]).then(([result,fulfilment])=>{if(!active)return;setRemoteOrder((result.data as Array<{id:string;departure_id:string;seat_count:number;status:string;amount:number|null;currency:string}>).find(item=>item.id===id)??null);setRemoteFulfilment(fulfilment as typeof remoteFulfilment);setRemoteResolved(true)});return()=>{active=false}},[services,id]);
  if(services){
    if(!remoteResolved)return <Empty title="正在读取订单" text="请稍候，正在安全读取本人订单。"/>;
    if(!remoteOrder)return <Empty title="未找到订单" text="该订单不存在，或当前账户无权查看。"/>;
    const dep=departures.find(item=>item.id===remoteOrder.departure_id);const trip=travelRepository.getTrip(dep?.tripSlug??'');
    const departureLabel=remoteFulfilment?.departs_at?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(new Date(remoteFulfilment.departs_at)):dep?.dateLabel??'待确认';
    const lat=remoteFulfilment?.map_lat==null?null:Number(remoteFulfilment.map_lat);const lng=remoteFulfilment?.map_lng==null?null:Number(remoteFulfilment.map_lng);const navigationUrl=Number.isFinite(lat)&&Number.isFinite(lng)?new GoogleMapsAdapter(undefined).navigationUrl({lat:lat!,lng:lng!}):null;
    return <><AppTitle eyebrow="我的账户／我的行程" title={trip?.shortTitle??'行程订单'}/><div className="status">订单状态：{remoteOrder.status}</div><div className="receipt"><div><span>订单编号</span><b>{remoteOrder.id}</b></div><div><span>出发时间</span><b>{departureLabel}</b></div><div><span>集合地点</span><b>{remoteFulfilment?.meeting_name??'待确认'}</b></div><div><span>集合地址</span><b>{remoteFulfilment?.meeting_address??'待确认'}</b></div><div><span>座位数量</span><b>{remoteOrder.seat_count} 席</b></div><div><span>支付金额</span><b>{remoteOrder.amount==null?'待确认':`¥${remoteOrder.amount}`}</b></div></div>{navigationUrl?<a className="button full" href={navigationUrl} target="_blank" rel="noreferrer">打开地图导航</a>:<p className="notice">地图位置确认后，将在此提供导航入口。</p>}<Link className="button full" to={`/app/boarding-pass/${remoteOrder.id}`}>查看登车凭证</Link><Link className="button secondary full" to="/app/orders">返回我的账户</Link></>;
  }
  const o = state.orders.find((x) => x.id === id);
  if (!o)
    return <Empty title="未找到订单" text="该订单不存在或未保存在当前会话。" />;
  const trip = travelRepository.getTrip(o.tripSlug);
  const dep = departures.find((item) => item.id === o.departureId);
  const pending = "待确认；确认后将在本订单详情和行程房间更新";
  const assistance = describeAssistance(o.assistance);
  const navigationUrl = new GoogleMapsAdapter(undefined).navigationUrl(
    dep?.meetingCoordinates ?? null,
  );
  return (
    <>
      <AppTitle
        eyebrow="我的账户／我的行程"
        title={trip?.shortTitle ?? "行程"}
      />
      <div className="status">订单状态：{o.status}</div>
      <div className="receipt">
        <div>
          <span>路线／产品</span>
          <b>{trip?.title ?? "待确认"}</b>
        </div>
        <div>
          <span>订单编号</span>
          <b>{o.id}</b>
        </div>
        <div>
          <span>Departure 日期</span>
          <b>{dep?.dateLabel ?? pending}</b>
        </div>
        <div>
          <span>出发时间</span>
          <b>{dep?.departureTime ?? pending}</b>
        </div>
        <div>
          <span>集合地点</span>
          <b>{dep?.meetingPointName ?? pending}</b>
        </div>
        <div>
          <span>完整地址</span>
          <b>{dep?.meetingAddress ?? pending}</b>
        </div>
        <div>
          <span>公共交通到达</span>
          <b>{dep?.arrivalInstructions.transit ?? pending}</b>
        </div>
        <div>
          <span>步行到达</span>
          <b>{dep?.arrivalInstructions.walking ?? pending}</b>
        </div>
        <div>
          <span>驾车到达</span>
          <b>{dep?.arrivalInstructions.driving ?? pending}</b>
        </div>
        <div>
          <span>已购席数</span>
          <b>{o.guests} 席</b>
        </div>
        <div>
          <span>乘客摘要</span>
          <b>{o.passengerSummary}</b>
        </div>
        <div>
          <span>儿童年龄</span>
          <b>
            {o.assistance.childSeat.children.length
              ? o.assistance.childSeat.children
                  .map((child, index) => `儿童 ${index + 1}：${child.age} 岁`)
                  .join("；")
              : "无儿童资料"}
          </b>
        </div>
        <div>
          <span>儿童安全座椅状态</span>
          <b>{describeChildSeat(o.assistance.childSeat)}</b>
        </div>
        <div>
          <span>特殊乘车需求</span>
          <b>
            {assistance.map((item) => (
              <span className="summary-line" key={item}>
                {item}
              </span>
            ))}
          </b>
        </div>
        <div>
          <span>运营审核状态</span>
          <b>{o.assistance.operationalReviewStatus}</b>
        </div>
        <div>
          <span>支付状态</span>
          <b>{o.paymentStatus}；真实支付未连接</b>
        </div>
        <div>
          <span>金额状态</span>
          <b>
            {o.amount == null
              ? "待确认；正式价格开放后在此更新"
              : `¥${o.amount}`}
          </b>
        </div>
        <div>
          <span>车辆</span>
          <b>{pending}</b>
        </div>
        <div>
          <span>司机／司导</span>
          <b>{pending}</b>
        </div>
        <div>
          <span>Boarding Pass</span>
          <b>尚未生成；订单进入待登车状态后开放</b>
        </div>
      </div>
      {o.assistance.operationalReviewStatus !== "未提出" && (
        <p className="notice">
          确认中或需人工联系的需求尚未承诺提供；运营结果和可能费用会在本订单中更新。
        </p>
      )}
      <section className="meeting-reference">
        <h2>集合地点参考</h2>
        {dep?.meetingPhoto ? (
          <>
            <img src={dep.meetingPhoto} alt="集合地点开发占位参考图" />
            <p className="notice">
              开发占位图，不是实际集合地点照片。正式照片确认后将在此更新。
            </p>
          </>
        ) : (
          <p>{pending}</p>
        )}
        <div className="demo-map" role="img" aria-label="集合地点导航状态">
          <span className="map-label">
            {navigationUrl
              ? "集合点坐标已确认，可使用外部步行导航"
              : "集合点坐标待确认；不显示虚构地图"}
          </span>
        </div>
        {navigationUrl ? (
          <a className="button secondary full" href={navigationUrl} target="_blank" rel="noreferrer">
            打开 Google Maps 步行导航
          </a>
        ) : (
          <button className="button secondary full" disabled>步行导航待集合点确认</button>
        )}
      </section>
      {state.tripRoom ? (
        <Link className="button full room-link" to="/app/my-trip/room">
          查看 Trip Room／Vehicle Group 只读预览
        </Link>
      ) : (
        <p className="notice">车辆群组待分配，分配后将在此提供行程房间入口。</p>
      )}
    </>
  );
}
export function BoardingPass() {
  const { state,services } = useApp();
  const { id } = useParams();
  const [credential,setCredential]=useState<{token:string;expiresAt:string;vehicleGroupId:string}|null>(null);const [loading,setLoading]=useState(false);const [notice,setNotice]=useState('');
  if(services&&id){const issue=async()=>{setLoading(true);const result=await services.issueBoardingCredential(id);setLoading(false);if(!result){setNotice('登车凭证尚不可签发：请确认订单已支付、本车已分配且行程房间已开放。');return}setCredential(result);setNotice('新凭证已签发；此前未使用的凭证已经撤销。');};return <div className="pass"><h1>安全登车凭证</h1>{credential?<><div className="boarding-code" role="img" aria-label="安全登车代码"><b>JT BOARDING</b><code>{credential.token}</code></div><p>有效至：{new Date(credential.expiresAt).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'})}</p><p className="privacy">该不透明凭证不包含订单号、邮箱、电话或乘客资料。只向本车工作人员出示，不要发送到公开群组。</p></>:<p>行程房间开放后，可生成一次性安全凭证供本车工作人员核验。</p>}<button className="button full" type="button" disabled={loading} onClick={()=>void issue()}>{loading?'正在安全签发…':credential?'重新签发并撤销旧凭证':'生成登车凭证'}</button>{notice&&<p className="notice" role="status">{notice}</p>}</div>}
  const o = state.orders.find((x) => x.id === id);
  return o ? (
    <div className="pass">
      <h1>登车凭证</h1>
      <p>状态：{o.status}</p>
      <p>{appConfig.runtimeMode === "production" ? "安全登车凭证尚未由服务端签发。" : "当前为本地测试订单，不生成可用于正式登车的二维码。"}</p>
      <p className="privacy">正式二维码仅包含可撤销的不透明令牌，不包含订单号、邮箱、电话或乘客资料。</p>
    </div>
  ) : (
    <Empty
      title="暂无登车凭证"
      text="只有已确认且待登车的订单才会生成有效凭证。"
    />
  );
}
export function AppRewards() {
  const { state } = useApp();
  const next = nextTier(state.completedTrips);
  return (
    <>
      <AppTitle
        eyebrow="会员与推荐"
        title={tierFor(state.completedTrips).name}
      />
      <div className="progress">
        <b>{state.completedTrips} 次已完成行程</b>
        <span>
          {next
            ? `再完成 ${next.trips - state.completedTrips} 次升级为${next.name}`
            : "可申请达人审核"}
        </span>
      </div>
      <Empty
        title="暂无奖励记录"
        text="被推荐人完成有效行程后，奖励才会发放。"
      />
    </>
  );
}
export function Referral() {
  return (
    <>
      <AppTitle
        eyebrow="仅限直接推荐"
        title="邀请朋友"
        text="不设置下级层级，旅行金不可提现。"
      />
      <div className="notice">推荐功能尚未连接。</div>
    </>
  );
}
export function Profile() {
  const { state, setUi, reset, services } = useApp();
  const nav = useNavigate();
  const [profile,setProfile]=useState({displayName:'',phone:'',emergencyName:'',emergencyPhone:''});
  const [profileState,setProfileState]=useState<'loading'|'ready'|'saving'|'unavailable'>(services?'loading':'unavailable');
  const [profileNotice,setProfileNotice]=useState('');
  useEffect(()=>{let active=true;if(!services)return()=>{active=false};void services.loadOwnAccountProfile().then(result=>{if(!active)return;if(result.error){setProfileNotice(result.error);setProfileState('unavailable');return}if(result.data)setProfile({displayName:result.data.display_name,phone:result.data.phone,emergencyName:result.data.emergency_name,emergencyPhone:result.data.emergency_phone});setProfileState('ready')});return()=>{active=false}},[services]);
  const saveProfile=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!services)return;const form=new FormData(event.currentTarget);setProfileState('saving');const result=await services.updateOwnAccountProfile({displayName:String(form.get('displayName')),phone:String(form.get('phone')),emergencyName:String(form.get('emergencyName')),emergencyPhone:String(form.get('emergencyPhone')),acceptedTerms:Boolean(form.get('terms')),acceptedPrivacy:Boolean(form.get('privacy'))});setProfileState('ready');setProfileNotice(result.error??'本人资料已安全保存。');if(result.ok)setProfile({displayName:String(form.get('displayName')),phone:String(form.get('phone')),emergencyName:String(form.get('emergencyName')),emergencyPhone:String(form.get('emergencyPhone'))})};
  const logout = async () => {
    if (services) await services.signOut();
    reset();
    nav("/app/login");
  };
  return (
    <>
      <AppTitle eyebrow="账户与偏好" title="我的" />
      <div className="receipt">
        <div>
          <span>账户状态</span>
          <b>
            {services
              ? state.user
                ? "已登录"
                : "未登录"
              : backend.connected
                ? "本地开发账户"
                : "账户服务不可用"}
          </b>
        </div>
        <div>
          <span>电子邮箱</span>
          <b>{state.user?.email ?? "未登录"}</b>
        </div>
        <div>
          <span>语言</span>
          <b>简体中文</b>
        </div>
        <div>
          <span>运行模式</span>
          <b>
            {appConfig.runtimeMode === "production"
              ? "正式环境"
              : appConfig.runtimeMode === "development"
                ? "开发环境"
                : "演示环境"}
          </b>
        </div>
      </div>
      <section className="form" aria-labelledby="account-center-title">
        <h2 id="account-center-title">账户中心</h2>
        <p className="privacy">订单草稿、已确认订单、儿童座椅与轮椅审核状态统一在订单中查看；车辆群消息仅在已分配的行程中开放。</p>
        <div className="inline-actions">
          <Link className="button" to="/app/orders">订单与辅助需求</Link>
          <Link className="button secondary" to="/app/my-trip/room">行程消息</Link>
        </div>
      </section>
      {services&&<form className="form" onSubmit={saveProfile}><h2>本人乘客资料</h2><p className="privacy">联系方式和紧急联系人保存在私密资料表，不会显示在公开账户资料、普通乘客群或运营列表中。</p><label>显示名<input required name="displayName" maxLength={80} value={profile.displayName} onChange={event=>setProfile({...profile,displayName:event.target.value})}/></label><label>必要联系电话<input required name="phone" type="tel" maxLength={40} value={profile.phone} onChange={event=>setProfile({...profile,phone:event.target.value})}/></label><label>紧急联系人姓名<input required name="emergencyName" maxLength={80} value={profile.emergencyName} onChange={event=>setProfile({...profile,emergencyName:event.target.value})}/></label><label>紧急联系人电话<input required name="emergencyPhone" type="tel" maxLength={40} value={profile.emergencyPhone} onChange={event=>setProfile({...profile,emergencyPhone:event.target.value})}/></label><label className="check"><input required name="terms" type="checkbox"/> 同意 <Link to="/terms">服务条款</Link></label><label className="check"><input required name="privacy" type="checkbox"/> 同意 <Link to="/privacy">隐私政策</Link></label><button className="button full" disabled={profileState==='loading'||profileState==='saving'}>{profileState==='loading'?'正在读取资料…':profileState==='saving'?'正在安全保存…':'保存本人资料'}</button>{profileNotice&&<p className="notice" role="status">{profileNotice}</p>}</form>}
      <LanguageSelect />
      <label className="check">
        <input
          type="checkbox"
          checked={state.ui.compact}
          onChange={(e) => setUi({ compact: e.target.checked })}
        />{" "}
        紧凑显示
      </label>
      {services && state.user ? (
        <button className="button danger-button full" onClick={logout}>
          退出账户
        </button>
      ) : (
        <button
          className="button danger-button full"
          onClick={() => {
            reset();
            nav("/app/login");
          }}
        >
          重置界面偏好
        </button>
      )}
      <p className="privacy">
        退出会清除 Supabase 浏览器会话；订单、乘客资料和位置不会写入应用
        localStorage。
      </p>
    </>
  );
}
export function NotFound() {
  const location = useLocation();
  return (
    <main className="empty">
      <h1>页面不存在</h1>
      <p>无法找到：{location.pathname}</p>
      <Link to="/">返回首页</Link>
    </main>
  );
}
