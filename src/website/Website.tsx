import { useEffect } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { travelRepository } from "../shared/data/repository";
import { TripCard } from "../shared/components/TripCard";
import { businessRules } from "../shared/config/businessRules";
import { cancellationPolicy, operatorProfile } from "../shared/config/legalOperations";
import { LanguageSelect } from "../app/App";
const trips = travelRepository.listTrips();
function Meta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    document.title = `${title} | Japan Travel Weekend`;
    document.documentElement.lang = "zh-CN";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", description);
  }, [title, description]);
  return null;
}
export function WebsiteLayout() {
  return (
    <>
      <a className="skip" href="#content">
        跳到主要内容
      </a>
      <div className="preview-bar">预览环境 · 尚未开放真实预订</div>
      <header className="site-header">
        <Link className="brand" to="/">
          <span>JT</span> Japan Travel Weekend
        </Link>
        <nav aria-label="主导航">
          <NavLink to="/trips">行程</NavLink>
          <NavLink to="/private-groups">私人团体</NavLink>
          <NavLink to="/how-it-works">预订流程</NavLink>
          <NavLink to="/rewards">奖励</NavLink>
          <NavLink to="/safety">安全运营</NavLink>
          <NavLink to="/about">关于我们</NavLink>
        </nav>
        <LanguageSelect />
        <Link className="button small" to="/app">
          打开应用
        </Link>
      </header>
      <main id="content">
        <Outlet />
      </main>
      <footer>
        <div>
          <strong>Japan Travel Weekend</strong>
          <p>{operatorProfile.legalNameJa}／大寅集团运营</p>
        </div>
        <div>
          <Link to="/trips">拼席行程</Link> ·{" "}
          <Link to="/private-groups">私人团体</Link> ·{" "}
          <Link to="/safety">安全运营</Link> · <Link to="/app">应用</Link>
        </div>
        <p className="muted">测试阶段：日期与价格尚未开放；取消规则已形成业务版本，正式上线前仍需法律审阅。</p>
      </footer>
    </>
  );
}
export function Home() {
  return (
    <>
      <Meta
        title="探索关西，遇见同行者"
        description="从大阪出发，面向关西国际居民的周末小团旅行。"
      />
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">大阪出发 · 国际居民友好</div>
          <h1>
            探索关西，
            <br />
            <em>遇见同行者。</em>
          </h1>
          <p>从大阪出发，面向关西国际居民的周末小团旅行。</p>
          <div className="hero-points">
            <span>✓ 一个人也能参加</span>
            <span>✓ 无需日语</span>
          </div>
          <div className="actions">
            <Link className="button" to="/trips">
              查看行程
            </Link>
            <Link className="button secondary" to="/how-it-works">
              了解流程
            </Link>
            <Link className="text-link" to="/app">
              打开应用 →
            </Link>
          </div>
        </div>
        <img src="/images/kyoto-nara.jpg" alt="京都与奈良路线的鸟居风景" />
      </section>
      <section>
        <div className="section-head">
          <div>
            <div className="eyebrow">五种周末方式</div>
            <h2>值得分享的关西路线</h2>
          </div>
          <Link to="/trips">查看全部 →</Link>
        </div>
        <div className="card-grid">
          {trips.slice(0, 3).map((t) => (
            <TripCard trip={t} key={t.id} />
          ))}
        </div>
      </section>
      <section className="ink">
        <div className="eyebrow">为什么选择我们</div>
        <h2>为在地生活者设计，不做匆忙赶路的观光。</h2>
        <div className="feature-grid">
          {[
            ["自在参加", "欢迎独自出行，小团形式让交流自然发生。"],
            ["信息清楚", "开放预订后，会提前提供路线、集合与必要提示。"],
            ["专业运营", "由株式会社大寅／大寅集团负责专业运输规划。"],
            ["中文优先", "当前版本完整提供简体中文，其他语言后续开放。"],
          ].map(([h, p]) => (
            <article key={h}>
              <h3>{h}</h3>
              <p>{p}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="soft center">
        <div className="eyebrow">旅客故事</div>
        <h2>故事还在路上</h2>
        <p>首批试运行行程结束后，这里将展示真实旅客故事。</p>
      </section>
    </>
  );
}
export function TripsPage() {
  return (
    <section className="website-trips-page">
      <Meta title="周末行程" description="浏览从大阪出发的五条关西路线。" />
      <header className="route-catalog-hero">
        <div><span>WEEKEND JOURNEYS · KANSAI</span><h1>五种方式，<br/>重新发现关西</h1><p>从大阪出发，在古都、海岸、湖泊与温泉之间，选一段适合自己的周末旅程。</p><div className="catalog-promises"><b>精选 5 条路线</b><b>中文服务</b><b>一个人也可参加</b></div></div>
        <figure><img src="/images/kobe.jpg" alt="神户港湾夜景"/><figcaption>兵库 · 神户港湾</figcaption></figure>
      </header>
      <div className="route-editorial-heading"><span>CURATED ROUTES</span><h2>这个周末，想看见怎样的关西？</h2><p>每条路线都标明时长、步行强度与主要停靠点。日期和价格以开放班次为准。</p></div>
      <div className="card-grid route-showcase">
        {trips.map((t,index) => <TripCard trip={t} showcaseIndex={index+1} key={t.id} />)}
      </div>
      <aside className="route-planning-note"><span>还没决定？</span><div><h2>先选风景，再选日期</h2><p>进入路线详情了解停靠点和步行强度；正式班次开放后，再确认日期、余位与最终价格。</p></div><Link className="button secondary" to="/how-it-works">了解预订流程</Link></aside>
    </section>
  );
}
export function TripDetail() {
  const t = travelRepository.getTrip(useParams().slug || "");
  if (!t)
    return (
      <section>
        <h1>未找到行程</h1>
      </section>
    );
  return (
    <>
      <Meta title={t.title} description={t.summary} />
      <section className="detail-hero">
        <img src={t.heroImage} alt={`${t.title}路线风景`} />
        <div>
          <div className="eyebrow">{t.status} · {t.region}</div>
          <h1>{t.title}</h1>
          <p>{t.description}</p>
          <div className="chips">
            <span>{t.duration}</span>
            <span>步行强度：{t.walkingLevel}</span>
            <span>价格待公布</span>
          </div>
          <Link className="button" to={`/app/booking/${t.slug}`}>
            在应用中查看班次
          </Link>
        </div>
      </section>
      <section className="detail-grid">
        <div>
          <h2>路线亮点</h2>
          <ul className="check-list">
            {t.highlights.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <h2>参考行程</h2>
          <div className="timeline">
            {t.timeline.map((x, i) => (
              <article key={x.title}>
                <b>{i + 1}</b>
                <div>
                  <h3>{x.title}</h3>
                  <b>{x.time??'时间以具体班次为准'} · {x.location}</b>
                  <p>{x.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <aside>
          <h2>出发前须知</h2>
          {[
            ["集合点", "待公布"],
            ["出发／返回时间", "待公布"],
            ["包含项目", t.included[0]],
            ["不包含项目", t.excluded[0]],
            ["餐食", t.mealOptions],
            ["儿童规则", t.childPolicy],
            ["行李规则", t.luggagePolicy],
            ["取消规则", t.cancellationPolicy],
            ["天气规则", t.weatherPolicy],
            ["辅助服务", t.assistanceStatus],
          ].map(([a, b]) => (
            <div className="fact" key={a}>
              <b>{a}</b>
              <p>{b}</p>
            </div>
          ))}
          <h3>适合人群</h3>
          <ul>{t.suitableFor.map(item=><li key={item}>{item}</li>)}</ul>
          <h3>注意事项</h3>
          <ul>{t.notices.map(item=><li key={item}>{item}</li>)}</ul>
        </aside>
      </section>
    </>
  );
}
const steps = [
  "选择行程",
  "选择出发班次",
  "在应用中预订与支付",
  "领取登车凭证",
  "集合并开始旅行",
];
export function HowItWorks() {
  return (
    <section>
      <Meta title="预订流程" description="从选行程到集合出发的五个步骤。" />
      <div className="page-title">
        <div className="eyebrow">简单清晰</div>
        <h1>五步开启周末旅行</h1>
      </div>
      <div className="steps">
        {steps.map((s, i) => (
          <article key={s}>
            <b>0{i + 1}</b>
            <h2>{s}</h2>
            <p>
              {i < 2
                ? "浏览路线并在开放后选择合适班次。"
                : i === 2
                  ? "支付服务接入后才会创建真实订单。"
                  : i === 3
                    ? "订单确认后生成有效登车凭证。"
                    : "按最终集合信息与本车同行者出发。"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
export function RewardsPage() {
  return (
    <section>
      <Meta title="奖励规则" description="会员、推荐与达人规则预览。" />
      <div className="page-title">
        <div className="eyebrow">规则透明</div>
        <h1>多旅行，直接分享，不设置多层佣金</h1>
        <p>以下比例与期限仍为内部规则草案。</p>
      </div>
      <div className="three-cols">
        <article>
          <h2>会员与推荐</h2>
          <ul>
            <li>
              首个有效订单优惠 {businessRules.firstValidOrderDiscountPercent}%
            </li>
            <li>被推荐人完成有效行程后发放旅行金</li>
            <li>取消、退款或未出席不产生奖励</li>
            <li>仅一层直接推荐</li>
          </ul>
        </article>
        <article>
          <h2>会员成长</h2>
          <ul>
            {businessRules.tiers.map((t) => (
              <li key={t.name}>
                <b>{t.name}</b> —{" "}
                {t.trips === 0 ? "注册" : `完成 ${t.trips} 次行程`}
              </li>
            ))}
          </ul>
        </article>
        <article>
          <h2>达人计划</h2>
          <ul>
            <li>必须申请并通过审核</li>
            <li>无加入费用或强制购买</li>
            <li>仅限直接推荐</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
export function Safety() {
  return (
    <section>
      <Meta title="安全运营" description="周末行程的安全与运营信息。" />
      <div className="page-title">
        <div className="eyebrow">出发前的安心</div>
        <h1>专业运营，清晰沟通</h1>
      </div>
      <div className="feature-grid light">
        {[
          "株式会社大寅／大寅集团运营",
          "专业运输安排",
          "出发前提供车辆与工作人员信息",
          "向已确认乘客提供紧急联系方式",
          "提前明确集合点",
          "中文信息支持",
          "取消与天气通知",
        ].map((x) => (
          <article key={x}>
            <h2>{x}</h2>
            <p>真实服务开放前将公布最终运营细节。</p>
          </article>
        ))}
      </div>
    </section>
  );
}
export function About() {
  return (
    <section>
      <Meta title="关于我们" description="为关西国际居民打造的周末旅行服务。" />
      <div className="page-title">
        <div className="eyebrow">让在地周末更开放</div>
        <h1>为生活在关西的国际居民而生</h1>
        <p>
          Japan Travel Weekend
          由株式会社大寅／大寅集团运营，希望让在地生活者走出日常，也自然遇见新的同行者。
        </p>
      </div>
    </section>
  );
}
export function PrivateGroups() {
  return (
    <section>
      <Meta
        title="私人团体"
        description="面向企业、学校、社团、亲友的包车规划。"
      />
      <div className="page-title">
        <div className="eyebrow">私人团体／包车 · 预览</div>
        <h1>你的团体，你的日期，你的接送方案</h1>
        <p>私人团体与公共拼席完全分开。</p>
      </div>
      <div className="feature-grid light">
        {[
          ["自选日期", "根据团体日程规划。"],
          ["自选接送", "沟通可行的接送方案。"],
          ["不同规模", "可规划单车或多车。"],
          ["专业运输", "由运输团队规划履约。"],
        ].map(([h, p]) => (
          <article key={h}>
            <h2>{h}</h2>
            <p>{p}</p>
          </article>
        ))}
      </div>
      <button className="button" type="button" disabled>
        询价功能尚未开放
      </button>
    </section>
  );
}
export function AppLanding() {
  return (
    <section className="center app-landing">
      <Meta title="周末应用" description="查看 Japan Travel Weekend 应用。" />
      <div className="eyebrow">移动端体验</div>
      <h1>把整个周末放在一个地方</h1>
      <p>当前未连接真实账户、预订或支付服务。</p>
      <Link className="button" to="/app/login">
        打开应用
      </Link>
    </section>
  );
}
export function Terms(){return <section><Meta title="服务条款" description="Japan Travel Weekend 服务条款与取消退款规则。"/><div className="page-title"><div className="eyebrow">业务规则已确认 · 法律文本待审阅</div><h1>服务条款与取消退款规则</h1><p>以下内容是当前业务决定，统一按日本时间计算。正式开放真实预订前仍需由日本法律与旅行业务负责人审阅并确定版本和生效日期。</p></div><div className="feature-grid light"><article><h2>取消与退款</h2><ul>{cancellationPolicy.tiers.map(t=><li key={t.label}>{t.label}：退款 {t.refundPercent}%</li>)}</ul><p>取消以系统成功受理时间为准。</p></article><article><h2>补充规则</h2><ul>{cancellationPolicy.rules.map(rule=><li key={rule}>{rule}</li>)}</ul></article><article><h2>运营主体</h2><p><strong>{operatorProfile.legalNameJa}</strong>（{operatorProfile.legalNameEn}）</p><p>{operatorProfile.address}</p><p>{operatorProfile.representative}</p><p>公司联系：{operatorProfile.corporatePhone}／{operatorProfile.corporateEmail}</p><p>营业时间：{operatorProfile.businessHours}</p></article><article><h2>许可信息</h2><ul>{operatorProfile.licences.map(item=><li key={item}>{item}</li>)}</ul><p>旅行资质的正式登记名称与编号将在许可证原文确认后更新。</p></article></div></section>}
export function Privacy(){return <section><Meta title="隐私政策" description="Japan Travel Weekend 隐私政策。"/><div className="page-title"><div className="eyebrow">隐私与数据保护</div><h1>隐私政策</h1><p>正式法律文本尚待批准。开放真实注册前，将在此说明数据用途、保存期限、权利请求和联系窗口。</p></div></section>}
