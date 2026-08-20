import type {VehicleAssignment,VehicleCapacityConfig} from '../types';
import {vehicleCapacityConfig} from '../config/businessRules';

export function sequentialFill(totalSeats:number,config:VehicleCapacityConfig[]=[vehicleCapacityConfig[0]]):VehicleAssignment[]{
  if(!Number.isInteger(totalSeats)||totalSeats<0)throw new RangeError('totalSeats must be a non-negative integer');
  if(!config.length||config.some(v=>!Number.isInteger(v.capacity)||v.capacity<=0))throw new RangeError('vehicle capacities must be positive integers');
  if(totalSeats===0)return [];
  const assignments:VehicleAssignment[]=[];
  let remaining=totalSeats;
  while(remaining>0){
    const vehicle=config.find(v=>v.capacity>=remaining)??config[config.length-1];
    const booked=Math.min(remaining,vehicle.capacity);
    const sequence=assignments.length+1;
    assignments.push({id:`vehicle-${sequence}`,departureId:'demo-departure',sequence,vehicleType:vehicle.type,capacity:vehicle.capacity,booked,groupId:`vehicle-group-${sequence}`});
    remaining-=booked;
  }
  return assignments;
}

export const loadFactor=(assignment:VehicleAssignment)=>Math.round(assignment.booked/assignment.capacity*100);
