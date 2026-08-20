import {describe,expect,it} from 'vitest';
import {sequentialFill} from '../src/shared/operations/vehicleAllocation';
import {vehicleCapacityConfig} from '../src/shared/config/businessRules';

describe('sequential fill vehicle allocation',()=>{
 it.each([1,2,3,4,5,6])('fills one vehicle for %i seats',seats=>{const result=sequentialFill(seats,[vehicleCapacityConfig[0]]);expect(result).toHaveLength(1);expect(result[0].booked).toBe(seats)});
 it('starts a second vehicle at seat 7 without resizing the full first vehicle',()=>{const result=sequentialFill(7,[vehicleCapacityConfig[0]]);expect(result.map(v=>v.booked)).toEqual([6,1]);expect(result[0].capacity).toBe(6)});
 it('fills multiple vehicles in order',()=>{const result=sequentialFill(14,[vehicleCapacityConfig[0]]);expect(result.map(v=>v.booked)).toEqual([6,6,2]);expect(result.map(v=>v.sequence)).toEqual([1,2,3])});
 it('supports exact boundaries and zero',()=>{expect(sequentialFill(0)).toEqual([]);expect(sequentialFill(25,[vehicleCapacityConfig[3]])[0]).toMatchObject({booked:25,capacity:25})});
 it('rejects invalid booking and capacity boundaries',()=>{expect(()=>sequentialFill(-1)).toThrow(RangeError);expect(()=>sequentialFill(1,[])).toThrow(RangeError);expect(()=>sequentialFill(1,[{type:'bad',label:'Bad',capacity:0,demo:true}])).toThrow(RangeError)});
});
