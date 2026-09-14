import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_PUBLISHABLE_KEY','DRIVER_EMAIL','DRIVER_PASSWORD'])if(!process.env[key])throw new Error(`missing ${key}`);
const groupId=process.argv[2];
if(!groupId)throw new Error('vehicle group id required');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const driver=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};
must(await driver.auth.signInWithPassword({email:process.env.DRIVER_EMAIL,password:process.env.DRIVER_PASSWORD}),'driver sign-in');
const meeting=must(await admin.from('vehicle_group_meeting_state').select('*').eq('vehicle_group_id',groupId).single(),'meeting before');
const room=must(await admin.from('trip_rooms').select('id').eq('vehicle_group_id',groupId).single(),'room');
const beforeEvents=await admin.from('staff_execution_events').select('id',{count:'exact',head:true}).eq('vehicle_group_id',groupId).eq('event_type','meeting_updated');
const beforeMessages=await admin.from('trip_room_messages').select('id',{count:'exact',head:true}).eq('trip_room_id',room.id).eq('template_key','meeting_changed');
if(beforeEvents.error||beforeMessages.error)throw beforeEvents.error??beforeMessages.error;
const returned=must(await driver.rpc('update_vehicle_group_meeting',{
  p_vehicle_group:groupId,
  p_meeting_at:meeting.meeting_at,
  p_meeting_name:meeting.meeting_name,
  p_meeting_address:meeting.meeting_address,
  p_latitude:meeting.latitude,
  p_longitude:meeting.longitude,
  p_landmark_description:meeting.landmark_description,
  p_reason:'V12 隔离验证：相同集合信息不应重复通知',
  p_idempotency_key:`v12-noop-${randomUUID()}`,
}),'same meeting update');
const after=must(await admin.from('vehicle_group_meeting_state').select('revision,status,updated_at').eq('vehicle_group_id',groupId).single(),'meeting after');
const afterEvents=await admin.from('staff_execution_events').select('id',{count:'exact',head:true}).eq('vehicle_group_id',groupId).eq('event_type','meeting_updated');
const afterMessages=await admin.from('trip_room_messages').select('id',{count:'exact',head:true}).eq('trip_room_id',room.id).eq('template_key','meeting_changed');
if(afterEvents.error||afterMessages.error)throw afterEvents.error??afterMessages.error;
if(Number(returned)!==Number(meeting.revision)||Number(after.revision)!==Number(meeting.revision))throw new Error('no-op meeting update changed revision');
if(after.status!==meeting.status||after.updated_at!==meeting.updated_at)throw new Error('no-op meeting update changed current state');
if(afterEvents.count!==beforeEvents.count||afterMessages.count!==beforeMessages.count)throw new Error('no-op meeting update generated duplicate audit or message');
console.log(JSON.stringify({ok:true,groupId,revision:after.revision,status:after.status,eventCount:afterEvents.count,messageCount:afterMessages.count,unchanged:true}));
