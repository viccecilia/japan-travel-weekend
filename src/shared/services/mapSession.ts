export type MapSessionMode = 'meeting'|'find_driver'|'guide'|'return_to_meeting'|'ended';
export type MapMarkerType = 'user_location'|'driver_vehicle'|'meeting_point'|'shared_place'|'guide_node';
export type MapMarker = {id:string;type:MapMarkerType;lat:number;lng:number;label:string;subtitle?:string;source:'device'|'driver'|'meeting'|'staff_shared'|'guide';updatedAt?:string};
export type MapCoordinates = {latitude:number;longitude:number};
export type MapSessionInput = {
  roomStatus:string; meeting:{status?:string;latitude?:number;longitude?:number;meeting_name?:string;meeting_address?:string;changed_at?:string}|null;
  driver:{latitude:number;longitude:number;updated_at?:string}|null; user?:MapCoordinates|null;
  shared:Array<{id:string;latitude:number;longitude:number;label:string;address?:string|null;created_at?:string}>;
  guide:Array<{id:string;latitude:number;longitude:number;name:string;description?:string}>;
  labels?: {user?:string;meeting?:string;driver?:string};
};
const valid = (latitude:unknown, longitude:unknown) => Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
export const resolveMapSessionMode = (input:Pick<MapSessionInput,'roomStatus'|'meeting'|'driver'>):MapSessionMode => {
  if (input.roomStatus !== 'open') return 'ended';
  if (input.meeting?.status === 'active') return 'return_to_meeting';
  if (input.driver) return 'find_driver';
  return input.meeting ? 'meeting' : 'guide';
};
export function buildMapMarkers(input:MapSessionInput):MapMarker[] {
  const markers:MapMarker[]=[];
  if (input.user && valid(input.user.latitude,input.user.longitude)) markers.push({id:'me',type:'user_location',lat:input.user.latitude,lng:input.user.longitude,label:input.labels?.user||'You',source:'device'});
  if (input.meeting && valid(input.meeting.latitude,input.meeting.longitude)) markers.push({id:'meeting',type:'meeting_point',lat:Number(input.meeting.latitude),lng:Number(input.meeting.longitude),label:input.meeting.meeting_name||input.labels?.meeting||'Meeting point',subtitle:input.meeting.meeting_address,source:'meeting',updatedAt:input.meeting.changed_at});
  if (input.driver && valid(input.driver.latitude,input.driver.longitude)) markers.push({id:'driver',type:'driver_vehicle',lat:Number(input.driver.latitude),lng:Number(input.driver.longitude),label:input.labels?.driver||'Driver / vehicle',source:'driver',updatedAt:input.driver.updated_at});
  for (const place of input.shared) if (valid(place.latitude,place.longitude)) markers.push({id:`shared:${place.id}`,type:'shared_place',lat:Number(place.latitude),lng:Number(place.longitude),label:place.label,subtitle:place.address??undefined,source:'staff_shared',updatedAt:place.created_at});
  for (const node of input.guide) if (valid(node.latitude,node.longitude)) markers.push({id:`guide:${node.id}`,type:'guide_node',lat:Number(node.latitude),lng:Number(node.longitude),label:node.name,subtitle:node.description,source:'guide'});
  return markers;
}
export const mapMarkerGlyph:Record<MapMarkerType,string>={user_location:'◎',driver_vehicle:'◆',meeting_point:'●',shared_place:'📍',guide_node:'✦'};
