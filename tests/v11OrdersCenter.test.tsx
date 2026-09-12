import{describe,expect,it}from'vitest';
import{validateVehicleAllocations}from'../src/app/operations/OrdersCenter';
import type{OperationsVehicle}from'../src/shared/integrations/supabaseOperations';
const vehicles=[{id:'bus-45',registration_identifier:'TEST-45',vehicle_type_key:'bus45',status:'available'},{id:'bus-off',registration_identifier:'OFF',vehicle_type_key:'bus45',status:'inactive'}] as OperationsVehicle[];
const vehicleTypes=[{type_key:'bus45',label:'45席巴士',sellable_capacity:45,cost_units:1,active:true}];
describe('V11 逐辆配车约束',()=>{
 it('45席车辆允许只计划40人',()=>expect(validateVehicleAllocations({allocations:[{vehicleId:'bus-45',driverId:'driver-1',passengers:40}],plannedPassengers:40,vehicles,vehicleTypes})).toMatchObject({ok:true,total:40}));
 it('整单分配不得超过计划人数',()=>{const result=validateVehicleAllocations({allocations:[{vehicleId:'bus-45',driverId:'driver-1',passengers:41}],plannedPassengers:40,vehicles,vehicleTypes});expect(result.ok).toBe(false);expect(result.errors.join(' ')).toContain('超过计划人数')});
 it('单车分配不得超过车型核定席位',()=>{const result=validateVehicleAllocations({allocations:[{vehicleId:'bus-45',driverId:'driver-1',passengers:46}],plannedPassengers:50,vehicles,vehicleTypes});expect(result.ok).toBe(false);expect(result.errors.join(' ')).toContain('核定 45 席')});
 it('拒绝停用车辆和重复司机车辆',()=>{const result=validateVehicleAllocations({allocations:[{vehicleId:'bus-off',driverId:'driver-1',passengers:20},{vehicleId:'bus-off',driverId:'driver-1',passengers:20}],plannedPassengers:40,vehicles,vehicleTypes});expect(result.ok).toBe(false);expect(result.errors.join(' ')).toContain('不可用');expect(result.errors.join(' ')).toContain('重复选择车辆');expect(result.errors.join(' ')).toContain('重复选择司机')});
});
