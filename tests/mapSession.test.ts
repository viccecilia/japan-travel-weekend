import { describe, expect, it, vi } from 'vitest';
import { buildMapMarkers, resolveFocusedMapMarker, resolveMapSessionMode, resolveSelectedMapMarker, sharedPlaceMapHref, startLocationFollow } from '../src/shared/services/mapSession';

describe('trip map session', () => {
  it('uses the active meeting before driver lookup and never creates passenger-peer markers', () => {
    expect(resolveMapSessionMode({roomStatus: 'open', meeting: {status: 'active'}, driver: {latitude: 35, longitude: 135}})).toBe('return_to_meeting');
    const markers = buildMapMarkers({roomStatus: 'open', meeting: {status: 'active', latitude: 35, longitude: 135, meeting_name: 'North gate'}, driver: {latitude: 35.01, longitude: 135.01}, user: {latitude: 35.02, longitude: 135.02}, shared: [{id: 'place-1', latitude: 35.03, longitude: 135.03, label: 'Temporary stop'}], guide: [{id: 'stop-1', latitude: 35.04, longitude: 135.04, name: 'First stop'}]});
    expect(markers.map((marker) => marker.type)).toEqual(['user_location', 'meeting_point', 'driver_vehicle', 'shared_place', 'guide_node']);
    expect(markers.some((marker) => marker.type === ('passenger_location' as never))).toBe(false);
  });

  it('makes frozen and historical rooms non-interactive and omits invalid coordinates', () => {
    expect(resolveMapSessionMode({roomStatus: 'frozen', meeting: null, driver: null})).toBe('ended');
    expect(resolveMapSessionMode({roomStatus: 'closed', meeting: null, driver: null})).toBe('ended');
    expect(buildMapMarkers({roomStatus: 'open', meeting: null, driver: {latitude: 999, longitude: 135}, shared: [], guide: []})).toEqual([]);
  });

  it('keeps the guide session when no meeting or live driver has been published', () => {
    expect(resolveMapSessionMode({roomStatus: 'open', meeting: null, driver: null})).toBe('guide');
    expect(resolveMapSessionMode({roomStatus: 'open', meeting: {status: 'scheduled'}, driver: null})).toBe('meeting');
  });

  it('does not let a driver marker override an explicit guide or meeting session', () => {
    const driver={latitude:35,longitude:135};
    expect(resolveMapSessionMode({roomStatus:'open',meeting:null,driver,requestedMode:'guide'})).toBe('guide');
    expect(resolveMapSessionMode({roomStatus:'open',meeting:{status:'scheduled'},driver,requestedMode:'meeting'})).toBe('meeting');
    expect(resolveMapSessionMode({roomStatus:'open',meeting:{status:'active'},driver,requestedMode:'guide'})).toBe('return_to_meeting');
  });

  it('prefers an explicitly selected shared or guide marker over the mode default', () => {
    const markers=buildMapMarkers({roomStatus:'open',meeting:{status:'scheduled',latitude:35,longitude:135},driver:{latitude:35.1,longitude:135.1},shared:[{id:'shared-1',latitude:35.2,longitude:135.2,label:'Shared place'}],guide:[{id:'guide-1',latitude:35.3,longitude:135.3,name:'Guide node'}]});
    expect(resolveSelectedMapMarker(markers,'shared:shared-1','driver')?.id).toBe('shared:shared-1');
    expect(resolveSelectedMapMarker(markers,'guide:guide-1','meeting')?.id).toBe('guide:guide-1');
    expect(resolveSelectedMapMarker(markers,null,'driver')?.id).toBe('driver');
    expect(resolveFocusedMapMarker(markers,'shared:shared-1')?.id).toBe('shared:shared-1');
    expect(sharedPlaceMapHref('vehicle 1','place/1')).toBe('/app/trip-map?vehicleGroup=vehicle%201&focus=shared%3Aplace%2F1');
  });

  it('starts and cleans up a continuous location watch', () => {
    const clearWatch=vi.fn();const watchPosition=vi.fn((_ok:PositionCallback,_fail:PositionErrorCallback)=>42);
    const stop=startLocationFollow({watchPosition,clearWatch},vi.fn(),vi.fn());
    expect(watchPosition).toHaveBeenCalledOnce();stop();expect(clearWatch).toHaveBeenCalledWith(42);
  });
});
