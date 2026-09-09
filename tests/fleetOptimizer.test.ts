import {describe,expect,it} from 'vitest';
import {appConfig} from '../src/shared/config/businessRules';
import {optimizeFleet} from '../src/shared/operations/fleetOptimizer';

describe('成本优先车辆组合与顺序装载',()=>{
  it.each([[6,['vehicle-10']],[12,['vehicle-14']],[20,['vehicle-14','vehicle-10']],[50,['vehicle-14','vehicle-14','vehicle-14','vehicle-14']]] as const)('%i 人生成当前自动车型组合',(passengers,expected)=>expect(optimizeFleet(passengers,appConfig.fleetVehicleTypes,'dep').assignments.map(v=>v.vehicleType)).toEqual(expected));
  it('70 人只使用当前启用的10座与14座车',()=>{const plan=optimizeFleet(70,appConfig.fleetVehicleTypes,'dep');expect(plan.assignments.map(v=>v.booked)).toEqual([13,13,13,13,9,9]);expect(plan.totalCapacity).toBe(70);expect(plan.unusedSeats).toBe(0)});
  it('车辆不可用数量会约束候选组合',()=>{const types=appConfig.fleetVehicleTypes.map(v=>v.type==='vehicle-14'?{...v,availableCount:0}:v);expect(optimizeFleet(20,types,'dep').assignments.every(v=>v.vehicleType==='vehicle-10')).toBe(true)});
  it('拒绝无效人数和成本配置',()=>{expect(()=>optimizeFleet(0,appConfig.fleetVehicleTypes)).toThrow();expect(()=>optimizeFleet(1,[{type:'bad',label:'bad',capacity:1,costUnits:0}])).toThrow()});
});
