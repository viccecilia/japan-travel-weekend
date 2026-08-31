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
import { Elements } from "@stripe/react-stripe-js";
import { stripeTestClient } from "../shared/integrations/stripeClient";
import { StripePaymentForm } from "./StripePaymentForm";
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
      {compact ? <span aria-hidden="true">文</span> : "语言"}
      <select aria-label="语言" value="zh-CN" onChange={() => {}}>
        <option value="zh-CN">{compact ? "简中" : "简体中文"}</option>
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
  return (
    <div className="app-stage">
      <div className="app-frame">
        <header className="app-top">
          <Link className="app-back" to="/" aria-label="返回网站">
            ←<span>网站</span>
          </Link>
          <b className="app-brand"><i>JT</i><span>Japan Travel Weekend</span></b>
          <LanguageSelect compact />
        </header>
        <main className="app-content">{children}</main>
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
        <LanguageSelect />
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
  return (
    <div className="fulfillment-home">
      <AppTitle
        eyebrow="大阪出发 · 按席预订"
        title="探索关西，遇见同行者"
        text="一个人也能参加 · 无需日语"
      />
      <div className="app-stats">
        <article>
          <small>会员等级</small>
          <b>{tierFor(state.completedTrips).name}</b>
        </article>
        <article>
          <small>已完成行程</small>
          <b>{state.completedTrips}</b>
        </article>
        <article>
          <small>旅行金</small>
          <b>¥{state.credits}</b>
        </article>
      </div>
      {state.tripRoom && (
        <Link className="my-trip-banner" to="/app/my-trip">
          <span>下一项行动 · 行程已确认</span>
          <b>明天 · 京都与奈良</b>
          <small>08:00 大阪梅田集合 · 查看车辆与集合信息 →</small>
        </Link>
      )}
      <h2>可选出发班次</h2>
      {!departuresResolved ? (
        <Empty title="正在读取可售班次" text="请稍候，正在同步最新出发信息。" />
      ) : departuresError ? (
        <Empty title="暂时无法读取班次" text="请稍后刷新页面重试。" />
      ) : deps.length ? (
        <div className="app-list">
          {deps.map((departure) => {
            const trip = travelRepository.getTrip(departure.tripSlug);
            if (!trip) return null;
            return (
              <article className="departure-card" key={departure.id}>
                <img src={trip.heroImage} alt={`${trip.shortTitle}路线风景`} />
                <div>
                  <small>{departure.weekend}</small>
                  <h3>{trip.shortTitle}</h3>
                  <b>{departure.dateLabel}</b>
                  <span>{departure.status}</span>
                  <p>
                    每席 ¥{departure.price}
                    {departure.availableSeats == null
                      ? ""
                      : ` · 可售 ${departure.availableSeats} 席`}
                  </p>
                  <Link
                    className="text-link"
                    to={`/app/booking/${trip.slug}`}
                  >
                    选择座位 →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="暂无开放班次"
          text="正式环境不会自动生成日期、价格、余位或即将出发的行程。"
        />
      )}
      <Link className="private-app-link" to="/app/private-groups">
        <b>需要私人团体出行？</b>
        <span>企业、学校、社团、亲友团体 →</span>
      </Link>
    </div>
  );
}
export function AppTrips() {
  return (
    <>
      <AppTitle
        eyebrow="路线预告"
        title="下一次想去哪里？"
        text="路线可浏览，日期、价格和余位以正式开放信息为准。"
      />
      <div className="app-list">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} app />
        ))}
      </div>
    </>
  );
}
export function AppTrip() {
  const t = travelRepository.getTrip(useParams().slug || "");
  if (!t) return <Empty title="未找到行程" />;
  return (
    <>
      <img
        className="app-hero"
        src={t.heroImage}
        alt={`${t.shortTitle}路线风景`}
      />
      <AppTitle
        eyebrow={`${t.region} · ${t.duration}`}
        title={t.shortTitle}
        text={t.summary}
      />
      <div className="chips">
        {t.categories.map((c) => (
          <span key={c}>{c}</span>
        ))}
        <span>预订未开放</span>
      </div>
      <h2>行程亮点</h2>
      <ul className="check-list">
        {t.highlights.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <Link className="button full" to={`/app/booking/${t.slug}`}>
        查看出发班次
      </Link>
    </>
  );
}
export function BookingPage() {
  const t = travelRepository.getTrip(useParams().slug || "") ?? trips[0];
  const { state, updateBooking, departures } = useApp();
  const deps = departures.filter((d) => d.tripSlug === t.slug);
  const nav = useNavigate();
  const sellable = deps.filter((departure) => departure.price != null && departure.availableSeats !== 0);
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
    });
    nav("/app/passengers");
  };
  return (
    <>
      <AppTitle
        eyebrow="第 1 步，共 4 步 · 购买座位"
        title="选择出发班次"
        text={t.title}
      />
      {deps.length ? (
        <form className="form" onSubmit={submit}>
          <label>
            出发班次
            <select required name="departure" disabled={!sellable.length}>
              {deps.map((d) => (
                <option value={d.id} key={d.id} disabled={d.price==null||d.availableSeats===0}>
                  {d.dateLabel} · {d.price==null?'价格待公布':`每席 ¥${d.price}`} · {d.status}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              成人座位
              <input
                min="1"
                max="6"
                name="adults"
                type="number"
                defaultValue={state.booking?.adults ?? 1}
              />
            </label>
            <label>
              儿童座位
              <input
                min="0"
                max="6"
                name="children"
                type="number"
                defaultValue={state.booking?.children ?? 0}
              />
            </label>
          </div>
          <p>车辆将在运营阶段按顺序装载分配，不在购买时指定。</p>
          {!sellable.length&&<p className="notice" role="status">该班次价格或库存尚未开放，目前不能进入结账。开放后将在此显示最终每席价格。</p>}
          <button className="button full" disabled={!sellable.length}>继续填写乘客信息</button>
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
      <AppTitle
        eyebrow="第 2 步，共 4 步"
        title="乘客资料与特殊乘车需求"
        text="只收集履约所需信息，不收集无关健康诊断；资料仅保留在当前会话。"
      />
      <form className="form" onSubmit={submit}>
        <label>
          主要乘客姓名
          <input required name="name" />
        </label>
        <label>
          国籍
          <input required name="nationality" />
        </label>
        <label>
          首选沟通语言
          <select name="language">
            <option>简体中文</option>
          </select>
        </label>
        <label>
          电话
          <input required name="phone" type="tel" />
        </label>
        <label>
          紧急联系人
          <input required name="emergency" />
        </label>
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
        <label>
          饮食需求
          <textarea name="dietary" placeholder="选填" />
        </label>
        <label>
          订单备注
          <textarea name="notes" placeholder="选填" />
        </label>
        <button className="button full">核对订单</button>
      </form>
    </>
  );
}
export function Checkout() {
  const { state, updateBooking, departures } = useApp();
  const nav = useNavigate();
  const dep = departures.find((item) => item.id === state.booking?.departureId);
  const guests = (state.booking?.adults ?? 0) + (state.booking?.children ?? 0);
  const total = seatOrderTotal(dep?.price, guests);
  const summaries = describeAssistance(state.booking?.assistance);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateBooking({ acceptedCancellation: true, acceptedTerms: true });
    nav("/app/payment");
  };
  if(!state.booking?.passenger||!dep||total==null||guests<1)return <><AppTitle eyebrow="订单资料不完整" title="请先选择有效班次" text="只有价格、库存和乘客资料均已确认后，才能进入结账。"/><Link className="button full" to={`/app/booking/${state.booking?.tripSlug??'kyoto-nara-classic'}`}>返回选择出发班次</Link></>;
  return (
    <>
      <AppTitle eyebrow="第 3 步，共 4 步" title="核对订单" />
      <div className="receipt">
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
          <span>成人／儿童</span>
          <b>
            {state.booking?.adults ?? 0} 名成人／{state.booking?.children ?? 0}{" "}
            名儿童
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
          <b>{total == null ? "待公布" : `¥${total}`}</b>
        </div>
      </div>
      {state.booking?.assistance?.operationalReviewStatus !== "未提出" && (
        <p className="notice">
          待确认项会由运营人员审核；提交不代表设备、无障碍车辆、人员协助或费用已经确认。
        </p>
      )}
      <form className="form" onSubmit={submit}>
        <label className="check">
          <input required type="checkbox" /> 我已阅读取消规则（日本时间：第3天17:00前全额退款，至第2天17:00前退款50%，之后不退款）
        </label>
        <label className="check">
          <input required type="checkbox" /> 我同意预订条款
        </label>
        <button className="button full">
          选择支付方式
        </button>
      </form>
    </>
  );
}
const methods = [
  "信用卡",
  "Apple Pay / Google Pay",
  "PayPay",
  "银行转账",
  "PayPal",
];
const checkoutFailureMessage=(code:string)=>({unauthorized:'账户会话已过期，请重新登录。',invalid_request:'订单资料不完整，请返回检查。',inventory_unavailable:'当前余位不足，请返回重新选择座位。',price_unavailable:'该班次价格尚未开放，暂时不能付款。',card_payment_unavailable:'信用卡支付服务暂时不可用。',manual_payment_unavailable:'银行转账申请暂时不可用。',origin_not_allowed:'当前页面来源未获授权。',network_error:'无法连接结账服务，请检查网络后重试。'}[code]??`结账失败（${code}），请稍后重试。`);
export function Payment() {
  const { state, addOrder, services, departures } = useApp();
  const availableMethods = services ? ["信用卡", "银行转账"] : methods;
  const [method, setMethod] = useState(availableMethods[0]);
  const [remoteStatus, setRemoteStatus] = useState("");
  const [remoteCheckout, setRemoteCheckout] = useState<{
    orderId: string;
    clientSecret: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const production = appConfig.runtimeMode === "production";
  const selectedDeparture=departures.find(item=>item.id===state.booking?.departureId);
  const payableTotal=seatOrderTotal(selectedDeparture?.price,(state.booking?.adults??0)+(state.booking?.children??0));
  const nav = useNavigate();
  const paymentReady=Boolean(state.booking?.passenger&&selectedDeparture&&payableTotal!=null&&state.booking?.acceptedCancellation&&state.booking?.acceptedTerms);
  const simulate = () => {
    if(!paymentReady||payableTotal==null)return;
    const id = `DEV-${Date.now().toString().slice(-6)}`;
    const guests =
      (state.booking?.adults ?? 1) + (state.booking?.children ?? 0);
    addOrder({
      id,
      tripSlug: state.booking?.tripSlug ?? trips[0].slug,
      departureId: state.booking?.departureId ?? "",
      guests,
      passengerSummary: state.booking?.passenger?.name
        ? `${state.booking.passenger.name}等，共 ${guests} 人`
        : `共 ${guests} 人，乘客资料待补充`,
      assistance: state.booking?.assistance ?? emptyAssistance(),
      status: "已确认",
      paymentMethod: `${method}（开发模拟）`,
      paymentStatus: "开发模拟完成",
      amount: payableTotal,
    });
    nav("/app/payment-result", { state: { id } });
  };
  const createTestCheckout = async () => {
    if (!services || !state.booking?.departureId||!paymentReady) return;
    if (method !== "银行转账" && !stripeTestClient) {
      setRemoteStatus(
        production
          ? "在线支付配置尚未完成，请稍后再试。"
          : "Stripe 测试支付配置尚未完成。",
      );
      return;
    }
    setSubmitting(true);
    setRemoteStatus("正在提交测试订单…");
    let result;
    try {
      result = await services.createCheckout({
        departureId: state.booking.departureId,
        seats: (state.booking.adults ?? 0) + (state.booking.children ?? 0),
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: method === "银行转账" ? "bank_transfer" : "card",
      });
    } finally {
      setSubmitting(false);
    }
    if (result?.status === "pending_manual_review") {
      nav(
        `/app/payment-result?order_id=${encodeURIComponent(result.orderId)}&manual=1`,
      );
      return;
    }
    if (result?.status === "requires_payment_action") {
      setRemoteCheckout({
        orderId: result.orderId,
        clientSecret: result.clientSecret,
      });
    }
    if(result?.status==='failed'){setRemoteStatus(checkoutFailureMessage(result.error));return}
    setRemoteStatus(
      result?.status === "requires_payment_action"
        ? production
          ? "在线支付会话已创建，请填写付款信息。"
          : "测试支付会话已创建，请填写测试付款信息。"
        : production
          ? "在线结账暂时不可用，请稍后再试。"
          : "测试结账服务暂时不可用。",
    );
  };
  const enabled = appConfig.runtimeMode !== "production";
  return (
    <>
      <AppTitle eyebrow="第 4 步，共 4 步" title="支付" />
      {!paymentReady&&<div className="notice" role="alert">订单的班次、价格、乘客资料或条款确认不完整。请返回重新核对，系统不会创建付款。</div>}
      <div className="receipt"><div><span>订单金额</span><b>{payableTotal==null?'待确认':`¥${payableTotal}`}</b></div></div>
      <div className="notice">
        {services
          ? services.checkoutAvailable
            ? production
              ? "在线结账入口已开放；支付结果以服务端确认状态为准。"
              : "仅连接测试后端；不会使用生产商户或真实扣款。"
            : production
              ? "在线支付暂未开放；银行转账请等待开放通知。"
              : "账户服务可用，但结账服务尚未连接，当前不会创建订单或扣款。"
          : "支付能力尚未连接，当前不会真实扣款。"}
      </div>
      <div className="payment-methods">
        {availableMethods.map((m) => (
          <button
            key={m}
            className={method === m ? "selected" : ""}
            onClick={() => setMethod(m)}
          >
            <span>{m}</span>
            <small>
              {services
                ? services.checkoutAvailable
                  ? production
                    ? "以提交结果为准"
                    : "测试模式"
                  : production
                    ? "暂未开放"
                    : "结账未连接"
                : enabled
                  ? "开发模拟"
                  : "尚未连接"}
            </small>
          </button>
        ))}
      </div>
      {remoteCheckout && stripeTestClient && method !== "银行转账" && (
        <Elements
          stripe={stripeTestClient}
          options={{ clientSecret: remoteCheckout.clientSecret, locale: "zh" }}
        >
          <StripePaymentForm
            orderId={remoteCheckout.orderId}
            onComplete={(orderId, status) =>
              nav(
                `/app/payment-result?order_id=${encodeURIComponent(orderId)}&payment_status=${status}`,
              )
            }
          />
        </Elements>
      )}
      {remoteStatus && (
        <p className="notice" role="status">
          {remoteStatus}
        </p>
      )}
      <button
        className="button full"
        disabled={
          services
            ? !services.checkoutAvailable ||
              !state.booking?.departureId ||
              !paymentReady ||
              submitting ||
              Boolean(remoteCheckout)
            : !enabled||!paymentReady
        }
        onClick={services ? createTestCheckout : simulate}
      >
        {services
          ? services.checkoutAvailable
            ? production
              ? "继续在线结账"
              : submitting
                ? "正在创建测试结账…"
                : remoteCheckout
                  ? "请在上方完成测试支付"
                  : "提交测试结账"
            : production
              ? "在线支付暂未开放"
              : "结账服务未连接"
          : enabled
            ? "模拟支付并创建开发订单"
            : "支付服务未开放"}
      </button>
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
  useEffect(() => {
    if (services)
      void services
        .loadOwnOrders()
        .then((result) =>
          setRemote({
            loading: false,
            error: result.error,
            rows: result.data as Array<{
              id: string;
              departure_id: string;
              seat_count: number;
              status: string;
            }>,
          }),
        );
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
