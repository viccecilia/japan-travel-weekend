import type {VehicleAssignment} from '../types';

export type DriverProfile={id:string;displayName:string;externalDispatchId:string|null;qualifiedVehicleTypes:string[];languages:string[];availableFrom:string;availableUntil:string;status:'available'|'unavailable'|'suspended';assignedWindows:{startsAt:string;endsAt:string}[]};
export type DriverRecommendation={vehicleAssignmentId:string;driverId:string|null;reason:string[]};

const overlaps=(start:number,end:number,window:{startsAt:string;endsAt:string})=>start<new Date(window.endsAt).getTime()&&end>new Date(window.startsAt).getTime();

export function recommendDrivers(assignments:VehicleAssignment[],drivers:DriverProfile[],startsAt:string,endsAt:string,preferredLanguages:string[]=[]):DriverRecommendation[]{
  const start=new Date(startsAt).getTime(),end=new Date(endsAt).getTime();if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)throw new RangeError('任务时间范围无效');
  const used=new Set<string>();
  return assignments.map(assignment=>{const candidates=drivers.filter(driver=>driver.status==='available'&&!used.has(driver.id)&&driver.qualifiedVehicleTypes.includes(assignment.vehicleType)&&new Date(driver.availableFrom).getTime()<=start&&new Date(driver.availableUntil).getTime()>=end&&!driver.assignedWindows.some(window=>overlaps(start,end,window))).sort((a,b)=>{const aLanguage=preferredLanguages.filter(language=>a.languages.includes(language)).length;const bLanguage=preferredLanguages.filter(language=>b.languages.includes(language)).length;return bLanguage-aLanguage||a.displayName.localeCompare(b.displayName,'zh-CN');});const selected=candidates[0];if(!selected)return {vehicleAssignmentId:assignment.id,driverId:null,reason:['没有同时满足车型资格、可用时间和排班冲突要求的司机']};used.add(selected.id);const matched=preferredLanguages.filter(language=>selected.languages.includes(language));return {vehicleAssignmentId:assignment.id,driverId:selected.id,reason:['车型资格符合','任务时间可用','没有排班冲突',...(matched.length?[`语言匹配：${matched.join('、')}`]:[])]};});
}
