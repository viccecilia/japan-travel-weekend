import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PASSENGER_EMAIL','PASSENGER_PASSWORD','DRIVER_EMAIL','DRIVER_PASSWORD'];
for(const key of required)if(!process.env[key])throw new Error(`missing ${key}`);
if(process.env.JTW_RUNTIME_MODE!=='test')throw new Error('V12 meeting verification requires explicit test mode');
const [groupId,roomId,orderId,batchId]=process.argv.slice(2);
if(!groupId||!roomId||!orderId||!/^v12-stripe-/.test(batchId??''))throw new Error('group, room, order and V12 batch are required');

const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const passenger=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const driver=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};

must(await passenger.auth.signInWithPassword({email:process.env.PASSENGER_EMAIL,password:process.env.PASSENGER_PASSWORD}),'passenger sign-in');
must(await driver.auth.signInWithPassword({email:process.env.DRIVER_EMAIL,password:process.env.DRIVER_PASSWORD}),'driver sign-in');
const driverUser=must(await driver.auth.getUser(),'driver user').user;

const room=must(await admin.from('trip_rooms').select('id,vehicle_group_id,opens_at,status').eq('id',roomId).eq('vehicle_group_id',groupId).single(),'target room');
if(!['frozen','open'].includes(room.status))throw new Error(`expected a frozen or previously opened test room, got ${room.status}`);
const boundary=new Date(room.opens_at);
if(!Number.isFinite(boundary.getTime()))throw new Error('room opening boundary is invalid');

const membership=must(await admin.from('vehicle_group_orders').select('order_id').eq('vehicle_group_id',groupId).eq('order_id',orderId).maybeSingle(),'order membership');
if(!membership)throw new Error('retained Stripe order is not in the target group');

// Restricted scenario time control: update only this isolated room after its persisted boundary.
if(room.status==='frozen')must(await admin.from('trip_rooms').update({status:'open'}).eq('id',roomId).eq('status','frozen').lte('opens_at',new Date(boundary.getTime()+1_000).toISOString()).select('id').single(),'open target room at simulated boundary');

const tasks=must(await driver.rpc('get_staff_portal_tasks'),'driver tasks');
const task=tasks.find(item=>item.vehicle_group_id===groupId);
if(!task)throw new Error('driver cannot read the target group');
if(task.map_lat==null||task.map_lng==null)throw new Error('target task has no authoritative meeting coordinates');

const meetingKey=`${batchId}-meeting-${randomUUID().slice(0,8)}`;
const revision=Number(must(await driver.rpc('update_vehicle_group_meeting',{
  p_vehicle_group:groupId,
  p_meeting_at:task.departs_at,
  p_meeting_name:task.meeting_name??'集合点',
  p_meeting_address:task.meeting_address??'集合地址待运营确认',
  p_latitude:Number(task.map_lat),
  p_longitude:Number(task.map_lng),
  p_landmark_description:'V12 隔离测试场景：以行程卡显示位置为准',
  p_reason:'V12 同事测试首次确认集合信息',
  p_idempotency_key:meetingKey,
}),'confirm meeting'));
if(!Number.isInteger(revision)||revision<1)throw new Error('meeting revision was not created');

const messageBaseline=await admin.from('trip_room_messages').select('id',{count:'exact',head:true}).eq('trip_room_id',roomId).eq('template_key','vehicle_arrived');
if(messageBaseline.error)throw new Error(`meeting message baseline: ${messageBaseline.error.message}`);
const startKey=`${batchId}-start-${randomUUID().slice(0,8)}`;
const firstStart=must(await driver.rpc('record_staff_execution_event',{p_vehicle_group:groupId,p_event_type:'meeting_started',p_detail:{source:'v12-colleague-test'},p_idempotency_key:startKey}),'start meeting');
const messageAfterFirst=await admin.from('trip_room_messages').select('id',{count:'exact',head:true}).eq('trip_room_id',roomId).eq('template_key','vehicle_arrived');
if(messageAfterFirst.error)throw new Error(`meeting message after first start: ${messageAfterFirst.error.message}`);
const repeatedStart=must(await driver.rpc('record_staff_execution_event',{p_vehicle_group:groupId,p_event_type:'meeting_started',p_detail:{source:'v12-colleague-test'},p_idempotency_key:startKey}),'repeat meeting start');
if(firstStart!==repeatedStart)throw new Error('meeting start was not idempotent');

const meeting=must(await passenger.rpc('get_current_vehicle_group_meeting',{p_vehicle_group:groupId}),'passenger meeting')?.[0];
if(!meeting||meeting.status!=='active'||Number(meeting.revision)!==revision)throw new Error('passenger cannot read the active meeting revision');
must(await passenger.rpc('acknowledge_vehicle_group_meeting',{p_vehicle_group:groupId,p_revision:revision}),'passenger acknowledgement');
const acknowledged=must(await passenger.rpc('get_current_vehicle_group_meeting',{p_vehicle_group:groupId}),'acknowledged meeting')?.[0];
if(acknowledged?.acknowledged!==true)throw new Error('passenger acknowledgement was not retained');

const [orders,passengers,messageCount,eventCount,ackCount]=await Promise.all([
  admin.from('orders').select('id,seat_count').eq('id',orderId).single(),
  admin.from('passengers').select('id',{count:'exact',head:true}).eq('order_id',orderId),
  admin.from('trip_room_messages').select('id',{count:'exact',head:true}).eq('trip_room_id',roomId).eq('template_key','vehicle_arrived'),
  admin.from('staff_execution_events').select('id',{count:'exact',head:true}).eq('vehicle_group_id',groupId).eq('actor_id',driverUser.id).eq('idempotency_key',startKey),
  admin.from('meeting_change_acknowledgements').select('account_id',{count:'exact',head:true}).eq('vehicle_group_id',groupId).eq('revision',revision),
]);
for(const [result,label] of [[orders,'order'],[passengers,'passengers'],[messageCount,'meeting message'],[eventCount,'meeting event'],[ackCount,'meeting acknowledgement']])if(result.error)throw new Error(`${label}: ${result.error.message}`);
if(messageAfterFirst.count!==(messageBaseline.count??0)+1||messageCount.count!==messageAfterFirst.count||eventCount.count!==1||ackCount.count!==1)throw new Error(`meeting idempotency or acknowledgement count mismatch: ${JSON.stringify({messageBaseline:messageBaseline.count,messageAfterFirst:messageAfterFirst.count,messageAfterRepeat:messageCount.count,eventCount:eventCount.count,ackCount:ackCount.count})}`);
if(passengers.count!==orders.data.seat_count)throw new Error('passenger list and paid seat count differ');

console.log(JSON.stringify({
  ok:true,batchId,groupId,roomId,orderId,
  restrictedTimeControl:{targetRoomOnly:true,simulatedBoundaryAt:new Date(boundary.getTime()+1_000).toISOString(),persistedOpensAt:room.opens_at,result:'open'},
  meeting:{revision,status:'active',sourceCoordinates:'staff task',newMessageCount:messageCount.count-(messageBaseline.count??0),eventCount:eventCount.count,repeatedStartIdempotent:true},
  passengerConfirmation:{acknowledgementAccounts:ackCount.count,confirmedSeats:orders.data.seat_count,unconfirmedSeats:0,passengerRows:passengers.count,retained:true},
  externalNotificationSent:false,
  retainedForColleagueTesting:true,
}));
