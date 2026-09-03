import type {Departure,TripRoomData,VehicleGroup} from '../types';
const dailyTripSlugs=['kyoto-nara-classic','amanohashidate-ine','biwako-shirahige','wakayama-family','kobe-arima-rokko'];
const previewSchedules:Record<string,{depart:string;end:string}>={
  'kyoto-nara-classic':{depart:'08:40',end:'18:00'},
  'amanohashidate-ine':{depart:'08:40',end:'19:20'},
  'biwako-shirahige':{depart:'08:00',end:'18:50'},
  'wakayama-family':{depart:'09:00',end:'18:40'},
  'kobe-arima-rokko':{depart:'11:30',end:'22:00'},
};
const seatPrices:Record<string,number>={
  'kyoto-nara-classic':6900,
  'amanohashidate-ine':7290,
  'biwako-shirahige':5500,
  'wakayama-family':8900,
  'kobe-arima-rokko':6750,
};
const seatPriceForDate=(tripSlug:string,departureTime:string)=>{
  const weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',weekday:'short'}).format(new Date(departureTime));
  const base=seatPrices[tripSlug];
  return weekday==='Sat'||weekday==='Sun'?Math.round(base*1.1/100)*100:base;
};
const jstDate=(offset:number)=>{const source=new Date(Date.now()+offset*86_400_000);const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(source);const get=(type:string)=>parts.find(part=>part.type===type)?.value??'';return `${get('year')}-${get('month')}-${get('day')}`};
const dailyDepartures:Departure[]=dailyTripSlugs.flatMap((tripSlug)=>Array.from({length:30},(_,index)=>{const serviceDate=jstDate(index+1);const schedule=previewSchedules[tripSlug];const departureTime=`${serviceDate}T${schedule.depart}:00+09:00`;return {id:`preview-${tripSlug}-${serviceDate}`,tripSlug,dateLabel:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'long',day:'numeric',weekday:'short'}).format(new Date(departureTime)),weekend:index<7?'本周末':index<14?'下周末':'稍后',status:'可预订',departureTime,expectedEndTime:`${serviceDate}T${schedule.end}:00+09:00`,meetingPointName:'大阪日本桥2号出口',meetingAddress:'大阪市中央区日本桥站2号出口附近（最终集合点以订单通知为准）',meetingCoordinates:null,arrivalInstructions:{transit:'请从日本桥站2号出口前往集合区域',walking:'建议发车前10分钟到达并完成签到',driving:null},meetingPhoto:null,meetingPhotoStatus:'待确认',mapStatus:'未连接',price:seatPriceForDate(tripSlug,departureTime),availableSeats:12,minimumGuests:1,currency:'JPY',taxIncluded:true,inventoryStatus:'权威库存',isSeed:true} satisfies Departure;}));
export const seedDepartures:Departure[]=[
 {id:'dep-kyoto-seed',tripSlug:'kyoto-nara-classic',dateLabel:'TEST-本周六（仅本地流程验收）',weekend:'本周末',status:'可预订',departureTime:null,expectedEndTime:null,meetingPointName:null,meetingAddress:null,meetingCoordinates:null,arrivalInstructions:{transit:null,walking:null,driving:null},meetingPhoto:'/images/kyoto-nara.jpg',meetingPhotoStatus:'开发占位',mapStatus:'未连接',price:100,availableSeats:7,inventoryStatus:'权威库存',isSeed:true},
 {id:'dep-amano-seed',tripSlug:'amanohashidate-ine',dateLabel:'本周日（开发种子日期）',weekend:'本周末',status:'可预订',departureTime:null,expectedEndTime:null,meetingPointName:null,meetingAddress:null,meetingCoordinates:null,arrivalInstructions:{transit:null,walking:null,driving:null},meetingPhoto:null,meetingPhotoStatus:'待确认',mapStatus:'未连接',price:null,availableSeats:null,inventoryStatus:'尚未发布',isSeed:true},
 ...dailyDepartures,
];
export const seedGroups:VehicleGroup[]=[{id:'dep-kyoto-seed-group-1',vehicleAssignmentId:'dep-kyoto-seed-vehicle-1',departureId:'dep-kyoto-seed',memberIds:['passenger-1','passenger-2'],staffIds:['driver-1']}];
export const seedTripRoom:TripRoomData={id:'room-seed-1',vehicleGroupId:'dep-kyoto-seed-group-1',access:'frozen',meeting:{name:'待确认',time:'待确认',note:'集合信息将在本页面和订单详情中更新。'},members:[{id:'passenger-1',displayName:'乘客甲',role:'passenger',boarding:'已返回'},{id:'passenger-2',displayName:'乘客乙',role:'passenger',boarding:'离车中'},{id:'driver-1',displayName:'工作人员待确认',role:'driver',boarding:'已登车'}],messages:[{id:'message-1',vehicleGroupId:'dep-kyoto-seed-group-1',author:'行程房间',role:'system',content:'本车群组尚未开放，目前仅可查看履约信息。',important:true,kind:'text'}],locationGrant:{enabled:false,subjectId:null,vehicleGroupId:null,visibleTo:['driver','guide'],startedAt:null,stoppedAt:null,expiresAt:null}};
