import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']){
  if(!process.env[key])throw new Error(`missing ${key}`);
}
if(process.env.JTW_RUNTIME_MODE!=='test')throw new Error('V12 room boundary verification requires explicit test mode');

const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const batchId=`v12-room-${Date.now()}-${randomUUID().slice(0,8)}`;
const state={tripId:null,departureId:null,assignmentId:null,groupId:null,roomId:null};
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};
const iso=value=>new Date(value).toISOString();
const assertExact=(actual,expected,label)=>{
  if(new Date(actual).getTime()!==new Date(expected).getTime())throw new Error(`${label}: ${actual} !== ${expected}`);
};

async function cleanup(){
  if(state.roomId)await admin.from('trip_rooms').delete().eq('id',state.roomId);
  if(state.groupId)await admin.from('vehicle_groups').delete().eq('id',state.groupId);
  if(state.assignmentId)await admin.from('vehicle_assignments').delete().eq('id',state.assignmentId);
  if(state.departureId)await admin.from('departures').delete().eq('id',state.departureId);
  if(state.tripId)await admin.from('trips').delete().eq('id',state.tripId);
}

try{
  const now=Date.now();
  const originalDeparture=iso(now+30*60*60_000);
  const originalExpectedOpen=iso(new Date(originalDeparture).getTime()-24*60*60_000);
  state.tripId=must(await admin.from('trips').insert({
    slug:batchId,
    title:'TEST V12 精确24小时群聊边界',
    status:'draft'
  }).select('id').single(),'create test trip').id;

  const departure=must(await admin.from('departures').insert({
    trip_id:state.tripId,
    departs_at:originalDeparture,
    capacity:9,
    status:'draft',
    chat_opens_at:iso(now+2*60*60_000)
  }).select('id,departs_at,chat_opens_at').single(),'create test departure');
  state.departureId=departure.id;
  assertExact(departure.chat_opens_at,originalExpectedOpen,'insert boundary');

  state.assignmentId=must(await admin.from('vehicle_assignments').insert({
    departure_id:state.departureId,
    sequence:1,
    vehicle_type:'test',
    capacity:9,
    planned_passengers:0
  }).select('id').single(),'create assignment').id;
  state.groupId=must(await admin.from('vehicle_groups').insert({
    departure_id:state.departureId,
    vehicle_assignment_id:state.assignmentId
  }).select('id').single(),'create vehicle group').id;
  state.roomId=must(await admin.from('trip_rooms').insert({
    vehicle_group_id:state.groupId,
    opens_at:originalExpectedOpen,
    status:'frozen'
  }).select('id').single(),'create trip room').id;

  const insideBoundaryDeparture=iso(now+20*60*60_000);
  const insideExpectedOpen=iso(new Date(insideBoundaryDeparture).getTime()-24*60*60_000);
  const rescheduled=must(await admin.from('departures').update({departs_at:insideBoundaryDeparture}).eq('id',state.departureId).select('chat_opens_at').single(),'reschedule inside boundary');
  assertExact(rescheduled.chat_opens_at,insideExpectedOpen,'reschedule boundary');
  const openedRoom=must(await admin.from('trip_rooms').select('opens_at,status').eq('id',state.roomId).single(),'room after inside reschedule');
  assertExact(openedRoom.opens_at,insideExpectedOpen,'room synced boundary');
  if(openedRoom.status!=='open')throw new Error(`room did not open inside 24-hour boundary: ${openedRoom.status}`);

  const outsideBoundaryDeparture=iso(now+40*60*60_000);
  const outsideExpectedOpen=iso(new Date(outsideBoundaryDeparture).getTime()-24*60*60_000);
  const secondReschedule=must(await admin.from('departures').update({departs_at:outsideBoundaryDeparture}).eq('id',state.departureId).select('chat_opens_at').single(),'reschedule outside boundary');
  assertExact(secondReschedule.chat_opens_at,outsideExpectedOpen,'second reschedule boundary');
  const frozenRoom=must(await admin.from('trip_rooms').select('opens_at,status').eq('id',state.roomId).single(),'room after outside reschedule');
  assertExact(frozenRoom.opens_at,outsideExpectedOpen,'room second synced boundary');
  if(frozenRoom.status!=='frozen')throw new Error(`room did not freeze outside 24-hour boundary: ${frozenRoom.status}`);

  must(await admin.from('trip_rooms').update({status:'closed'}).eq('id',state.roomId),'close room');
  must(await admin.from('departures').update({departs_at:insideBoundaryDeparture}).eq('id',state.departureId),'reschedule closed room');
  const closedRoom=must(await admin.from('trip_rooms').select('status').eq('id',state.roomId).single(),'closed room after reschedule');
  if(closedRoom.status!=='closed')throw new Error('reschedule reopened a closed room');

  console.log(JSON.stringify({
    ok:true,
    batchId,
    insertBoundaryHours:24,
    rescheduleInsideBoundary:'opened',
    rescheduleOutsideBoundary:'frozen',
    closedRoomPreserved:true,
    cleanup:'pending'
  }));
}finally{
  await cleanup();
  const remaining=state.departureId?(await admin.from('departures').select('id').eq('id',state.departureId)).data??[]:[];
  console.log(JSON.stringify({cleanupComplete:remaining.length===0,remaining:remaining.length}));
}
