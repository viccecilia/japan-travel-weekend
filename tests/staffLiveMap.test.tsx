import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AppProvider} from '../src/app/store';
import {StaffLiveMap} from '../src/app/StaffLiveMap';
import {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(()=>{cleanup();vi.unstubAllGlobals()});

describe('staff live map',()=>{
 it('shows device, meeting, vehicle and consented passenger positions and publishes only after staff action',async()=>{
  const calls:string[]=[];
  const client={auth:{getUser:async()=>({data:{user:{id:'staff-map'}},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:(name:string)=>{
   calls.push(name);
   if(name==='get_passenger_location_shares')return Promise.resolve({data:[{id:'share-1',subject_id:'p-1',display_name:'游客甲',latitude:34.701,longitude:135.501,accuracy_meters:12,sampled_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString()}],error:null});
   if(name==='get_active_driver_location')return {maybeSingle:async()=>({data:{latitude:34.7,longitude:135.5,accuracy_meters:7,updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString()},error:null})};
   if(name==='start_driver_location_session_v2')return Promise.resolve({data:{sessionId:'session-1',expiresAt:new Date(Date.now()+1800000).toISOString()},error:null});
   if(name==='append_driver_location_point')return Promise.resolve({data:1,error:null});
   if(name==='stop_driver_location')return Promise.resolve({data:1,error:null});
   return Promise.resolve({data:null,error:null});
  }} as unknown as SupabaseClient;
  let positionCallback:PositionCallback=()=>{};
  vi.stubGlobal('navigator',{geolocation:{watchPosition:vi.fn((success:PositionCallback)=>{positionCallback=success;return 4}),clearWatch:vi.fn()}});
  const task={staff_assignment_id:'a',assignment_role:'driver' as const,vehicle_group_id:'g',room_id:'r',room_status:'open',departure_id:'d',trip_title:'测试路线',departs_at:new Date().toISOString(),meeting_at:new Date().toISOString(),chat_opens_at:null,meeting_name:'正式集合点',meeting_address:'大阪市测试地址',map_lat:34.699,map_lng:135.499,vehicle_sequence:1,vehicle_type:'hiace',vehicle_label:'测试车辆',vehicle_capacity:5,booked_seats:5,passenger_count:5,boarded_count:0};
  render(<AppProvider services={new ProductionBrowserServices(client,undefined)}><StaffLiveMap task={task}/></AppProvider>);
  expect(await screen.findByText('游客甲')).toBeInTheDocument();
  expect(screen.getByText('正式集合点')).toBeInTheDocument();
  expect(screen.getByText('已共享的车辆位置')).toBeInTheDocument();
  expect(calls).not.toContain('start_driver_location_session_v2');
  fireEvent.click(screen.getByRole('button',{name:'显示我的位置'}));
  await act(async()=>positionCallback({coords:{latitude:34.702,longitude:135.502,accuracy:6},timestamp:Date.now()} as GeolocationPosition));
  expect(await screen.findByText('我的GPS位置')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'共享车辆位置'}));
  await waitFor(()=>expect(calls).toContain('append_driver_location_point'));
 });
});
