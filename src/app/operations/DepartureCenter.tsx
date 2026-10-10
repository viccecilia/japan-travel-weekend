import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../store";
import type {
  OperationsCalendarDeparture,
  OperationsEditableDeparture,
  OperationsProduct,
  OperationsSnapshot,
  DispatchPlanDraft,
  OperationsDepartureVehicle,
  OperationsMeetingPointTemplate,
} from "../../shared/integrations/supabaseOperations";
import {DepartureMonthCalendar} from './DepartureMonthCalendar';
import {currentJapanMonth, monthRange, shiftMonth} from './departureCalendar';
import {ManualDispatchPanel} from './ManualDispatchPanel';
import {ConfirmedVehicleGroupChangeDialog} from './ConfirmedVehicleGroupChangeDialog';
const uuid = () => crypto.randomUUID();
const japanLocalToIso = (value: string) =>
  new Date(`${value}:00+09:00`).toISOString();
const local = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
const displayJapanDateTime=(iso:unknown)=>typeof iso==='string'&&iso?local(iso).replace('T',' '):'—';
type CutoffValidation={estimate:string;error:string};
const validateCutoff=(form:FormData):CutoffValidation=>{
  const start=String(form.get('start')??'');
  const end=String(form.get('end')??'');
  const time=String(form.get('departureTime')??'');
  const salesOpen=String(form.get('salesOpen')??'');
  const hours=Number(form.get('closeHours'));
  const weekdays=String(form.get('weekdays')??'').split(',').map(Number).filter(day=>Number.isInteger(day)&&day>=1&&day<=7);
  if(!start||!end||!time||!Number.isFinite(hours)||hours<1||weekdays.length===0){
    return {estimate:'请先填写日期、星期、出发时间和截止小时',error:''};
  }
  const first=new Date(`${start}T00:00:00Z`);
  const last=new Date(`${end}T00:00:00Z`);
  if(Number.isNaN(first.getTime())||Number.isNaN(last.getTime())||first>last){
    return {estimate:'请检查开始和结束日期',error:'开始日期不能晚于结束日期'};
  }
  let serviceDate='';
  for(const cursor=new Date(first);cursor<=last;cursor.setUTCDate(cursor.getUTCDate()+1)){
    const weekday=cursor.getUTCDay()||7;
    if(weekdays.includes(weekday)){serviceDate=cursor.toISOString().slice(0,10);break;}
  }
  if(!serviceDate){
    return {estimate:'日期范围内没有符合星期设置的班次',error:'日期范围内没有符合星期设置的班次'};
  }
  const cutoff=new Date(new Date(`${serviceDate}T${time}:00+09:00`).getTime()-hours*60*60*1000);
  const cutoffText=displayJapanDateTime(cutoff.toISOString());
  const estimate=start===end?cutoffText:`最早 ${cutoffText}（各班次独立计算）`;
  if(!salesOpen)return {estimate,error:''};
  const salesOpenInstant=new Date(`${salesOpen}:00+09:00`);
  if(Number.isNaN(salesOpenInstant.getTime()))return {estimate,error:'请检查开始销售时间'};
  const error=salesOpenInstant>=cutoff
    ? `开始销售时间 ${displayJapanDateTime(salesOpenInstant.toISOString())} 必须早于最早销售截止时间 ${cutoffText}`
    : '';
  return {estimate,error};
};
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
  meetingTemplateId: String(form.get("meetingTemplateId"))||null,
  meetingName: String(form.get("meetingName")),
  meetingAddress: String(form.get("meetingAddress")),
  mapLat: Number(form.get("mapLat")),
  mapLng: Number(form.get("mapLng")),
  meetingInstruction: String(form.get("meetingInstruction")),
});
export function DepartureCenter({view='calendar'}:{view?:'calendar'|'pricing'}) {
  const { services } = useApp();
  const [searchParams,setSearchParams]=useSearchParams();
  const selectedDate=searchParams.get('date')??'';
  const statusFilter=searchParams.get('status')??'all';
  const routeFilter=searchParams.get('route')??'';
  const month=searchParams.get('month') || selectedDate.slice(0,7) || currentJapanMonth();
  const selectedDeparture=searchParams.get('departure')??'';
  const dispatchMode=searchParams.get('dispatch')??'';
  const groupChangeId=searchParams.get('groupChange')??'';
  const updateFilter=(key:string,value:string)=>{const next=new URLSearchParams(searchParams);if(value&&value!=='all')next.set(key,value);else next.delete(key);setSearchParams(next,{replace:true})};
  const [products, setProducts] = useState<OperationsProduct[]>([]);
  const [selectedProductId,setSelectedProductId]=useState('');
  const [meetingPoints,setMeetingPoints]=useState<OperationsMeetingPointTemplate[]>([]);
  const [selectedMeetingPointId,setSelectedMeetingPointId]=useState('');
  const [cutoffValidation,setCutoffValidation]=useState<CutoffValidation>({estimate:'请先填写日期、星期、出发时间和截止小时',error:''});
  const [departures, setDepartures] = useState<OperationsEditableDeparture[]>(
    [],
  );
  const [calendarDepartures, setCalendarDepartures] = useState<OperationsCalendarDeparture[]>([]);
  const [loadedCalendarRequest, setLoadedCalendarRequest] = useState<{
    services: typeof services;
    month: string;
    selectedDeparture: string;
  } | null>(null);
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
  const publishedProducts=useMemo(
    ()=>products.filter(item=>item.status==='published'&&item.publishedRevision!=null),
    [products],
  );
  const invalidateProductSelection=useCallback(()=>{
    setSelectedProductId('');
    setPreview([]);
    setRequest(null);
    setNotice('该产品已下架，请重新选择产品');
  },[]);
  const verifyPublishedProduct=useCallback(async(productId:string)=>{
    if(!services||!productId)return false;
    const result=await services.operations.listProducts();
    if(result.error){setNotice(`无法确认产品状态：${result.error}`);return false;}
    setProducts(result.data);
    if(!result.data.some(item=>item.id===productId&&item.status==='published'&&item.publishedRevision!=null)){
      invalidateProductSelection();
      return false;
    }
    return true;
  },[services,invalidateProductSelection]);
  const selectProduct=(productId:string)=>{
    setSelectedProductId(productId);
    setPreview([]);
    setRequest(null);
    setNotice('');
  };
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
    const calendarWindow=monthRange(month);
    if (services)
      void Promise.all([
        services.operations.listProducts(),
        services.operations.listDepartureCalendar(calendarWindow.from,calendarWindow.to),
        services.operations.listMeetingPointTemplates(false),
      ]).then(([productResult, departureResult,meetingPointResult]) => {
        if (!active) return;
        setProducts(productResult.data);
        setDepartures(departureResult.data);
        setCalendarDepartures(departureResult.data);
        setMeetingPoints(meetingPointResult.data);
        setEditing(departureResult.data.find(item=>item.id===selectedDeparture)??null);
        setNotice(productResult.error ?? meetingPointResult.error ?? "");
        setCalendarError(departureResult.error ?? "");
        setLoadedCalendarRequest({services, month, selectedDeparture});
      });
    return () => {
      active = false;
    };
  }, [services,month,selectedDeparture]);
  useEffect(()=>{
    if(!services)return;
    const refresh=()=>{void services.operations.listProducts().then(result=>{if(!result.error)setProducts(result.data);});};
    window.addEventListener('focus',refresh);
    return()=>window.removeEventListener('focus',refresh);
  },[services]);
  useEffect(()=>{
    if(selectedProductId&&!publishedProducts.some(item=>item.id===selectedProductId))invalidateProductSelection();
  },[products,publishedProducts,selectedProductId,invalidateProductSelection]);
  const loadingCalendar = Boolean(services) && (
    loadedCalendarRequest?.services !== services
    || loadedCalendarRequest?.month !== month
    || loadedCalendarRequest?.selectedDeparture !== selectedDeparture
  );
  useEffect(() => {
    let active = true;
    if (!services || (!groupChangeId && dispatchMode !== 'manual') || !selectedDeparture) return () => {active = false;};
    const window = monthRange(month);
    void services.operations.loadSnapshot(window.from, window.to).then((result) => {if (active) {setResources(result.data); setResourceError(result.error ?? '');}});
    return () => {active = false;};
  }, [services, dispatchMode, groupChangeId, selectedDeparture, month]);
  const visibleDepartures=departures.filter(item=>statusFilter==='all'||item.status===statusFilter);
  const selectedMeetingPoint=meetingPoints.find(item=>item.id===selectedMeetingPointId)??null;
  const onPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services) return;
    const form=new FormData(event.currentTarget);
    const validation=validateCutoff(form);
    setCutoffValidation(validation);
    if(validation.error){
      setPreview([]);
      setRequest(null);
      setNotice(`预览失败：${validation.error}`);
      return;
    }
    const productId=String(form.get('tripId')??'');
    if(!productId){setNotice('请选择已上架产品');return;}
    const input = {
      ...values(new FormData(event.currentTarget)),
      operationId: uuid(),
    };
    setBusy(true);
    if(!await verifyPublishedProduct(productId)){setBusy(false);return;}
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
    const productId=String(request.tripId??'');
    if(!await verifyPublishedProduct(productId)){setBusy(false);return;}
    const result = await services.operations.createDepartureBatch(
      request as Parameters<typeof services.operations.createDepartureBatch>[0],
    );
    setBusy(false);
    if(result.error?.includes('产品尚未发布'))invalidateProductSelection();
    else setNotice(result.error?`创建失败：${result.error}`:`创建完成：${JSON.stringify(result.data)}`);
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
    if (!services || !editing) return false;
    setBusy(true);
    const result = await services.operations.saveDispatchPlan(editing.id, tasks);
    setNotice(result.ok ? '配车草稿已保存并重新读取；尚未确认派单、公开车辆或发送通知。' : `配车草稿保存失败：${result.error ?? '未知错误'}`);
    if (result.ok) await reloadDepartures();
    setBusy(false);
    return result.ok;
  };
  const loadGroupChangeHistory=useCallback(async(groupId:string)=>services?services.operations.listVehicleGroupChanges(groupId):{data:[],error:'运营数据服务未配置'},[services]);
  const requestGroupChange=useCallback(async(input:Parameters<NonNullable<typeof services>['operations']['requestVehicleGroupChange']>[0])=>services?services.operations.requestVehicleGroupChange(input):{ok:false,id:null,error:'运营数据服务未配置'},[services]);
  const applyGroupChange=useCallback(async(requestId:string)=>services?services.operations.applyVehicleGroupChange(requestId):{ok:false,data:null,error:'运营数据服务未配置'},[services]);
  const retryGroupChangeNotification=useCallback(async(requestId:string)=>services?services.operations.retryVehicleGroupChangeNotification(requestId):{ok:false,error:'运营数据服务未配置'},[services]);
  const changeTarget=calendarDepartures.flatMap(departure=>departure.vehicles.map(vehicle=>({departure,vehicle}))).find(item=>item.vehicle.vehicleGroupId===groupChangeId);
  return (
    <main className="operations-page">
      <header className="departure-calendar-page-head">
        <div>
          <span>产品与班次 / {view==='pricing'?'价格与销售时间':'班次日历'}</span>
          <h1>{view==='pricing'?'价格与销售时间':'班次日历'}</h1>
        </div>
        <Link className="button secondary" to="/app/operations">
          返回工作台
        </Link>
      </header>
      <section className="operations-section departure-calendar-section">
        {view==='pricing'&&<p className="operations-hint">此页只管理每席价格、销售开始/截止与销售状态；日期、班次、报名人数、余位和运行状态请在「班次日历」处理。</p>}
        {view==='calendar'&&
        <div className="departure-calendar-toolbar"><div><button type="button" onClick={() => updateFilter('month', shiftMonth(month, -1))}>上个月</button><button type="button" onClick={() => updateFilter('month', currentJapanMonth())}>本月</button><button type="button" onClick={() => updateFilter('month', shiftMonth(month, 1))}>下个月</button></div><strong>{month.replace('-', '年')}月</strong><label>状态<select value={statusFilter} onChange={event=>updateFilter('status',event.target.value)}><option value="all">全部状态</option><option value="open">销售中</option><option value="closed">停售</option><option value="cancelled">已取消</option><option value="draft">草稿</option></select></label></div>}
        {view==='calendar'&&(loadingCalendar ? <p className="operations-empty">正在读取班次月历…</p> : calendarError ? <p className="operations-error">{calendarError}</p> : <DepartureMonthCalendar key={`calendar:${month}:${editing?.id ?? ''}:${dispatchMode}`} month={month} departures={calendarDepartures.filter(item=>statusFilter==='all'||item.status===statusFilter)} selectedRoute={routeFilter} selectedDeparture={editing?.id ?? ''} openSelected={dispatchMode !== 'manual'&&!groupChangeId} onRouteChange={(value) => updateFilter('route', value)} onSelect={(item) => {setEditing(item);updateFilter('departure', item.id);}} onChangeVehicleGroup={(departure,vehicle:OperationsDepartureVehicle)=>{setEditing(departure);const next=new URLSearchParams(searchParams);next.set('departure',departure.id);next.set('groupChange',vehicle.vehicleGroupId??'');next.delete('dispatch');setSearchParams(next,{replace:true})}} />)}
        {view==='pricing'&&!loadingCalendar&&!calendarError&&<div className="operations-table-scroll"><table className="operations-table"><thead><tr><th>班次</th><th>基础价格</th><th>销售开始</th><th>销售截止</th><th>销售状态</th><th/></tr></thead><tbody>{visibleDepartures.map(item=><tr key={item.id}><td>{item.tripTitle}<small>{local(item.departsAt)}</small></td><td>¥{item.price}</td><td>{local(item.salesOpenAt)}</td><td>{local(item.salesCloseAt)}</td><td>{item.status}</td><td><button type="button" onClick={()=>{setEditing(item);updateFilter('departure',item.id);}}>编辑价格</button></td></tr>)}</tbody></table></div>}
        {!loadingCalendar&&!calendarError&&visibleDepartures.length===0&&<p className="operations-empty">当前月份和状态范围内没有班次。</p>}
        {view==='calendar'&&dispatchMode === 'manual' && editing && (resourceError ? <p className="operations-error">配车资源读取失败：{resourceError}</p> : resources ? <ManualDispatchPanel key={`dispatch:${editing.id}:${editing.version}`} departure={calendarDepartures.find((item) => item.id === editing.id) ?? editing as OperationsCalendarDeparture} snapshot={resources} busy={busy} onSave={saveDispatch} onClose={() => updateFilter('dispatch', '')} /> : <p className="operations-empty">正在读取车辆与司机资源…</p>)}
        {groupChangeId&&(resourceError?<p className="operations-error">变更资源读取失败：{resourceError}</p>:resources&&changeTarget?<ConfirmedVehicleGroupChangeDialog key={`change:${groupChangeId}:${changeTarget.vehicle.groupVersion??1}`} departure={changeTarget.departure} vehicle={changeTarget.vehicle} snapshot={resources} onClose={()=>updateFilter('groupChange','')} onLoadHistory={loadGroupChangeHistory} onRequest={requestGroupChange} onApply={applyGroupChange} onRetryNotification={retryGroupChangeNotification} onApplied={reloadDepartures}/>:resources&&!loadingCalendar?<p className="operations-error">旅行团不存在、已完成或已不允许变更。</p>:<p className="operations-empty">正在读取旅行团变更资料…</p>)}
        {editing && (
          <form
            key={`${editing.id}:${editing.version}`}
            className={`operations-controls${view==='pricing'?' departure-pricing-form':''}`}
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
              手动修改集合信息只会更新该班次快照，不会修改集合地点模板。
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
      {view==='calendar'&&<section className="operations-section">
        <header>
          <div>
            <span>批量建班</span>
            <h2>创建新班次</h2>
          </div>
        </header>
        <form
          className="operations-controls"
          onSubmit={onPreview}
          onChange={(event) => {
            const form=event.currentTarget;
            const field=event.target as unknown as HTMLInputElement;
            if(field.name==='meetingTemplateId')setSelectedMeetingPointId(field.value);
            setCutoffValidation(validateCutoff(new FormData(form)));
            if (request) {
              setPreview([]);
              setRequest(null);
              setNotice("表单内容已修改，旧预览已失效，请重新生成预览。");
            }
          }}
        >
          <label>
            产品
            <select name="tripId" required value={selectedProductId} onChange={event=>selectProduct(event.target.value)}>
              <option value="" disabled>请选择已上架产品</option>
              {publishedProducts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          {publishedProducts.length===0&&<p className="operations-control-wide operations-empty">暂无已上架产品，请先到产品管理完成发布。 <Link to="/app/operations/products">前往产品管理</Link></p>}
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
          <label>预计销售截止<input value={cutoffValidation.estimate} readOnly aria-label="预计销售截止"/></label>
          {cutoffValidation.error&&<p className="departure-cutoff-error" role="alert">{cutoffValidation.error}</p>}
          <label>集合地点<select name="meetingTemplateId" value={selectedMeetingPointId} onChange={()=>undefined} required><option value="">请选择集合地点</option>{meetingPoints.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="meeting-point-create-link"><Link to="/app/operations/meeting-points">＋ 新增集合地点</Link></div>
          {selectedMeetingPoint&&<div className="meeting-point-summary" data-testid="meeting-point-summary"><b>{selectedMeetingPoint.name}</b><span>{selectedMeetingPoint.address}</span><span>{selectedMeetingPoint.latitude} / {selectedMeetingPoint.longitude}</span>{selectedMeetingPoint.meetingNote&&<small>{selectedMeetingPoint.meetingNote}</small>}</div>}
          <input type="hidden" name="meetingName" value={selectedMeetingPoint?.name??''}/>
          <input type="hidden" name="meetingAddress" value={selectedMeetingPoint?.address??''}/>
          <input type="hidden" name="mapLat" value={selectedMeetingPoint?.latitude??''}/>
          <input type="hidden" name="mapLng" value={selectedMeetingPoint?.longitude??''}/>
          <input type="hidden" name="meetingInstruction" value={selectedMeetingPoint?.meetingNote??''}/>
          <button className="button" disabled={busy||Boolean(cutoffValidation.error)||!selectedProductId||publishedProducts.length===0}>
            生成预览
          </button>
        </form>
      </section>}
      {notice && <p className="operations-notice" style={{whiteSpace:'pre-wrap'}}>{notice}</p>}
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
                <div><b>{String(item.serviceDate)}</b><span>{displayJapanDateTime(item.departsAt)} 出发</span></div>
                <div className="departure-preview-details">
                  <span><small>价格</small><b>¥{String(item.price)}</b></span>
                  <span><small>开始销售</small><b>{displayJapanDateTime(item.salesOpenAt)}</b></span>
                  <span><small>销售截止</small><b>{displayJapanDateTime(item.salesCloseAt)}</b></span>
                  <span><small>集合地点</small><b>{String(item.meetingName??'—')}</b></span>
                  <span><small>集合地址</small><b>{String(item.meetingAddress??'—')}</b></span>
                </div>
                <small>{item.duplicate ? "已存在，将跳过" : "可创建"}</small>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
