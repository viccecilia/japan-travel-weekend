import type {OperationsCalendarDeparture} from '../../shared/integrations/supabaseOperations';

export const japanDateKey = (value: string | Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(typeof value === 'string' ? new Date(value) : value);

export const currentJapanMonth = (now = new Date()) => japanDateKey(now).slice(0, 7);

export function shiftMonth(month: string, offset: number) {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(month: string) {
  const [year, value] = shiftMonth(month, 1).split('-').map(Number);
  const last = new Date(Date.UTC(year, value - 1, 0)).toISOString().slice(0, 10);
  return {from: `${month}-01`, to: last};
}

export type CalendarDay = {key: string; day: number; inMonth: boolean};
export function calendarDays(month: string): CalendarDay[] {
  const [year, value] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, value - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first); start.setUTCDate(start.getUTCDate() - mondayOffset);
  const result: CalendarDay[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start); date.setUTCDate(start.getUTCDate() + index);
    result.push({key: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: date.getUTCMonth() === value - 1});
  }
  return result;
}

const colors = ['#e76f51', '#2a9d8f', '#457b9d', '#8f5aa8', '#d39b2a', '#5f7f49', '#c85f84', '#4b6cb7'];
const icons = ['◆', '●', '▲', '■', '✦', '⬟', '◇', '✚'];
export function routeLegend(departures: OperationsCalendarDeparture[]) {
  const routes = [...new Map(departures.map((item) => [item.tripId, item.tripTitle])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1], 'zh-CN'));
  return routes.map(([id, title], index) => ({id, title, color: colors[index % colors.length], icon: icons[index % icons.length]}));
}

export function vehicleCodes(item: OperationsCalendarDeparture) {
  return item.vehicles
    .filter((vehicle) => vehicle.taskStatus !== 'cancelled')
    .map((vehicle) => vehicle.vehicleCode || vehicle.vehicleLabel)
    .filter((value): value is string => Boolean(value));
}
