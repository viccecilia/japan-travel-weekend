import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../store";
import type {
  OperationsDriverStatistic,
  OperationsRunRow,
} from "../../shared/integrations/supabaseOperations";
const tokyoToday = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
const locationState = (value: string | null) => {
  if (!value) return "暂无真实定位";
  const age = Date.now() - new Date(value).getTime();
  const time = new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Tokyo",
  });
  return age <= 2 * 60_000
    ? `实时 · 最后定位 ${time}`
    : `已过期 · 最后定位 ${time}`;
};
const sum = (
  rows: OperationsRunRow[],
  field: "bookedSeats" | "arrived" | "boarded",
) => rows.reduce((total, row) => total + row[field], 0);
const groupedDepartures = (rows: OperationsRunRow[]) =>
  Array.from(
    rows
      .reduce((groups, row) => {
        const current = groups.get(row.departureId) ?? [];
        current.push(row);
        groups.set(row.departureId, current);
        return groups;
      }, new Map<string, OperationsRunRow[]>())
      .values(),
  );
export function RunCenter() {
  const { services } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") ?? tokyoToday());
  const selectedDeparture = searchParams.get("departure") ?? "";
  const [rows, setRows] = useState<OperationsRunRow[]>([]);
  const [drivers, setDrivers] = useState<OperationsDriverStatistic[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const requested = searchParams.get("date");
    if (requested && requested !== date) setDate(requested);
  }, [searchParams, date]);
  useEffect(() => {
    let active = true;
    const monthStart = `${date.slice(0, 7)}-01`;
    const load = () => {
      setLoading(true);
      void Promise.all([
        services?.operations.loadRunBoard(date),
        services?.operations.loadDriverStatistics(monthStart, date),
      ])
        .then(([run, stats]) => {
          if (!active) return;
          setRows(run?.data ?? []);
          setDrivers(stats?.data ?? []);
          setNotice(run?.error ?? stats?.error ?? "");
        })
        .catch((error) => {
          if (active)
            setNotice(
              error instanceof Error ? error.message : "运行数据读取失败",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [date, services]);
  const changeDate = (value: string) => {
    setDate(value);
    const next = new URLSearchParams(searchParams);
    next.set("date", value);
    next.delete("departure");
    setSearchParams(next, { replace: true });
  };
  const selectedRows = selectedDeparture
    ? rows.filter((row) => row.departureId === selectedDeparture)
    : [];
  const selectedRow = selectedRows[0];
  const listUrl = `/app/operations/run?date=${date}`;
  if (loading)
    return (
      <main className="operations-page">
        <header className="operations-hero">
          <div>
            <span>DAILY OPERATIONS</span>
            <h1>{selectedDeparture ? "班次运行详情" : "每日运行台"}</h1>
          </div>
        </header>
        <section className="operations-section">
          <p role="status">正在读取班次、车辆组与履约状态…</p>
        </section>
      </main>
    );
  return (
    <main className="operations-page">
      <header className="operations-hero">
        <div>
          <span>DAILY OPERATIONS</span>
          <h1>{selectedDeparture ? "班次运行详情" : "每日运行台"}</h1>
          <p>
            来自订单、配车、点名、行程事件和异常工单；没有定位时不生成模拟轨迹。
          </p>
        </div>
        <Link
          className="button secondary"
          to={selectedDeparture ? listUrl : "/app/operations"}
        >
          {selectedDeparture ? "返回当日发车表" : "返回工作台"}
        </Link>
      </header>
      {selectedDeparture ? (
        <section className="operations-section" aria-label="班次运行详情">
          {notice ? (
            <p role="alert">运行数据读取失败：{notice}</p>
          ) : selectedRow ? (
            <>
              <header>
                <div>
                  <span>{date} · 日本时间</span>
                  <h2>{selectedRow.tripTitle}</h2>
                </div>
                <strong>{selectedRow.departureStatus}</strong>
              </header>
              <div className="operations-kpis">
                <article>
                  <span>发车时间</span>
                  <b>
                    {new Date(selectedRow.departsAt).toLocaleTimeString(
                      "zh-CN",
                      {
                        timeZone: "Asia/Tokyo",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </b>
                </article>
                <article>
                  <span>车辆数</span>
                  <b>
                    {selectedRows.filter((row) => row.vehicleGroupId).length}
                  </b>
                </article>
                <article>
                  <span>报名 / 容量</span>
                  <b>
                    {sum(selectedRows, "bookedSeats")} /{" "}
                    {selectedRows.every((row) => row.capacity != null)
                      ? selectedRows.reduce(
                          (total, row) => total + (row.capacity ?? 0),
                          0,
                        )
                      : "未完整设置"}
                  </b>
                </article>
                <article>
                  <span>已到 / 已登车</span>
                  <b>
                    {sum(selectedRows, "arrived")} /{" "}
                    {sum(selectedRows, "boarded")}
                  </b>
                </article>
              </div>
              <div className="operations-dispatch-list" aria-label="本班车辆组">
                {selectedRows.map((row, index) => (
                  <article key={row.vehicleGroupId ?? `unassigned-${index}`}>
                    <div>
                      <b>{row.vehicleLabel ?? "尚未配车"}</b>
                      <span>{row.driverName ?? "尚未分配司机"}</span>
                    </div>
                    <strong>
                      本车 {row.bookedSeats}/{row.capacity ?? "—"} 人 · 已到{" "}
                      {row.arrived} · 已上车 {row.boarded}
                    </strong>
                    <span>
                      {row.journeyStatus}
                      {row.currentStop
                        ? ` · 当前站点：${row.currentStop}`
                        : " · 暂无当前站点"}
                    </span>
                    <small>
                      {row.lastEventAt
                        ? `最后事件：${new Date(row.lastEventAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}`
                        : "暂无履约事件"}{" "}
                      ·{" "}
                      {row.openIncidents
                        ? `${row.openIncidents} 个关联未关闭异常`
                        : "无关联未关闭异常"}
                    </small>
                    {row.openIncidents > 0 && row.vehicleGroupId && (
                      <Link to={`/app/operations/incidents?date=${encodeURIComponent(date)}&departure=${encodeURIComponent(row.departureId)}&vehicleGroup=${encodeURIComponent(row.vehicleGroupId)}`}>查看本车异常</Link>
                    )}
                  </article>
                ))}
              </div>
              <p className="operations-hint">
                人数按车辆组汇总；每辆车单独显示履约和异常，避免同班多车相互覆盖。
              </p>
              <div className="operations-quick-actions">
                <Link
                  to={`/app/operations/departures?date=${date}&departure=${selectedRow.departureId}`}
                >
                  编辑班次安排
                </Link>
                {selectedRows.some((row) => row.openIncidents > 0) && (
                  <Link
                    to={`/app/operations/incidents?date=${encodeURIComponent(date)}&departure=${encodeURIComponent(selectedRow.departureId)}`}
                  >
                    处理本班异常
                  </Link>
                )}
              </div>
            </>
          ) : (
            <p role="alert">
              在 {date}{" "}
              的运行数据中找不到该班次。班次可能已改期、取消或您无权查看。
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="operations-section">
            <label>
              服务日期（日本时间）
              <input
                type="date"
                value={date}
                onChange={(event) => changeDate(event.target.value)}
              />
            </label>
            {notice && <p role="alert">运行数据读取失败：{notice}</p>}
            <div className="operations-dispatch-list">
              {groupedDepartures(rows).map((group) => {
                const row = group[0];
                return (
                  <article
                    id={`departure-${row.departureId}`}
                    key={row.departureId}
                  >
                    <div>
                      <b>{row.tripTitle}</b>
                      <span>
                        {new Date(row.departsAt).toLocaleTimeString("zh-CN", {
                          timeZone: "Asia/Tokyo",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ·{" "}
                        {group.filter((item) => item.vehicleGroupId).length ||
                          "未配"}{" "}
                        辆车
                      </span>
                    </div>
                    <strong>
                      {sum(group, "bookedSeats")} 人 · 已到{" "}
                      {sum(group, "arrived")} · 已上车 {sum(group, "boarded")}
                    </strong>
                    <small>
                      {group
                        .map((item) => item.vehicleLabel ?? "未配车")
                        .join("、")}
                    </small>
                    <Link to={`${listUrl}&departure=${row.departureId}`}>
                      查看本班详情
                    </Link>
                  </article>
                );
              })}
            </div>
            {!notice && rows.length === 0 && (
              <p>
                该服务日期暂无班次；停售班次仍会显示，已取消班次按取消状态显示。
              </p>
            )}
          </section>
          <section className="operations-section">
            <header>
              <div>
                <span>DRIVER UTILIZATION</span>
                <h2>本月司导运载统计</h2>
              </div>
              <small>
                游客人数按乘客去重，司机与导游分开显示；超过2分钟未采样显示为过期
              </small>
            </header>
            <div className="operations-dispatch-list">
              {drivers.map((driver) => (
                <article key={driver.driverId}>
                  <b>
                    {driver.driverName} · {driver.serviceRole}
                  </b>
                  <span>
                    完成 {driver.completedRuns}/{driver.assignedRuns} 班 · 已售{" "}
                    {driver.soldPassengers} · 已分配 {driver.assignedPassengers}{" "}
                    · 首次上车 {driver.boardedPassengers} · 完成承运{" "}
                    {driver.completedPassengers}
                  </span>
                  <small>
                    座位 {driver.availableSeats} · 实载率 {driver.loadFactor}% ·{" "}
                    {driver.openIncidents
                      ? `${driver.openIncidents} 个未关闭异常`
                      : "无未关闭异常"}{" "}
                    · {locationState(driver.lastLocationAt)}
                  </small>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
