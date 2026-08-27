import {describe,expect,it} from 'vitest';
import {appConfig} from '../src/shared/config/businessRules';
import {optimizeFleet} from '../src/shared/operations/fleetOptimizer';

describe('成本优先车辆组合与顺序装载',()=>{
  it.each([[6,['alphard-6']],[12,['hiace-13']],[20,['coaster-20']],[50,['bus-55']],[70,['bus-55','coaster-20']]] as const)('%i 人生成预期车辆组合',(passengers,expected)=>expect(optimizeFleet(passengers,appConfig.fleetVehicleTypes,'dep').assignments.map(v=>v.vehicleType)).toEqual(expected));
  it('70 人先填满大巴再进入 Coaster',()=>{const plan=optimizeFleet(70,appConfig.fleetVehicleTypes,'dep');expect(plan.assignments.map(v=>v.booked)).toEqual([55,15]);expect(plan.totalCapacity).toBe(75);expect(plan.unusedSeats).toBe(5)});
  it('车辆不可用数量会约束候选组合',()=>{const types=appConfig.fleetVehicleTypes.map(v=>v.type==='bus-55'?{...v,availableCount:0}:v);expect(optimizeFleet(50,types,'dep').assignments.every(v=>v.vehicleType!=='bus-55')).toBe(true)});
  it('拒绝无效人数和成本配置',()=>{expect(()=>optimizeFleet(0,appConfig.fleetVehicleTypes)).toThrow();expect(()=>optimizeFleet(1,[{type:'bad',label:'bad',capacity:1,costUnits:0}])).toThrow()});
});
