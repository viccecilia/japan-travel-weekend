import {describe,expect,it} from 'vitest';
import {recommendDrivers,type DriverProfile} from '../src/shared/operations/driverAssignment';
import type {VehicleAssignment} from '../src/shared/types';

const vehicle=(id:string,type:string):VehicleAssignment=>({id,departureId:'dep',sequence:1,vehicleType:type,capacity:20,booked:20,groupId:`g-${id}`});
const driver=(id:string,types:string[],extra:Partial<DriverProfile>={}):DriverProfile=>({id,displayName:id,externalDispatchId:`yuzu-${id}`,qualifiedVehicleTypes:types,languages:['zh-CN'],availableFrom:'2026-09-01T00:00:00Z',availableUntil:'2026-09-02T00:00:00Z',status:'available',assignedWindows:[],...extra});
describe('司机自动推荐',()=>{
  it('只匹配车型资格且同一司机不会重复派车',()=>{const result=recommendDrivers([vehicle('v1','bus-55'),vehicle('v2','coaster-20')],[driver('bus',['bus-55']),driver('multi',['bus-55','coaster-20'])],'2026-09-01T01:00:00Z','2026-09-01T10:00:00Z',['zh-CN']);expect(result.map(x=>x.driverId)).toEqual(['bus','multi'])});
  it('排除时间冲突、不可用和资格不符司机',()=>{const result=recommendDrivers([vehicle('v','coaster-20')],[driver('busy',['coaster-20'],{assignedWindows:[{startsAt:'2026-09-01T02:00:00Z',endsAt:'2026-09-01T03:00:00Z'}]}),driver('wrong',['alphard-6'])],'2026-09-01T01:00:00Z','2026-09-01T10:00:00Z');expect(result[0]).toMatchObject({driverId:null})});
});
