import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../store";
import type {
  OperationsEditableDeparture,
  OperationsProduct,
} from "../../shared/integrations/supabaseOperations";
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
  const range=searchParams.get('range')??'';
  const statusFilter=searchParams.get('status')??'all';
  const routeFilter=searchParams.get('route')??'';
  const selectedDeparture=searchParams.get('departure')??'';
  const queryWindow=()=>{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(selectedDate)return {from:`${selectedDate}T00:00:00+09:00`,to:`${selectedDate}T23:59:59+09:00`};if(range==='past')return {from:'2020-01-01T00:00:00+09:00',to:`${today}T00:00:00+09:00`};if(range==='future')return {from:`${today}T00:00:00+09:00`,to:'2035-12-31T23:59:59+09:00'};return null};
  const updateFilter=(key:string,value:string)=>{const next=new URLSearchParams(searchParams);if(value&&value!=='all')next.set(key,value);else next.delete(key);setSearchParams(next,{replace:true})};
  const [products, setProducts] = useState<OperationsProduct[]>([]);
  const [departures, setDepartures] = useState<OperationsEditableDeparture[]>(
    [],
  );
  const [editing, setEditing] = useState<OperationsEditableDeparture | null>(
    null,
  );
  const [preview, setPreview] = useState<Array<Record<string, unknown>>>([]);
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const reloadDepartures = async () => {
    if (!services) return;
    const window=queryWindow();
    const result = await services.operations.listEditableDepartures(window?.from,window?.to);
    setDepartures(result.data);
    setEditing(
      (current) => result.data.find((item) => item.id === (selectedDeparture||current?.id)) ?? null,
    );
    if (result.error) setNotice(result.error);
  };
  useEffect(() => {
    let active = true;
    if (services)
      void Promise.all([
        services.operations.listProducts(),
        (()=>{const window=queryWindow();return services.operations.listEditableDepartures(window?.from,window?.to)})(),
      ]).then(([productResult, departureResult]) => {
        if (!active) return;
        setProducts(productResult.data);
        setDepartures(departureResult.data);
        setEditing(departureResult.data.find(item=>item.id===selectedDeparture)??null);
        setNotice(productResult.error ?? departureResult.error ?? "");
      });
    return () => {
      active = false;
    };
  }, [services,selectedDate,range,selectedDeparture]);
  const visibleDepartures=departures.filter(item=>(statusFilter==='all'||item.status===statusFilter)&&(!routeFilter||item.tripTitle.toLocaleLowerCase().includes(routeFilter.toLocaleLowerCase())));
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
        <div className="operations-controls operations-filter-row"><label>服务日期<input type="date" value={selectedDate} onChange={event=>updateFilter('date',event.target.value)}/></label><label>状态<select value={statusFilter} onChange={event=>updateFilter('status',event.target.value)}><option value="all">全部</option><option value="open">销售中</option><option value="closed">停售</option><option value="cancelled">已取消</option><option value="draft">草稿</option></select></label><label>路线<input value={routeFilter} placeholder="输入路线名称" onChange={event=>updateFilter('route',event.target.value)}/></label></div>
        <div className="operations-dispatch-list">
          {visibleDepartures.map((item) => (
            <button
              type="button"
              key={item.id}
              className={editing?.id === item.id ? "selected" : ""}
              onClick={() => {setEditing(item);updateFilter('departure',item.id)}}
            >
              <b>{item.tripTitle}</b>
              <span>
                {new Date(item.departsAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Tokyo",
                })}
              </span>
              <small>
                ¥{item.price} · {item.committedSeats}/{item.capacity}席 · 已付款{" "}
                {item.paidOrders} 单 · {item.status} · v{item.version}
              </small>
            </button>
          ))}
        </div>
        {!notice&&visibleDepartures.length===0&&<p className="operations-empty">当前日期、状态和路线筛选范围内没有班次。</p>}
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
