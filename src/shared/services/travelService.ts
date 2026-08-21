import type {LocationGrant,TripRoomData} from '../types';import type {TravelRepository} from '../data/repository';
export class TravelService{constructor(private repository:TravelRepository){}listTrips(){return this.repository.listTrips()}getTrip(slug:string){return this.repository.getTrip(slug)}listDepartures(){return this.repository.listDepartures()}getTripRoom(groupId:string){return this.repository.getTripRoomForGroup(groupId)}
 startLocationSharing(room:TripRoomData,subjectId:string,minutes:15|30,now=new Date()):LocationGrant{return {enabled:true,subjectId,vehicleGroupId:room.vehicleGroupId,visibleTo:['driver','guide'],startedAt:now.toISOString(),stoppedAt:null,expiresAt:new Date(now.getTime()+minutes*60000).toISOString()}}
 stopLocationSharing(grant:LocationGrant,now=new Date()):LocationGrant{return {...grant,enabled:false,stoppedAt:now.toISOString()}}
 canViewLocation(grant:LocationGrant,viewerRole:'passenger'|'driver'|'guide',viewerGroupId:string,now=new Date()){return grant.enabled&&grant.vehicleGroupId===viewerGroupId&&grant.visibleTo.includes(viewerRole as 'driver'|'guide')&&!!grant.expiresAt&&new Date(grant.expiresAt)>now}
}
