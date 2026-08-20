import type {VehicleCapacityConfig} from '../types';
export const vehicleCapacityConfig:VehicleCapacityConfig[]=[
  {type:'alphard-6',label:'Alphard',capacity:6,demo:true},
  {type:'hiace-9',label:'Hiace 9',capacity:9,demo:true},
  {type:'hiace-13',label:'Hiace 13',capacity:13,demo:true},
  {type:'vehicle-25',label:'25-seat vehicle',capacity:25,demo:true},
];
export const operationsConfig={tripRoomOpens:'Previous evening · Demo configuration',locationShareMinutes:[15,30] as const,driverLocationVisibleDuringTrip:true,passengerLocationDefault:false};
export const businessRules={firstValidOrderDiscountPercent:5,referrerCreditPercent:5,creditValidityDays:180,creditPerOrderCapYen:1000,ambassadorCommissionPercent:5,loadFactorTargetPercent:80,allocationPrinciple:'sequential-fill' as const,tiers:[{name:'Explorer',trips:0},{name:'Traveller',trips:2},{name:'Insider',trips:3},{name:'VIP Traveller',trips:5}] as const};
export function tierFor(completed:number){return [...businessRules.tiers].reverse().find(t=>completed>=t.trips)??businessRules.tiers[0]}
export function nextTier(completed:number){return businessRules.tiers.find(t=>t.trips>completed)}
