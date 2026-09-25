import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../store";
import type {
  OperationsDriverStatistic,
  OperationsRunRow,
} from "../../shared/integrations/supabaseOperations";
import { locationState } from "./runStatus";
const tokyoToday = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
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
const journeyStatusText = (value: string) =>
  ({
    preparing: "待出发",
    meeting: "集合中",
    in_progress: "行程中",
    completed: "已完成",
    data_inconsistent: "历史状态待核对",
  })[value] ?? value;
const tokyoDateTimeLocal = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(" ", "T");
const tokyoLocalToIso = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 9, Number(minute)),
  ).toISOString();
};
export function RunCenter() {
  const { services } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const date = searchParams.get("date") ?? tokyoToday();
  const selectedDeparture = searchParams.get("departure") ?? "";
  const selectedMeetingGroup = searchParams.get("meetingVehicleGroup") ?? "";
  const [rows, setRows] = useState<OperationsRunRow[]>([]);
  const [drivers, setDrivers] = useState<OperationsDriverStatistic[]>([]);
  const [notice, setNotice] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
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
    const next = new URLSearchParams(searchParams);
    next.set("date", value);
    next.delete("departure");
    setSearchParams(next, { replace: true });
  };
  const selectedRows = selectedDeparture
    ? rows.filter((row) => row.departureId === selectedDeparture)
    : [];
  const selectedRow = selectedRows[0];
  const selectedMeetingRow = selectedRows.find(
    (row) => row.vehicleGroupId === selectedMeetingGroup,
  );
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
              {success && <p role="status">{success}</p>}
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
                      {journeyStatusText(row.journeyStatus)}
                      {row.currentStop
                        ? ` · 当前站点：${row.currentStop}`
                        : " · 暂无当前站点"}
                    </span>
                    <small className={row.journeyStatus === "data_inconsistent" ? "operations-warning" : undefined}>
                      {row.journeyStatus === "data_inconsistent" && "该履约记录早于班次服务日期，已保留历史并停止作为当前进度展示。 "}
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
                    {row.vehicleGroupId && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          const next = new URLSearchParams(searchParams);
                          next.set("meetingVehicleGroup", row.vehicleGroupId!);
                          setSearchParams(next, { replace: true });
                        }}
                      >
                        编辑本车集合点
                      </button>
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
              {selectedMeetingRow?.vehicleGroupId && (
                <VehicleGroupMeetingEditor
                  vehicleGroupId={selectedMeetingRow.vehicleGroupId}
                  vehicleLabel={selectedMeetingRow.vehicleLabel ?? "本车"}
                  onClose={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete("meetingVehicleGroup");
                    setSearchParams(next, { replace: true });
                  }}
                  onSaved={(message) => setSuccess(message)}
                />
              )}
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

function VehicleGroupMeetingEditor({
  vehicleGroupId,
  vehicleLabel,
  onClose,
  onSaved,
}: {
  vehicleGroupId: string;
  vehicleLabel: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { services } = useApp();
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingName, setMeetingName] = useState("");
  const [meetingAddress, setMeetingAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [landmark, setLandmark] = useState("");
  const [reason, setReason] = useState("");
  const [revision, setRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    let active = true;
    if (!services) return;
    void services.loadStaffMeeting(vehicleGroupId).then((meeting) => {
      if (!active) return;
      if (meeting) {
        setMeetingAt(tokyoDateTimeLocal(meeting.meeting_at));
        setMeetingName(meeting.meeting_name);
        setMeetingAddress(meeting.meeting_address);
        setLatitude(String(meeting.latitude));
        setLongitude(String(meeting.longitude));
        setLandmark(meeting.landmark_description ?? "");
        setRevision(meeting.revision);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [services, vehicleGroupId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const meetingIso = tokyoLocalToIso(meetingAt);
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (
      !services ||
      !meetingIso ||
      !meetingName.trim() ||
      !meetingAddress.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      reason.trim().length < 3
    ) {
      setResult("请填写集合时间、地点、坐标和至少三个字的变更原因。");
      return;
    }
    setSaving(true);
    const nextRevision = await services.updateStaffMeeting({
      vehicleGroupId,
      meetingAt: meetingIso,
      meetingName: meetingName.trim(),
      meetingAddress: meetingAddress.trim(),
      latitude: lat,
      longitude: lng,
      landmarkDescription: landmark.trim(),
      reason: reason.trim(),
    });
    setSaving(false);
    if (nextRevision == null) {
      setResult("集合信息未保存，请检查本车权限、坐标和变更原因后重试。");
      return;
    }
    setRevision(nextRevision);
    setReason("");
    setResult("已保存。游客与本车工作人员刷新后将读取新的集合点；开放群会收到集合信息变更记录。");
    onSaved("本车集合点已保存；运行台保留原班次数据。 ");
  };

  return (
    <div className="operations-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="operations-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-group-meeting-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>VEHICLE GROUP MEETING</span>
            <h2 id="vehicle-group-meeting-title">编辑本车集合点 · {vehicleLabel}</h2>
            <p>仅修改当前车辆组集合信息；班次集合字段、订单归属和车辆分配不会被改写。</p>
          </div>
          <button type="button" className="button secondary" onClick={onClose}>关闭</button>
        </header>
        {loading ? <p role="status">正在读取当前集合点与版本…</p> : (
          <form className="operations-meeting-form" onSubmit={(event) => void submit(event)}>
            <p className="operations-hint">当前版本：{revision ?? "尚未建立"}。所有时间按日本时间填写；提交会保留变更原因与历史记录。</p>
            <label>集合时间（日本时间）<input aria-label="本车集合时间" type="datetime-local" required value={meetingAt} onChange={(event) => setMeetingAt(event.target.value)} /></label>
            <label>集合点名称<input aria-label="本车集合点名称" required value={meetingName} onChange={(event) => setMeetingName(event.target.value)} /></label>
            <label>详细地址<input aria-label="本车集合详细地址" required value={meetingAddress} onChange={(event) => setMeetingAddress(event.target.value)} /></label>
            <div className="operations-form-grid">
              <label>纬度<input aria-label="本车集合纬度" required inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label>
              <label>经度<input aria-label="本车集合经度" required inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label>
            </div>
            <label>地标说明（选填）<textarea aria-label="本车集合地标说明" value={landmark} onChange={(event) => setLandmark(event.target.value)} /></label>
            <label>变更原因<input aria-label="本车集合变更原因" required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：道路管制，改至东侧出口" /></label>
            {result && <p role="status">{result}</p>}
            <footer><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button" disabled={saving}>{saving ? "正在保存…" : "保存本车集合点"}</button></footer>
          </form>
        )}
      </section>
    </div>
  );
}
