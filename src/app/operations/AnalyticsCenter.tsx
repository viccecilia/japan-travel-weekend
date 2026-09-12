import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../store";
import type {
  OperationsReferralRelation,
  OperationsReferralSummary,
  OperationsSnapshot,
} from "../../shared/integrations/supabaseOperations";
export type BusinessPeriod = "week" | "month" | "quarter" | "year";
const dateKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function tokyoPeriodRange(period: BusinessPeriod, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const value = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value);
  const year = value("year"),
    month = value("month"),
    day = value("day");
  const local = new Date(Date.UTC(year, month - 1, day));
  let start: Date, end: Date;
  if (period === "week") {
    const weekday = (local.getUTCDay() + 6) % 7;
    start = new Date(local);
    start.setUTCDate(local.getUTCDate() - weekday);
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
  } else if (period === "month") {
    start = new Date(Date.UTC(year, month - 1, 1));
    end = new Date(Date.UTC(year, month, 0));
  } else if (period === "quarter") {
    const first = Math.floor((month - 1) / 3) * 3;
    start = new Date(Date.UTC(year, first, 1));
    end = new Date(Date.UTC(year, first + 3, 0));
  } else {
    start = new Date(Date.UTC(year, 0, 1));
    end = new Date(Date.UTC(year, 11, 31));
  }
  return { from: dateKey(start), to: dateKey(end) };
}
export function referralLevels(relations: OperationsReferralRelation[]) {
  const children = new Map<string, OperationsReferralRelation[]>();
  relations.forEach((row) => {
    const key = row.inviter_email || row.inviter_name;
    children.set(key, [...(children.get(key) ?? []), row]);
  });
  return relations.map((row) => ({
    relation: row,
    direct: true,
    downstream: (children.get(row.invitee_email || row.invitee_name) ?? [])
      .length,
  }));
}
export function AnalyticsCenter() {
  const { services } = useApp();
  const [params, setParams] = useSearchParams();
  const period = (
    ["week", "month", "quarter", "year"].includes(params.get("period") ?? "")
      ? params.get("period")
      : "week"
  ) as BusinessPeriod;
  const range = tokyoPeriodRange(period);
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [referral, setReferral] = useState<OperationsReferralSummary | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!services) {
      setError("运营数据服务未配置");
      return;
    }
    Promise.all([
      services.operations.loadSnapshot(range.from, range.to),
      services.operations.loadReferralSummary(),
    ]).then(([operations, referrals]) => {
      if (!active) return;
      if (operations.error || !operations.data) {
        setError(operations.error ?? "经营数据读取失败");
        return;
      }
      setSnapshot(operations.data);
      setReferral(referrals);
      setError("");
    });
    return () => {
      active = false;
    };
  }, [services, range.from, range.to]);
  const departures = useMemo(
    () =>
      snapshot?.departures.filter((item) => {
        if (!item.departsAt) return false;
        const key = dateKey(new Date(item.departsAt));
        return key >= range.from && key <= range.to;
      }) ?? [],
    [snapshot, range.from, range.to],
  );
  const totals = useMemo(
    () =>
      departures.reduce(
        (result, item) => ({
          departures: result.departures + 1,
          passengers: result.passengers + item.bookedSeats,
          revenue: result.revenue + item.grossAmountJpy,
          capacity: result.capacity + item.capacity,
        }),
        { departures: 0, passengers: 0, revenue: 0, capacity: 0 },
      ),
    [departures],
  );
  const relations = referralLevels(referral?.relations ?? []);
  const drill = `/app/operations/orders?from=${range.from}&to=${range.to}`;
  return (
    <main className="operations-page">
      <header className="operations-hero">
        <div>
          <span>BUSINESS ANALYTICS</span>
          <h1>经营 Dashboard</h1>
          <p>
            按 Asia/Tokyo
            服务日期统计；数字下钻到使用同一日期范围的订单与班次列表。
          </p>
        </div>
      </header>
      <section className="operations-section">
        <div className="filters" role="group" aria-label="统计周期">
          {(["week", "month", "quarter", "year"] as const).map((key) => (
            <button
              type="button"
              className={period === key ? "active" : ""}
              key={key}
              onClick={() => setParams({ period: key })}
            >
              {{ week: "周", month: "月", quarter: "季度", year: "年" }[key]}
            </button>
          ))}
        </div>
        <p>
          {range.from} — {range.to}
        </p>
        {error ? (
          <p role="alert">{error}</p>
        ) : !snapshot ? (
          <p role="status">正在读取经营数据…</p>
        ) : (
          <div className="operations-kpis">
            <Link to={`${drill}&metric=departures`}>
              <span>服务班次</span>
              <strong>{totals.departures}</strong>
            </Link>
            <Link to={`${drill}&metric=passengers`}>
              <span>出游人数</span>
              <strong>{totals.passengers}</strong>
            </Link>
            <Link to={`${drill}&metric=capacity`}>
              <span>核定席位</span>
              <strong>{totals.capacity}</strong>
            </Link>
            <Link to={`${drill}&metric=serviceRevenue`}>
              <span>服务班次订单金额 JPY</span>
              <strong>{totals.revenue.toLocaleString("ja-JP")}</strong>
            </Link>
          </div>
        )}
      </section>
      <section className="operations-section">
        <header>
          <div>
            <span>REFERRAL ANALYSIS</span>
            <h2>推荐关系树与渠道转化</h2>
          </div>
          <small>树用于来源分析，不产生多级返佣</small>
        </header>
        {!referral ? (
          <p className="operations-empty">推荐统计尚未读取或当前无权限。</p>
        ) : (
          <>
            <div className="operations-kpis">
              <article>
                <span>直接推荐关系</span>
                <strong>{referral.integrity.relationships}</strong>
              </article>
              <article>
                <span>首单付款新人</span>
                <strong>{referral.paidInvitees}</strong>
              </article>
              <article>
                <span>符合资格</span>
                <strong>{referral.qualifiedInvites}</strong>
              </article>
              <article>
                <span>关系异常</span>
                <strong>{referral.alerts.length}</strong>
              </article>
            </div>
            <div className="operations-dispatch-list">
              {relations.map(({ relation, downstream }) => (
                <article key={relation.id}>
                  <div>
                    <b>
                      {relation.inviter_name || relation.inviter_email} →{" "}
                      {relation.invitee_name || relation.invitee_email}
                    </b>
                    <span>直接推荐</span>
                  </div>
                  <small>
                    首单：{relation.order_status ?? "尚未付款"} · 下游关系{" "}
                    {downstream} 条（仅分析）
                  </small>
                  <Link
                    to={`/app/operations/commissions?ambassador=${encodeURIComponent(relation.inviter_email)}&relation=${relation.id}`}
                  >
                    查看直接佣金追溯
                  </Link>
                </article>
              ))}
            </div>
            <p className="operations-hint">
              佣金仍仅奖励新人首笔符合资格订单的10%；下游人数不进入佣金计算。
            </p>
          </>
        )}
      </section>
    </main>
  );
}
