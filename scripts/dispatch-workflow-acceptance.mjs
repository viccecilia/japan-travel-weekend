import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';

const required=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','OPERATIONS_EMAIL','OPERATIONS_PASSWORD','PASSENGER_EMAIL','PASSENGER_PASSWORD'];
for(const key of required)if(!process.env[key])throw new Error(`Missing ${key}`);
const client=()=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const expectOk=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};
const operations=client();const passenger=client();let vehicleId=null;let driverId=null;let departureId=null;let taskIds=[];const sequences=[90,91];

try{
  expectOk(await operations.auth.signInWithPassword({email:process.env.OPERATIONS_EMAIL,password:process.env.OPERATIONS_PASSWORD}),'operations sign-in');
  expectOk(await passenger.auth.signInWithPassword({email:process.env.PASSENGER_EMAIL,password:process.env.PASSENGER_PASSWORD}),'passenger sign-in');
  const denied=await passenger.rpc('operations_confirm_dispatch_tasks',{p_task_ids:[randomUUID()]});
  if(!denied.error)throw new Error('passenger dispatch mutation was not denied');
  const departures=expectOk(await operations.from('departures').select('id,departs_at').not('departs_at','is',null).order('departs_at').limit(1),'departure read');
  if(!departures?.length)throw new Error('no test departure');
  departureId=departures[0].id;const startsAt=new Date(departures[0].departs_at);const endsAt=new Date(startsAt.getTime()+12*60*60_000);const suffix=Date.now().toString(36).toUpperCase();
  vehicleId=expectOk(await operations.rpc('operations_create_vehicle',{p_registration:`TEST-DISPATCH-${suffix}`,p_vehicle_type:'vehicle-10',p_external_dispatch_id:`yuzu-test-${suffix}`}),'vehicle create');
  driverId=expectOk(await operations.rpc('operations_create_driver',{p_display_name:`虚构派单司机-${suffix}`,p_external_dispatch_id:`yuzu-driver-test-${suffix}`,p_vehicle_types:['vehicle-10'],p_languages:['zh-CN','ja'],p_available_from:new Date(startsAt.getTime()-60*60_000).toISOString(),p_available_until:new Date(startsAt.getTime()+72*60*60_000).toISOString()}),'driver create');
  const tasks=[{sequence:sequences[0],vehicleType:'vehicle-10',capacity:9,passengerCount:9,driverId,fleetVehicleId:vehicleId,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),operationalNotes:['TEST ONLY']}];
  taskIds=expectOk(await operations.rpc('operations_save_dispatch_plan',{p_departure:departureId,p_tasks:tasks}),'draft save');
  if(taskIds.length!==1)throw new Error('draft count mismatch');
  expectOk(await operations.rpc('operations_confirm_dispatch_tasks',{p_task_ids:taskIds}),'confirm');
  expectOk(await operations.rpc('operations_simulate_dispatch_send',{p_task_ids:taskIds}),'mock send');
  const sent=expectOk(await operations.from('dispatch_tasks').select('status,external_task_id').eq('id',taskIds[0]).single(),'sent read');
  if(sent.status!=='sent'||!sent.external_task_id?.startsWith('mock-'))throw new Error('mock send state mismatch');
  const audit=expectOk(await operations.from('dispatch_task_audit').select('action,detail').eq('dispatch_task_id',taskIds[0]).order('id'),'audit read');
  for(const action of ['draft_created','confirmed','mock_sent'])if(!audit.some(row=>row.action===action))throw new Error(`missing audit ${action}`);
  const mockAudit=audit.find(row=>row.action==='mock_sent');if(mockAudit?.detail?.externalNetwork!==false)throw new Error('mock send network flag missing');
  expectOk(await operations.rpc('operations_cancel_dispatch_tasks',{p_task_ids:taskIds,p_reason:'隔离项目自动验收后取消'}),'cancel');
  const cancelled=expectOk(await operations.from('dispatch_tasks').select('status,fleet_vehicles(status)').eq('id',taskIds[0]).single(),'cancel read');
  if(cancelled.status!=='cancelled'||cancelled.fleet_vehicles?.status!=='available')throw new Error('cancellation did not release vehicle');
  const outside=[{...tasks[0],sequence:sequences[1],startsAt:new Date(startsAt.getTime()+48*60*60_000).toISOString(),endsAt:new Date(startsAt.getTime()+50*60*60_000).toISOString()}];
  const rejected=await operations.rpc('operations_save_dispatch_plan',{p_departure:departureId,p_tasks:outside});
  if(!rejected.error?.message.includes('dispatch time outside departure window'))throw new Error('out-of-window dispatch was not rejected');
  console.log(JSON.stringify({ok:true,passengerDenied:true,draftSaved:true,confirmed:true,mockSent:true,cancelled:true,vehicleReleased:true,outOfWindowDenied:true,auditActions:audit.map(row=>row.action)}));
}finally{
  if(taskIds.length)await operations.from('dispatch_tasks').delete().in('id',taskIds);
  if(departureId)await operations.from('vehicle_assignments').delete().eq('departure_id',departureId).in('sequence',sequences);
  if(driverId)await operations.from('driver_resources').delete().eq('id',driverId);
  if(vehicleId)await operations.from('fleet_vehicles').delete().eq('id',vehicleId);
  await passenger.auth.signOut();await operations.auth.signOut();
}
