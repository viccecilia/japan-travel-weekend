import type {Departure,TripRoomData,VehicleGroup} from '../types';
export const seedDepartures:Departure[]=[
 {id:'dep-kyoto-seed',tripSlug:'kyoto-nara-classic',dateLabel:'本周六（开发种子）',weekend:'本周末',status:'即将满员',meetingTime:'08:00',meetingPoint:'大阪站（开发种子集合点）',price:null,availableSeats:null,isSeed:true},
 {id:'dep-amano-seed',tripSlug:'amanohashidate-ine',dateLabel:'本周日（开发种子）',weekend:'本周末',status:'可预订',meetingTime:'07:30',meetingPoint:'大阪（具体地点待公布）',price:null,availableSeats:null,isSeed:true},
];
export const seedGroups:VehicleGroup[]=[{id:'dep-kyoto-seed-group-1',vehicleAssignmentId:'dep-kyoto-seed-vehicle-1',departureId:'dep-kyoto-seed',memberIds:['passenger-1','passenger-2'],staffIds:['driver-1']}];
export const seedTripRoom:TripRoomData={id:'room-seed-1',vehicleGroupId:'dep-kyoto-seed-group-1',meeting:{name:'清水寺停车区（开发种子）',time:'14:20',note:'请在蓝色车辆标识旁集合。'},members:[{id:'passenger-1',displayName:'乘客甲',role:'passenger',boarding:'已返回'},{id:'passenger-2',displayName:'乘客乙',role:'passenger',boarding:'离车中'},{id:'driver-1',displayName:'司机健',role:'driver',boarding:'已登车'}],messages:[{id:'message-1',vehicleGroupId:'dep-kyoto-seed-group-1',author:'行程房间',role:'system',content:'本车群组已开放。系统不会展示私人联系方式。',important:true,kind:'text'}],locationGrant:{enabled:false,subjectId:null,vehicleGroupId:null,visibleTo:['driver','guide'],startedAt:null,stoppedAt:null,expiresAt:null}};
