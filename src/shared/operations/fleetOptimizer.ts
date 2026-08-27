import type {VehicleAssignment} from '../types';

export type FleetVehicleType={type:string;label:string;capacity:number;costUnits:number;availableCount?:number};
export type FleetPlan={assignments:VehicleAssignment[];totalCapacity:number;unusedSeats:number;costUnits:number;vehicleCount:number};

const better=(candidate:FleetPlan,current:FleetPlan|null)=>!current||candidate.costUnits<current.costUnits||candidate.costUnits===current.costUnits&&(candidate.vehicleCount<current.vehicleCount||candidate.vehicleCount===current.vehicleCount&&candidate.unusedSeats<current.unusedSeats);

export function optimizeFleet(passengers:number,types:FleetVehicleType[],departureId='departure'):FleetPlan{
  if(!Number.isInteger(passengers)||passengers<1)throw new RangeError('乘客人数必须为正整数');
  if(!types.length||types.some(v=>!Number.isInteger(v.capacity)||v.capacity<1||!Number.isFinite(v.costUnits)||v.costUnits<=0))throw new RangeError('车型容量和成本必须为正数');
  const maxCapacity=Math.max(...types.map(v=>v.capacity));
  const capacityLimit=passengers+maxCapacity-1;
  const states=new Map<number,{cost:number;vehicles:number;counts:number[]}>([[0,{cost:0,vehicles:0,counts:types.map(()=>0)}]]);
  for(let capacity=0;capacity<=capacityLimit;capacity++){
    const state=states.get(capacity);if(!state)continue;
    types.forEach((vehicle,index)=>{
      if(vehicle.availableCount!=null&&state.counts[index]>=vehicle.availableCount!)return;
      const nextCapacity=capacity+vehicle.capacity;if(nextCapacity>capacityLimit)return;
      const candidate={cost:state.cost+vehicle.costUnits,vehicles:state.vehicles+1,counts:state.counts.map((count,i)=>count+(i===index?1:0))};
      const current=states.get(nextCapacity);
      if(!current||candidate.cost<current.cost||candidate.cost===current.cost&&candidate.vehicles<current.vehicles)states.set(nextCapacity,candidate);
    });
  }
  let best:FleetPlan|null=null;
  for(const [capacity,state] of states){if(capacity<passengers)continue;const selected=state.counts.flatMap((count,index)=>Array.from({length:count},()=>types[index])).sort((a,b)=>b.capacity-a.capacity||a.costUnits-b.costUnits);let remaining=passengers;const assignments=selected.map((vehicle,index)=>{const booked=Math.min(remaining,vehicle.capacity);remaining-=booked;const sequence=index+1;return {id:`${departureId}-vehicle-${sequence}`,departureId,sequence,vehicleType:vehicle.type,capacity:vehicle.capacity,booked,groupId:`${departureId}-group-${sequence}`};});const candidate={assignments,totalCapacity:capacity,unusedSeats:capacity-passengers,costUnits:state.cost,vehicleCount:state.vehicles};if(better(candidate,best))best=candidate;}
  if(!best)throw new Error('当前车辆配置无法承载全部乘客');
  return best;
}
