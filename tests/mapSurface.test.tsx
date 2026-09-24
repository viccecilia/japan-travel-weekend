import {cleanup,render,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MapSurface} from '../src/app/MapSurface';

let handlers:Record<string,(event?:any)=>void>={};
class FakeMap { addListener(name:string,handler:(event?:any)=>void){handlers[name]=handler;return {remove:vi.fn()}} panTo=vi.fn(); }
class FakeMarker { constructor(_options:unknown){} addListener=vi.fn();setMap=vi.fn(); }

afterEach(()=>{cleanup();handlers={};delete window.google;delete window.__jtwGoogleMapsPromise});

describe('MapSurface live map callbacks',()=>{
  it('uses the latest map-click callback after room and role load',async()=>{
    window.google={maps:{Map:FakeMap,Marker:FakeMarker}} as never;
    const {rerender}=render(<MapSurface interactive markers={[]} emptyLabel="Loading" unavailableLabel="Unavailable"/>);
    await waitFor(()=>expect(handlers.click).toBeTypeOf('function'));
    const onMapClick=vi.fn();
    rerender(<MapSurface interactive markers={[]} onMapClick={onMapClick} emptyLabel="Loading" unavailableLabel="Unavailable"/>);
    handlers.click({latLng:{lat:()=>35,lng:()=>135}});
    expect(onMapClick).toHaveBeenCalledWith({lat:35,lng:135});
  });

  it('does not fabricate a passenger write handler when none is supplied',async()=>{
    window.google={maps:{Map:FakeMap,Marker:FakeMarker}} as never;
    render(<MapSurface interactive markers={[]} emptyLabel="Loading" unavailableLabel="Unavailable"/>);
    await waitFor(()=>expect(handlers.click).toBeTypeOf('function'));
    expect(()=>handlers.click({latLng:{lat:()=>35,lng:()=>135}})).not.toThrow();
  });
});
