import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {DepartureCenter} from '../src/app/operations/DepartureCenter';
import {AppProvider} from '../src/app/store';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';
import type {OperationsCalendarDeparture, OperationsSnapshot} from '../src/shared/integrations/supabaseOperations';

afterEach(cleanup);
const departure: OperationsCalendarDeparture = {id: 'dep-1', tripId: 'trip-1', tripTitle: '测试班次', departsAt: '2026-09-18T00:00:00Z', endsAt: '2026-09-18T10:00:00Z', price: 7000, capacity: 45, salesOpenAt: '2026-08-01T00:00:00Z', salesCloseAt: '2026-09-17T00:00:00Z', bookingClosesAt: '2026-09-17T00:00:00Z', status: 'open', version: 1, committedSeats: 40, paidPassengers: 40, paidOrders: 12, meetingName: '大阪站', meetingAddress: '大阪市测试地址', mapLat: 34.7, mapLng: 135.5, dispatchPlanningStatus: 'ready_for_planning', vehicles: []};
const snapshot = {vehicleTypes: [], vehicles: [{id: 'vehicle-45', registration_identifier: '大阪45', vehicle_type_key: 'bus', external_dispatch_id: null, status: 'available', model_name: '大型巴士', sellable_capacity: 45}], drivers: [{id: 'driver-1', display_name: '测试司机', external_dispatch_id: null, languages: ['zh-CN'], status: 'available', driver_vehicle_qualifications: [{vehicle_type_key: 'bus'}], driver_availability_windows: []}], departures: [], bookingDrafts: [], fulfilmentWorkItems: [], notificationDeliveryIssues: [], dispatchTasks: [], dispatchDrafts: 0, loadedAt: '2026-09-13T00:00:00Z'} as unknown as OperationsSnapshot;

it('手动配车保存后重新读取月历且仍停留在真实班次', async () => {
  const saved = {...departure, dispatchPlanningStatus: 'planned', vehicles: [{assignmentId: 'assignment-1', sequence: 1, plannedPassengers: 40, assignmentCapacity: 45, vehicleType: 'bus', vehicleLabel: null, taskId: 'task-1', taskStatus: 'draft', driverId: 'driver-1', vehicleId: 'vehicle-45', startsAt: departure.departsAt, endsAt: departure.endsAt, vehicleCode: '大阪45', vehicleModel: '大型巴士', sellableCapacity: 45, driverName: '测试司机'}]};
  const listDepartureCalendar = vi.fn().mockResolvedValueOnce({data: [departure], error: null}).mockResolvedValue({data: [saved], error: null});
  const saveDispatchPlan = vi.fn(async () => ({ok: true, error: null}));
  const services = {operations: {listProducts: vi.fn(async () => ({data: [], error: null})), listDepartureCalendar, loadSnapshot: vi.fn(async () => ({data: snapshot, error: null})), saveDispatchPlan}, loadSellableDepartures: async () => ({data: [], error: null}), onAuthStateChange: () => () => {}, currentUser: async () => null} as unknown as ProductionBrowserServices;
  render(<MemoryRouter initialEntries={['/app/operations/departures?month=2026-09&departure=dep-1&dispatch=manual']}><AppProvider services={services}><DepartureCenter /></AppProvider></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('第1辆车'), {target: {value: 'vehicle-45'}});
  fireEvent.change(screen.getByLabelText('第1辆司机'), {target: {value: 'driver-1'}});
  fireEvent.click(screen.getByRole('button', {name: '保存配车草稿'}));
  await vi.waitFor(() => expect(saveDispatchPlan).toHaveBeenCalledWith('dep-1', [expect.objectContaining({capacity: 45, passengerCount: 40, fleetVehicleId: 'vehicle-45'})]));
  await vi.waitFor(() => expect(listDepartureCalendar).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(/配车草稿已保存并重新读取/)).toBeInTheDocument();
  expect(screen.getByRole('heading', {name: '测试班次', level: 2})).toBeInTheDocument();
});
