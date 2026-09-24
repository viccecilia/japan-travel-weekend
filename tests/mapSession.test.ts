import { describe, expect, it } from 'vitest';
import { buildMapMarkers, resolveMapSessionMode } from '../src/shared/services/mapSession';

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
});
