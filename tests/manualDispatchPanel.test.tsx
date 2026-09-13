import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {ManualDispatchPanel} from '../src/app/operations/ManualDispatchPanel';
import type {DispatchPlanDraft, OperationsCalendarDeparture, OperationsSnapshot} from '../src/shared/integrations/supabaseOperations';

afterEach(cleanup);
const departure: OperationsCalendarDeparture = {id: 'dep-1', tripId: 'trip-1', tripTitle: '测试班次', departsAt: '2026-09-18T00:00:00Z', endsAt: '2026-09-18T10:00:00Z', price: 7000, capacity: 60, salesOpenAt: '2026-08-01T00:00:00Z', salesCloseAt: '2026-09-17T00:00:00Z', bookingClosesAt: '2026-09-17T00:00:00Z', status: 'open', version: 1, committedSeats: 40, paidPassengers: 40, paidOrders: 12, meetingName: '大阪站', meetingAddress: '大阪市', mapLat: 34.7, mapLng: 135.5, dispatchPlanningStatus: 'ready_for_planning', vehicles: []};
const snapshot = {vehicleTypes: [], vehicles: [
  {id: 'vehicle-45', registration_identifier: '大阪45', vehicle_type_key: 'bus', external_dispatch_id: null, status: 'available', model_name: '大型巴士', sellable_capacity: 45},
  {id: 'vehicle-14', registration_identifier: '大阪14', vehicle_type_key: 'van', external_dispatch_id: null, status: 'available', model_name: '海狮', sellable_capacity: 14},
], drivers: [
  {id: 'driver-bus', display_name: '巴士司机', external_dispatch_id: null, languages: ['zh-CN'], status: 'available', driver_vehicle_qualifications: [{vehicle_type_key: 'bus'}], driver_availability_windows: []},
  {id: 'driver-van', display_name: '小车司机', external_dispatch_id: null, languages: ['zh-CN'], status: 'available', driver_vehicle_qualifications: [{vehicle_type_key: 'van'}], driver_availability_windows: []},
], departures: [], bookingDrafts: [], fulfilmentWorkItems: [], notificationDeliveryIssues: [], accountDeletionRequests: [], cancellationRequests: [], staffApplications: [], staffLeaveRequests: [], dispatchTasks: [], dispatchDrafts: 0, loadedAt: '2026-09-13T00:00:00Z'} as unknown as OperationsSnapshot;

it('45席实车可计划40人并保存真实车型容量，不触发确认或通知', async () => {
  const onSave = vi.fn<(tasks: DispatchPlanDraft[]) => Promise<void>>(async () => {});
  render(<ManualDispatchPanel departure={departure} snapshot={snapshot} busy={false} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('第1辆车'), {target: {value: 'vehicle-45'}});
  fireEvent.change(screen.getByLabelText('第1辆司机'), {target: {value: 'driver-bus'}});
  fireEvent.click(screen.getByRole('button', {name: '保存配车草稿'}));
  await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0]).toEqual([expect.objectContaining({sequence: 1, vehicleType: 'bus', capacity: 45, passengerCount: 40, fleetVehicleId: 'vehicle-45', driverId: 'driver-bus', planningSource: 'manual_override'})]);
  expect(screen.getByText(/不确认派单、不公开车辆、不发送通知/)).toBeInTheDocument();
});

it('支持新增下一辆并阻止超过已付款人数、实车容量和重复资源', () => {
  render(<ManualDispatchPanel departure={departure} snapshot={snapshot} busy={false} onSave={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('第1辆车'), {target: {value: 'vehicle-14'}});
  fireEvent.change(screen.getByLabelText('第1辆司机'), {target: {value: 'driver-van'}});
  fireEvent.change(screen.getByLabelText('第1辆计划人数'), {target: {value: '30'}});
  fireEvent.click(screen.getByRole('button', {name: '新增下一辆'}));
  fireEvent.change(screen.getByLabelText('第2辆车'), {target: {value: 'vehicle-14'}});
  fireEvent.change(screen.getByLabelText('第2辆司机'), {target: {value: 'driver-van'}});
  fireEvent.change(screen.getByLabelText('第2辆计划人数'), {target: {value: '20'}});
  expect(screen.getByRole('alert')).toHaveTextContent('超过实车可售 14 席');
  expect(screen.getByRole('alert')).toHaveTextContent('重复选择车辆');
  expect(screen.getByRole('alert')).toHaveTextContent('重复选择司机');
  expect(screen.getByRole('alert')).toHaveTextContent('超过计划人数 40 人');
  expect(screen.getByRole('button', {name: '保存配车草稿'})).toBeDisabled();
});
