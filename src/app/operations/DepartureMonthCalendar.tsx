import {useEffect, useState, type CSSProperties} from 'react';
import {Link} from 'react-router-dom';
import type {OperationsCalendarDeparture} from '../../shared/integrations/supabaseOperations';
import {calendarDays, japanDateKey, routeLegend, vehicleCodes} from './departureCalendar';

const timeText = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));

export function DepartureMonthCalendar({month, departures, selectedRoute, selectedDeparture, onRouteChange, onSelect}: {
  month: string;
  departures: OperationsCalendarDeparture[];
  selectedRoute: string;
  selectedDeparture: string;
  onRouteChange: (value: string) => void;
  onSelect: (item: OperationsCalendarDeparture) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(Boolean(selectedDeparture));
  useEffect(() => { if (selectedDeparture) setPopoverOpen(true); }, [selectedDeparture]);
  const days = calendarDays(month);
  const legend = routeLegend(departures);
  const presentation = new Map(legend.map((item) => [item.id, item]));
  const visible = selectedRoute ? departures.filter((item) => item.tripId === selectedRoute) : departures;
  const grouped = new Map<string, OperationsCalendarDeparture[]>();
  visible.forEach((item) => { const key = japanDateKey(item.departsAt); grouped.set(key, [...(grouped.get(key) ?? []), item]); });
  const today = japanDateKey(new Date());
  return <>
    <div className="departure-route-legend" aria-label="路线筛选">
      <button type="button" className={!selectedRoute ? 'active' : ''} onClick={() => onRouteChange('')}>全部路线</button>
      {legend.map((item) => <button type="button" className={selectedRoute === item.id ? 'active' : ''} style={{'--route-color': item.color} as CSSProperties} key={item.id} onClick={() => onRouteChange(selectedRoute === item.id ? '' : item.id)}><span>{item.icon}</span>{item.title}</button>)}
    </div>
    <div className="departure-calendar" role="grid" aria-label={`${month} 班次月历`}>
      {['一', '二', '三', '四', '五', '六', '日'].map((day) => <div className="departure-calendar-weekday" role="columnheader" key={day}>周{day}</div>)}
      {days.map((day) => <section className={`departure-calendar-day${day.inMonth ? '' : ' outside'}${day.key === today ? ' today' : ''}`} role="gridcell" aria-label={day.key} key={day.key}>
        <header><time dateTime={day.key}>{day.day}</time>{day.key === today && <span>今天</span>}</header>
        <div className="departure-calendar-events">{(grouped.get(day.key) ?? []).map((item) => {
          const route = presentation.get(item.tripId); const codes = vehicleCodes(item); const passengerFinal = new Date(item.bookingClosesAt).getTime() <= Date.now();
          return <button type="button" className={`departure-calendar-event${selectedDeparture === item.id ? ' selected' : ''}${passengerFinal ? ' passenger-final' : ''}`} style={{'--route-color': route?.color ?? '#457b9d'} as CSSProperties} key={item.id} title={`${item.tripTitle} · ${timeText(item.departsAt)} · ${item.paidPassengers}人 · ${codes.join('、') || '未配车'}`} aria-label={`${item.tripTitle} ${timeText(item.departsAt)} ${item.paidPassengers}人 ${codes.join('、') || '未配车'}`} onClick={() => {setPopoverOpen(true); onSelect(item);}}>
            <b aria-hidden="true">{route?.icon ?? '◆'}</b><span>{item.paidPassengers}</span><small>{codes.join(' ') || '—'}</small>
          </button>;
        })}</div>
      </section>)}
    </div>
    <div className="departure-calendar-key"><span><i className="passenger-line" />人数截止已确定</span><span><i className="vehicle-dot" />车辆状态见班次详情</span></div>
    {popoverOpen && (() => { const item = departures.find((departure) => departure.id === selectedDeparture); if (!item) return null; const date = japanDateKey(item.departsAt); return <div className="departure-popover-backdrop" onMouseDown={(event) => {if (event.target === event.currentTarget) setPopoverOpen(false);}}><section className="departure-popover" role="dialog" aria-modal="true" aria-labelledby="departure-popover-title"><header><div><small>{date} · {timeText(item.departsAt)} 发车</small><h3 id="departure-popover-title">{item.tripTitle}</h3></div><button type="button" aria-label="关闭班次浮层" onClick={() => setPopoverOpen(false)}>×</button></header><div className="departure-popover-summary"><span><b>{item.paidPassengers}</b> 位已付款乘客</span><span>{item.dispatchPlanningStatus === 'confirmed' ? '车辆已确认' : item.vehicles.length ? '配车草稿' : '尚未配车'}</span><span>{item.status === 'cancelled' ? '已取消' : item.status === 'closed' ? '停售／仍需履约' : item.status}</span></div><div className="departure-popover-vehicles">{item.vehicles.length ? item.vehicles.map((vehicle) => <article key={vehicle.assignmentId}><strong>{vehicle.sequence}号车 · {vehicle.vehicleCode || vehicle.vehicleLabel || '车辆待选择'}</strong><span>{vehicle.vehicleModel || vehicle.vehicleType || '车型待确认'} · 司机 {vehicle.driverName || '待选择'}</span><small>计划 {vehicle.plannedPassengers} 人 / 实车可售 {vehicle.sellableCapacity ?? vehicle.assignmentCapacity} 席 · {vehicle.taskStatus || '未生成派单'}</small></article>) : <p className="operations-empty">本班尚未保存配车草稿。</p>}</div><footer><Link className="button secondary" to={`/app/operations/run?date=${date}&departure=${item.id}`}>进入运行详情</Link><Link className="button" to={`/app/operations/departures?month=${month}&route=${item.tripId}&departure=${item.id}&dispatch=manual`}>手动配车</Link></footer></section></div>; })()}
  </>;
}
