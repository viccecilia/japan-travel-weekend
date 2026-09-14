import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ConfirmedVehicleGroupChangeDialog} from '../src/app/operations/ConfirmedVehicleGroupChangeDialog';
import type {OperationsCalendarDeparture,OperationsSnapshot,OperationsVehicleGroupChange} from '../src/shared/integrations/supabaseOperations';

afterEach(cleanup);
HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true});
HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false});

const departure={id:'dep',tripId:'trip',tripTitle:'隔离测试班次',departsAt:'2026-10-01T00:00:00Z',endsAt:'2026-10-01T10:00:00Z',price:7000,capacity:9,salesOpenAt:'2026-09-01T00:00:00Z',salesCloseAt:'2026-09-30T00:00:00Z',bookingClosesAt:'2026-09-30T00:00:00Z',status:'closed',version:2,committedSeats:4,paidPassengers:4,paidOrders:2,meetingName:'测试集合点',meetingAddress:'测试地址',mapLat:34.6,mapLng:135.5,dispatchPlanningStatus:'confirmed',vehicles:[]} as OperationsCalendarDeparture;
const vehicle={assignmentId:'assignment',sequence:1,plannedPassengers:4,bookedPassengers:4,assignmentCapacity:9,vehicleType:'hiace',vehicleLabel:'旧车',taskId:'task',taskStatus:'confirmed',driverId:'driver-old',vehicleId:'vehicle-old',startsAt:departure.departsAt,endsAt:departure.endsAt,vehicleCode:'旧车',vehicleModel:'Hiace',sellableCapacity:9,driverName:'旧司机',vehicleGroupId:'group',roomId:'room',groupVersion:1,journeyStatus:'pending'};
const snapshot={vehicleTypes:[],vehicles:[{id:'vehicle-old',registration_identifier:'旧车',vehicle_type_key:'hiace',external_dispatch_id:null,status:'assigned',model_name:'Hiace',sellable_capacity:9},{id:'vehicle-new',registration_identifier:'新车',vehicle_type_key:'hiace',external_dispatch_id:null,status:'available',model_name:'Hiace',sellable_capacity:9}],drivers:[{id:'driver-old',display_name:'旧司机',external_dispatch_id:null,languages:['zh-CN'],status:'available',driver_vehicle_qualifications:[{vehicle_type_key:'hiace'}],driver_availability_windows:[]},{id:'driver-new',display_name:'新司机',external_dispatch_id:null,languages:['zh-CN'],status:'available',driver_vehicle_qualifications:[{vehicle_type_key:'hiace'}],driver_availability_windows:[]}],departures:[],bookingDrafts:[],fulfilmentWorkItems:[],notificationDeliveryIssues:[],dispatchTasks:[],dispatchDrafts:0,loadedAt:'2026-09-14T00:00:00Z'} as unknown as OperationsSnapshot;
const request=(status:'pending'|'applied'):OperationsVehicleGroupChange=>({id:'request',vehicleGroupId:'group',expectedGroupVersion:1,status,reason:'车辆临时检修需更换',priorVehicleId:'vehicle-old',priorVehicleCode:'旧车',requestedVehicleId:'vehicle-new',requestedVehicleCode:'新车',priorDriverId:'driver-old',priorDriverName:'旧司机',requestedDriverId:'driver-new',requestedDriverName:'新司机',requestedAt:'2026-09-14T00:00:00Z',appliedAt:status==='applied'?'2026-09-14T00:05:00Z':null,appliedGroupVersion:status==='applied'?2:null,notificationStatus:status==='applied'?'pending':'not_requested',notificationAttempts:status==='applied'?1:0,notificationLastError:null});

it('先保存申请且保留原安排，再确认原子应用并刷新',async()=>{
  const onLoadHistory=vi.fn().mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:[request('pending')],error:null}).mockResolvedValue({data:[request('applied')],error:null});
  const onRequest=vi.fn(async()=>({ok:true,id:'request',error:null}));
  const onApply=vi.fn(async()=>({ok:true,error:null}));
  const onApplied=vi.fn(async()=>undefined);
  render(<ConfirmedVehicleGroupChangeDialog departure={departure} vehicle={vehicle} snapshot={snapshot} onClose={vi.fn()} onLoadHistory={onLoadHistory} onRequest={onRequest} onApply={onApply} onRetryNotification={vi.fn()} onApplied={onApplied}/>);
  fireEvent.change(screen.getByLabelText('新车辆'),{target:{value:'vehicle-new'}});
  fireEvent.change(screen.getByLabelText('新司机'),{target:{value:'driver-new'}});
  fireEvent.change(screen.getByLabelText('变更原因'),{target:{value:'车辆临时检修需更换'}});
  fireEvent.click(screen.getByRole('button',{name:'保存变更申请'}));
  expect(await screen.findByText(/原车辆和司机仍然生效/)).toBeInTheDocument();
  expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({vehicleGroupId:'group',expectedGroupVersion:1,vehicleId:'vehicle-new',driverId:'driver-new'}));
  expect(screen.getByText('旧车')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'确认应用变更'}));
  expect(await screen.findByText(/旅行团、订单和群聊保持不变/)).toBeInTheDocument();
  expect(onApply).toHaveBeenCalledWith('request');
  expect(onApplied).toHaveBeenCalledOnce();
});

it('保存失败保留输入且不提供确认应用',async()=>{
  render(<ConfirmedVehicleGroupChangeDialog departure={departure} vehicle={vehicle} snapshot={snapshot} onClose={vi.fn()} onLoadHistory={vi.fn(async()=>({data:[],error:null}))} onRequest={vi.fn(async()=>({ok:false,id:null,error:'version conflict'}))} onApply={vi.fn()} onRetryNotification={vi.fn()} onApplied={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('新车辆'),{target:{value:'vehicle-new'}});
  fireEvent.change(screen.getByLabelText('新司机'),{target:{value:'driver-new'}});
  fireEvent.change(screen.getByLabelText('变更原因'),{target:{value:'车辆临时检修需更换'}});
  fireEvent.click(screen.getByRole('button',{name:'保存变更申请'}));
  expect(await screen.findByText(/原安排未改变/)).toBeInTheDocument();
  expect(screen.getByLabelText('变更原因')).toHaveValue('车辆临时检修需更换');
  expect(screen.queryByRole('button',{name:'确认应用变更'})).not.toBeInTheDocument();
});
