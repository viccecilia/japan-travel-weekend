import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../store";
import type {
  OperationsCalendarDeparture,
  OperationsEditableDeparture,
  OperationsProduct,
  OperationsSnapshot,
  DispatchPlanDraft,
} from "../../shared/integrations/supabaseOperations";
import {DepartureMonthCalendar} from './DepartureMonthCalendar';
import {currentJapanMonth, monthRange, shiftMonth} from './departureCalendar';
import {ManualDispatchPanel} from './ManualDispatchPanel';
const uuid = () => crypto.randomUUID();
const japanLocalToIso = (value: string) =>
  new Date(`${value}:00+09:00`).toISOString();
const local = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
const values = (form: FormData) => ({
  tripId: String(form.get("tripId")),
  start: String(form.get("start")),
  end: String(form.get("end")),
  weekdays: String(form.get("weekdays")).split(",").map(Number),
  departureTime: String(form.get("departureTime")),
  durationMinutes: Number(form.get("durationMinutes")),
  price: Number(form.get("price")),
  capacity: Number(form.get("capacity")),
  salesOpen: japanLocalToIso(String(form.get("salesOpen"))),
  closeHours: Number(form.get("closeHours")),
  meetingName: String(form.get("meetingName")),
  meetingAddress: String(form.get("meetingAddress")),
  mapLat: Number(form.get("mapLat")),
  mapLng: Number(form.get("mapLng")),
});
export function DepartureCenter() {
  const { services } = useApp();
  const [searchParams,setSearchParams]=useSearchParams();
  const selectedDate=searchParams.get('date')??'';
  const statusFilter=searchParams.get('status')??'all';
  const routeFilter=searchParams.get('route')??'';
  const month=searchParams.get('month') || selectedDate.slice(0,7) || currentJapanMonth();
  const selectedDeparture=searchParams.get('departure')??'';
  const dispatchMode=searchParams.get('dispatch')??'';
  const updateFilter=(key:string,value:string)=>{const next=new URLSearchParams(searchParams);if(value&&value!=='all')next.set(key,value);else next.delete(key);setSearchParams(next,{replace:true})};
  const [products, setProducts] = useState<OperationsProduct[]>([]);
  const [departures, setDepartures] = useState<OperationsEditableDeparture[]>(
    [],
  );
  const [calendarDepartures, setCalendarDepartures] = useState<OperationsCalendarDeparture[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [calendarError, setCalendarError] = useState('');
  const [resources, setResources] = useState<OperationsSnapshot | null>(null);
  const [resourceError, setResourceError] = useState('');
  const [editing, setEditing] = useState<OperationsEditableDeparture | null>(
    null,
  );
  const [preview, setPreview] = useState<Array<Record<string, unknown>>>([]);
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const reloadDepartures = async () => {
    if (!services) return;
    const calendarWindow=monthRange(month);
    const result = await services.operations.listDepartureCalendar(calendarWindow.from,calendarWindow.to);
    setCalendarDepartures(result.data);
    setDepartures(result.data);
    setEditing(
      (current) => result.data.find((item) => item.id === (selectedDeparture||current?.id)) ?? null,
    );
    setCalendarError(result.error ?? '');
  };
  useEffect(() => {
    let active = true;
    setLoadingCalendar(true);
    const calendarWindow=monthRange(month);
    if (services)
      void Promise.all([
        services.operations.listProducts(),
        services.operations.listDepartureCalendar(calendarWindow.from,calendarWindow.to),
      ]).then(([productResult, departureResult]) => {
        if (!active) return;
        setProducts(productResult.data);
        setDepartures(departureResult.data);
        setCalendarDepartures(departureResult.data);
        setEditing(departureResult.data.find(item=>item.id===selectedDeparture)??null);
        setNotice(productResult.error ?? "");
        setCalendarError(departureResult.error ?? "");
        setLoadingCalendar(false);
      });
    return () => {
      active = false;
    };
  }, [services,month,selectedDeparture]);
  useEffect(() => {
    let active = true;
    if (!services || dispatchMode !== 'manual' || !selectedDeparture) return () => {active = false;};
    const window = monthRange(month);
    void services.operations.loadSnapshot(window.from, window.to).then((result) => {if (active) {setResources(result.data); setResourceError(result.error ?? '');}});
    return () => {active = false;};
  }, [services, dispatchMode, selectedDeparture, month]);
  const visibleDepartures=departures.filter(item=>statusFilter==='all'||item.status===statusFilter);
  const onPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services) return;
    setBusy(true);
    const input = {
      ...values(new FormData(event.currentTarget)),
      operationId: uuid(),
    };
    const result = await services.operations.previewDepartureBatch(input);
    setBusy(false);
    setPreview(result.data);
    setRequest(input);
    setNotice(
      result.error
        ? `预览失败：${result.error}`
        : `预览 ${result.data.length} 个班次；重复项不会再次创建`,
    );
  };
  const confirm = async () => {
    if (!services || !request) return;
    setBusy(true);
    const result = await services.operations.createDepartureBatch(
      request as Parameters<typeof services.operations.createDepartureBatch>[0],
    );
    setBusy(false);
    setNotice(
      result.error
        ? `创建失败：${result.error}`
        : `创建完成：${JSON.stringify(result.data)}`,
    );
    if (!result.error) await reloadDepartures();
  };
  const update = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services || !editing) return;
    const form = new FormData(event.currentTarget);
    const departsAt = japanLocalToIso(String(form.get("editDepartsAt")));
    const endsAt = japanLocalToIso(String(form.get("editEndsAt")));
    const summary = `出发：${local(editing.departsAt)} → ${String(form.get("editDepartsAt"))}\n返回：${local(editing.endsAt)} → ${String(form.get("editEndsAt"))}\n集合：${editing.meetingName} → ${String(form.get("editMeetingName"))}\n已付款订单：${editing.paidOrders} 单（合同快照保持不变，重要变更会生成通知）`;
    if (!window.confirm(`请确认班次变更：\n${summary}`)) return;
    setBusy(true);
    const result = await services.operations.updateDeparture({
      id: editing.id,
      expectedVersion: editing.version,
      departsAt,
      endsAt,
      price: Number(form.get("editPrice")),
      capacity: Number(form.get("editCapacity")),
      salesOpenAt: japanLocalToIso(String(form.get("editSalesOpen"))),
      salesCloseAt: japanLocalToIso(String(form.get("editSalesClose"))),
      status: String(form.get("editStatus")),
      meetingName: String(form.get("editMeetingName")),
      meetingAddress: String(form.get("editMeetingAddress")),
      mapLat: Number(form.get("editMapLat")),
      mapLng: Number(form.get("editMapLng")),
    });
    setBusy(false);
    setNotice(
      result.ok
        ? `班次已更新；${Number(result.data?.affectedPaidOrders ?? 0)} 个已付款订单的合同快照保持不变，必要通知已进入发送队列。`
        : `更新失败：${result.error}`,
    );
    if (result.ok) await reloadDepartures();
  };
  const cancel = async () => {
    if (!services || !editing) return;
    const reason = window.prompt(
      `取消 ${editing.tripTitle} 的运营原因（至少5字）。系统会为 ${editing.paidOrders} 个已付款订单建立全额退款审核任务并通知游客。`,
    );
    if (!reason || reason.trim().length < 5) return;
    if (!window.confirm("确认取消整个班次？此操作不能通过普通编辑恢复。"))
      return;
    setBusy(true);
    const result = await services.operations.cancelDeparture(
      editing.id,
      editing.version,
      reason.trim(),
    );
    setBusy(false);
    setNotice(
      result.ok
        ? `班次已受控取消；建立 ${Number(result.data?.refundRequestsCreated ?? 0)} 个退款审核任务，影响 ${Number(result.data?.affectedPaidOrders ?? 0)} 个已付款订单。`
        : `取消失败：${result.error}`,
    );
    if (result.ok) await reloadDepartures();
  };
  const saveDispatch = async (tasks: DispatchPlanDraft[]) => {
    if (!services || !editing) return;
    setBusy(true);
    const result = await services.operations.saveDispatchPlan(editing.id, tasks);
    setNotice(result.ok ? '配车草稿已保存并重新读取；尚未确认派单、公开车辆或发送通知。' : `配车草稿保存失败：${result.error ?? '未知错误'}`);
    if (result.ok) await reloadDepartures();
    setBusy(false);
  };
  return (
    <main className="operations-page">
      <header className="operations-hero">
        <div>
          <span>DEPARTURES & PRICING</span>
          <h1>班次与价格</h1>
          <p>所有时间按日本时间；新建先预览，修改使用版本锁避免覆盖。</p>
        </div>
        <Link className="button secondary" to="/app/operations">
          返回工作台
        </Link>
      </header>
      <section className="operations-section">
        <header>
          <div>
            <span>已有班次</span>
            <h2>日期、集合、价格与截止时间调整</h2>
          </div>
          <small>容量不能低于已锁定席位；旧订单合同不改写</small>
        </header>
        <div className="departure-calendar-toolbar"><div><button type="button" onClick={() => updateFilter('month', shiftMonth(month, -1))}>上个月</button><button type="button" onClick={() => updateFilter('month', currentJapanMonth())}>本月</button><button type="button" onClick={() => updateFilter('month', shiftMonth(month, 1))}>下个月</button></div><strong>{month.replace('-', '年')}月</strong><label>状态<select value={statusFilter} onChange={event=>updateFilter('status',event.target.value)}><option value="all">全部状态</option><option value="open">销售中</option><option value="closed">停售</option><option value="cancelled">已取消</option><option value="draft">草稿</option></select></label></div>
        {loadingCalendar ? <p className="operations-empty">正在读取班次月历…</p> : calendarError ? <p className="operations-error">{calendarError}</p> : <DepartureMonthCalendar month={month} departures={calendarDepartures.filter(item=>statusFilter==='all'||item.status===statusFilter)} selectedRoute={routeFilter} selectedDeparture={editing?.id ?? ''} openSelected={dispatchMode !== 'manual'} onRouteChange={(value) => updateFilter('route', value)} onSelect={(item) => {setEditing(item);updateFilter('departure', item.id);}} />}
        {!loadingCalendar&&!calendarError&&visibleDepartures.length===0&&<p className="operations-empty">当前月份和状态范围内没有班次。</p>}
        {dispatchMode === 'manual' && editing && (resourceError ? <p className="operations-error">配车资源读取失败：{resourceError}</p> : resources ? <ManualDispatchPanel departure={calendarDepartures.find((item) => item.id === editing.id) ?? editing as OperationsCalendarDeparture} snapshot={resources} busy={busy} onSave={saveDispatch} /> : <p className="operations-empty">正在读取车辆与司机资源…</p>)}
        {editing && (
          <form
            key={`${editing.id}:${editing.version}`}
            className="operations-controls"
            onSubmit={update}
          >
            <label>
              出发时间
              <input
                name="editDepartsAt"
                type="datetime-local"
                defaultValue={local(editing.departsAt)}
                required
              />
            </label>
            <label>
              预计返回
              <input
                name="editEndsAt"
                type="datetime-local"
                defaultValue={local(editing.endsAt)}
                required
              />
            </label>
            <label>
              每席价格（日元）
              <input
                name="editPrice"
                type="number"
                min="1"
                defaultValue={editing.price}
                required
              />
            </label>
            <label>
              销售容量
              <input
                name="editCapacity"
                type="number"
                min={editing.committedSeats}
                defaultValue={editing.capacity}
                required
              />
            </label>
            <label>
              开始销售
              <input
                name="editSalesOpen"
                type="datetime-local"
                defaultValue={local(editing.salesOpenAt)}
                required
              />
            </label>
            <label>
              销售截止
              <input
                name="editSalesClose"
                type="datetime-local"
                defaultValue={local(editing.salesCloseAt)}
                required
              />
            </label>
            <label>
              集合地点
              <input
                name="editMeetingName"
                defaultValue={editing.meetingName}
                required
              />
            </label>
            <label>
              集合地址
              <input
                name="editMeetingAddress"
                defaultValue={editing.meetingAddress}
                required
              />
            </label>
            <label>
              纬度
              <input
                name="editMapLat"
                type="number"
                min="-90"
                max="90"
                step="0.000001"
                defaultValue={editing.mapLat}
                required
              />
            </label>
            <label>
              经度
              <input
                name="editMapLng"
                type="number"
                min="-180"
                max="180"
                step="0.000001"
                defaultValue={editing.mapLng}
                required
              />
            </label>
            <label>
              状态
              <select name="editStatus" defaultValue={editing.status}>
                {["draft", "open", "closed"].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <p>
              影响预览：当前已有 {editing.paidOrders} 个已付款订单、
              {editing.committedSeats}{" "}
              个锁定席位。保存后旧订单价格、路线与取消政策快照不会改变。
            </p>
            <button className="button" disabled={busy}>
              确认更新班次
            </button>
            {editing.status !== "cancelled" && (
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => void cancel()}
              >
                受控取消班次
              </button>
            )}
          </form>
        )}
      </section>
      <section className="operations-section">
        <header>
          <div>
            <span>批量建班</span>
            <h2>创建新班次</h2>
          </div>
        </header>
        <form
          className="operations-controls"
          onSubmit={onPreview}
          onChange={() => {
            if (request) {
              setPreview([]);
              setRequest(null);
              setNotice("表单内容已修改，旧预览已失效，请重新生成预览。");
            }
          }}
        >
          <label>
            产品
            <select name="tripId" required>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            开始日期
            <input name="start" type="date" required />
          </label>
          <label>
            结束日期
            <input name="end" type="date" required />
          </label>
          <label>
            星期（1=周一，7=周日）
            <input name="weekdays" defaultValue="6,7" required />
          </label>
          <label>
            出发时间
            <input
              name="departureTime"
              type="time"
              defaultValue="09:00"
              required
            />
          </label>
          <label>
            预计分钟
            <input
              name="durationMinutes"
              type="number"
              defaultValue="600"
              min="60"
              required
            />
          </label>
          <label>
            每席价格（日元）
            <input name="price" type="number" min="1" required />
          </label>
          <label>
            销售容量
            <input name="capacity" type="number" min="1" required />
          </label>
          <label>
            开始销售
            <input name="salesOpen" type="datetime-local" required />
          </label>
          <label>
            出发前几小时截止
            <input
              name="closeHours"
              type="number"
              defaultValue="24"
              min="1"
              required
            />
          </label>
          <label>
            集合地点
            <input name="meetingName" required />
          </label>
          <label>
            集合地址
            <input name="meetingAddress" required />
          </label>
          <label>
            集合纬度
            <input
              name="mapLat"
              type="number"
              min="-90"
              max="90"
              step="0.000001"
              required
            />
          </label>
          <label>
            集合经度
            <input
              name="mapLng"
              type="number"
              min="-180"
              max="180"
              step="0.000001"
              required
            />
          </label>
          <button className="button" disabled={busy}>
            生成预览
          </button>
        </form>
      </section>
      {notice && <p className="operations-notice">{notice}</p>}
      {preview.length > 0 && (
        <section className="operations-section">
          <header>
            <div>
              <span>影响预览</span>
              <h2>{preview.length} 个候选班次</h2>
            </div>
            <button
              className="button"
              disabled={busy}
              onClick={() => void confirm()}
            >
              确认创建
            </button>
          </header>
          <div className="operations-dispatch-list">
            {preview.map((item, index) => (
              <article key={index}>
                <b>{String(item.serviceDate)}</b>
                <span>
                  ¥{String(item.price)} · {String(item.capacity)}席
                </span>
                <small>{item.duplicate ? "已存在，将跳过" : "可创建"}</small>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
