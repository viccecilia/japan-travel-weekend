import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {DepartureMonthCalendar} from '../src/app/operations/DepartureMonthCalendar';
import {calendarDays, monthRange, shiftMonth, vehicleCodes} from '../src/app/operations/departureCalendar';
import type {OperationsCalendarDeparture} from '../src/shared/integrations/supabaseOperations';

afterEach(cleanup);
const departure = (patch: Partial<OperationsCalendarDeparture> = {}): OperationsCalendarDeparture => ({
  id: 'departure-1', tripId: 'trip-1', tripTitle: '京都与奈良', departsAt: '2026-09-18T00:00:00Z', endsAt: '2026-09-18T10:00:00Z',
  price: 7000, capacity: 45, salesOpenAt: '2026-08-01T00:00:00Z', salesCloseAt: '2026-09-17T00:00:00Z', bookingClosesAt: '2026-09-17T00:00:00Z', status: 'open', version: 2,
  committedSeats: 12, paidPassengers: 12, paidOrders: 4, meetingName: '大阪站', meetingAddress: '大阪市', mapLat: 34.7, mapLng: 135.5, dispatchPlanningStatus: 'planned',
  vehicles: [{assignmentId: 'a-1', sequence: 1, plannedPassengers: 12, assignmentCapacity: 45, vehicleType: 'bus', vehicleLabel: 'A01', taskId: 'task-1', taskStatus: 'draft', driverId: 'driver-1', vehicleId: 'vehicle-1', startsAt: null, endsAt: null, vehicleCode: 'なにわ100', vehicleModel: 'Coaster', sellableCapacity: 21, driverName: '测试司机'}],
  ...patch,
});

describe('紧凑班次月历', () => {
  it('按周一开头生成完整月历并正确切换跨年月份', () => {
    expect(calendarDays('2026-09')).toHaveLength(42);
    expect(calendarDays('2026-09')[0].key).toBe('2026-08-31');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthRange('2026-02')).toEqual({from: '2026-02-01', to: '2026-02-28'});
  });

  it('日期格不重复路线名或付字，只显示图标、真实人数和车辆代码', () => {
    render(<DepartureMonthCalendar month="2026-09" departures={[departure()]} selectedRoute="" selectedDeparture="" onRouteChange={vi.fn()} onSelect={vi.fn()} />);
    const event = screen.getByRole('button', {name: /京都与奈良 09:00 12人 なにわ100/});
    expect(event).toHaveTextContent('12');
    expect(event).toHaveTextContent('なにわ100');
    expect(event).not.toHaveTextContent('京都与奈良');
    expect(event).not.toHaveTextContent('付');
  });

  it('路线图例可筛选且班次点击使用真实ID对象', () => {
    const onRouteChange = vi.fn(); const onSelect = vi.fn(); const item = departure();
    render(<DepartureMonthCalendar month="2026-09" departures={[item]} selectedRoute="" selectedDeparture="" onRouteChange={onRouteChange} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', {name: /^◆京都与奈良$/}));
    expect(onRouteChange).toHaveBeenCalledWith('trip-1');
    fireEvent.click(screen.getByRole('button', {name: /京都与奈良 09:00/}));
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it('取消任务不显示为当前配车代码', () => {
    expect(vehicleCodes(departure({vehicles: [{...departure().vehicles[0], taskStatus: 'cancelled'}]}))).toEqual([]);
  });

  it('浮层逐辆展示车型车牌司机和计划人数，并保留真实深链', () => {
    const item = departure({vehicles: [departure().vehicles[0], {...departure().vehicles[0], assignmentId: 'a-2', sequence: 2, vehicleCode: '大阪200', driverName: '第二司机', plannedPassengers: 9, sellableCapacity: 14}]});
    render(<MemoryRouter><DepartureMonthCalendar month="2026-09" departures={[item]} selectedRoute="trip-1" selectedDeparture="departure-1" onRouteChange={vi.fn()} onSelect={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('dialog', {name: '京都与奈良'})).toBeInTheDocument();
    expect(screen.getByText(/1号车 · なにわ100/)).toBeInTheDocument();
    expect(screen.getByText(/2号车 · 大阪200/)).toBeInTheDocument();
    expect(screen.getByText(/计划 9 人 \/ 实车可售 14 席/)).toBeInTheDocument();
    expect(screen.getByRole('link', {name: '进入运行详情'})).toHaveAttribute('href', '/app/operations/run?date=2026-09-18&departure=departure-1');
    expect(screen.getByRole('link', {name: '手动配车'})).toHaveAttribute('href', '/app/operations/departures?month=2026-09&route=trip-1&departure=departure-1&dispatch=manual');
  });
});
