import type {Coordinates} from './adapters';
import {GoogleMapsAdapter} from '../integrations/googleMaps';

export type DriverLocationContext={coordinates:Coordinates|null;tripActive:boolean;sameVehicleGroup:boolean;viewerRole:'passenger'|'driver'|'guide'|'operations'};

export function driverLocationNavigationUrl(context:DriverLocationContext){
  if(!context.coordinates||!context.tripActive||!context.sameVehicleGroup)return null;
  if(context.viewerRole!=='passenger'&&context.viewerRole!=='driver'&&context.viewerRole!=='guide'&&context.viewerRole!=='operations')return null;
  return new GoogleMapsAdapter(undefined).navigationUrl(context.coordinates);
}
