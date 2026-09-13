import type {CSSProperties} from 'react';
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
          return <button type="button" className={`departure-calendar-event${selectedDeparture === item.id ? ' selected' : ''}${passengerFinal ? ' passenger-final' : ''}`} style={{'--route-color': route?.color ?? '#457b9d'} as CSSProperties} key={item.id} title={`${item.tripTitle} · ${timeText(item.departsAt)} · ${item.paidPassengers}人 · ${codes.join('、') || '未配车'}`} aria-label={`${item.tripTitle} ${timeText(item.departsAt)} ${item.paidPassengers}人 ${codes.join('、') || '未配车'}`} onClick={() => onSelect(item)}>
            <b aria-hidden="true">{route?.icon ?? '◆'}</b><span>{item.paidPassengers}</span><small>{codes.join(' ') || '—'}</small>
          </button>;
        })}</div>
      </section>)}
    </div>
    <div className="departure-calendar-key"><span><i className="passenger-line" />人数截止已确定</span><span><i className="vehicle-dot" />车辆状态见班次详情</span></div>
  </>;
}
