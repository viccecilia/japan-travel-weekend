import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';

const operationsEmail=process.env.JTW_OPERATIONS_EMAIL??process.env.OPERATIONS_EMAIL;
const operationsPassword=process.env.JTW_OPERATIONS_PASSWORD??process.env.OPERATIONS_PASSWORD;
const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_PUBLISHABLE_KEY'];
for(const key of required)if(!process.env[key])throw new Error(`Missing ${key}`);
if(!operationsEmail||!operationsPassword)throw new Error('Missing fictional operations credentials');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const operations=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};
const prefix=`bridge-${Date.now()}-${randomUUID().slice(0,6)}`;
let tripId,departureId,vehicleIds=[],driverIds=[],taskIds=[],assignmentIds=[],availabilityIds=[],linkedDriverAvailable=false,createdLinkedDriver=false,addedLinkedQualification=false;

try{
  must(await operations.auth.signInWithPassword({email:operationsEmail,password:operationsPassword}),'operations sign-in');
  const profiles=must(await admin.from('profiles').select('id,role'),'profiles');
  const owner=profiles.find(item=>item.role==='passenger');const driverAccount=profiles.find(item=>item.role==='driver');
  if(!owner||!driverAccount)throw new Error('Fictional passenger and driver profiles required');
  tripId=must(await admin.from('trips').insert({slug:prefix,title:'TEST Dispatch bridge',status:'draft'}).select('id').single(),'trip').id;
  const startsAt=new Date(Date.now()+48*60*60_000);const endsAt=new Date(startsAt.getTime()+12*60*60_000);
  departureId=must(await admin.from('departures').insert({trip_id:tripId,departs_at:startsAt.toISOString(),capacity:19,status:'open',seat_price_jpy:100}).select('id').single(),'departure').id;
  must(await admin.from('orders').insert([{account_id:owner.id,departure_id:departureId,idempotency_key:`${prefix}-o1`,seat_count:5,status:'paid',amount:500},{account_id:owner.id,departure_id:departureId,idempotency_key:`${prefix}-o2`,seat_count:4,status:'paid',amount:400}]),'orders');
  for(const [suffix,type] of [['v1','alphard-6'],['v2','hiace-13']])vehicleIds.push(must(await operations.rpc('operations_create_vehicle',{p_registration:`${prefix}-${suffix}`,p_vehicle_type:type,p_external_dispatch_id:null}),`vehicle ${suffix}`));
  const linked=must(await operations.from('driver_resources').select('id').eq('account_id',driverAccount.id).maybeSingle(),'linked driver lookup');linkedDriverAvailable=Boolean(linked);
  if(linked){driverIds.push(linked.id);addedLinkedQualification=!must(await operations.from('driver_vehicle_qualifications').select('driver_id').eq('driver_id',linked.id).eq('vehicle_type_key','alphard-6').maybeSingle(),'qualification lookup');if(addedLinkedQualification)must(await operations.from('driver_vehicle_qualifications').insert({driver_id:linked.id,vehicle_type_key:'alphard-6'}),'linked qualification');const window=must(await operations.from('driver_availability_windows').insert({driver_id:linked.id,starts_at:new Date(startsAt.getTime()-3600_000).toISOString(),ends_at:new Date(endsAt.getTime()+3600_000).toISOString(),source:prefix}).select('id').single(),'linked availability');availabilityIds.push(window.id)}
  else {const created=must(await operations.rpc('operations_create_driver',{p_display_name:`${prefix}-driver1`,p_external_dispatch_id:null,p_vehicle_types:['alphard-6'],p_languages:['zh-CN'],p_available_from:new Date(startsAt.getTime()-3600_000).toISOString(),p_available_until:new Date(endsAt.getTime()+3600_000).toISOString()}),'first driver');must(await operations.from('driver_resources').update({account_id:driverAccount.id}).eq('id',created),'link fictional driver account');driverIds.push(created);linkedDriverAvailable=true;createdLinkedDriver=true}
  driverIds.push(must(await operations.rpc('operations_create_driver',{p_display_name:`${prefix}-driver2`,p_external_dispatch_id:null,p_vehicle_types:['hiace-13'],p_languages:['ja'],p_available_from:new Date(startsAt.getTime()-3600_000).toISOString(),p_available_until:new Date(endsAt.getTime()+3600_000).toISOString()}),'second driver'));
  const tasks=[{sequence:1,vehicleType:'alphard-6',capacity:6,passengerCount:5,driverId:driverIds[0],fleetVehicleId:vehicleIds[0],startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),operationalNotes:['TEST ONLY']},{sequence:2,vehicleType:'hiace-13',capacity:13,passengerCount:4,driverId:driverIds[1],fleetVehicleId:vehicleIds[1],startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),operationalNotes:['TEST ONLY']}];
  taskIds=must(await operations.rpc('operations_save_dispatch_plan',{p_departure:departureId,p_tasks:tasks}),'save plan');
  assignmentIds=must(await operations.from('dispatch_tasks').select('vehicle_assignment_id').in('id',taskIds),'assignments').map(item=>item.vehicle_assignment_id);
  must(await operations.rpc('operations_confirm_dispatch_tasks',{p_task_ids:[taskIds[0]]}),'partial confirm');
  const partial=must(await admin.from('vehicle_groups').select('id',{count:'exact'}).eq('departure_id',departureId),'partial groups');if(partial.length)throw new Error('Partial confirmation created a group');
  must(await operations.rpc('operations_confirm_dispatch_tasks',{p_task_ids:[taskIds[1]]}),'final confirm');
  const taskStates=must(await operations.from('dispatch_tasks').select('id,status').in('id',taskIds),'task states');
  const groups=must(await admin.from('vehicle_groups').select('id').eq('departure_id',departureId),'groups');
  const rooms=must(await admin.from('trip_rooms').select('id').in('vehicle_group_id',groups.map(item=>item.id)),'rooms');
  const assignedOrders=must(await admin.from('vehicle_group_orders').select('order_id').in('vehicle_group_id',groups.map(item=>item.id)),'group orders');
  const membership=must(await admin.from('staff_assignments').select('id').in('vehicle_group_id',groups.map(item=>item.id)).eq('staff_id',driverAccount.id),'driver membership');
  if(groups.length!==2||rooms.length!==2||assignedOrders.length!==2||(linkedDriverAvailable&&membership.length!==1))throw new Error(`Trip Room bridge state mismatch: ${JSON.stringify({groups:groups.length,rooms:rooms.length,orders:assignedOrders.length,membership:membership.length,linkedDriverAvailable,taskStates})}`);
  must(await operations.rpc('operations_cancel_dispatch_tasks',{p_task_ids:[taskIds[0]],p_reason:'TEST cleanup cancellation'}),'cancel');
  const revoked=must(await admin.from('staff_assignments').select('id').in('vehicle_group_id',groups.map(item=>item.id)).eq('staff_id',driverAccount.id),'revocation');if(linkedDriverAvailable&&revoked.length)throw new Error('Cancelled driver retained room access');
  console.log(JSON.stringify({pass:true,partialPlanHidden:true,vehicleGroups:groups.length,tripRooms:rooms.length,ordersAllocated:assignedOrders.length,linkedDriverChecked:linkedDriverAvailable,cancelledDriverRevoked:linkedDriverAvailable}));
}finally{
  if(departureId){const groups=(await admin.from('vehicle_groups').select('id').eq('departure_id',departureId)).data??[];const groupIds=groups.map(item=>item.id);if(groupIds.length){await admin.from('staff_assignments').delete().in('vehicle_group_id',groupIds);await admin.from('trip_room_messages').delete().in('trip_room_id',(await admin.from('trip_rooms').select('id').in('vehicle_group_id',groupIds)).data?.map(item=>item.id)??[]);await admin.from('trip_rooms').delete().in('vehicle_group_id',groupIds);await admin.from('vehicle_group_orders').delete().in('vehicle_group_id',groupIds);await admin.from('vehicle_groups').delete().in('id',groupIds)}}
  if(taskIds.length)await operations.from('dispatch_tasks').delete().in('id',taskIds);
  if(assignmentIds.length)await admin.from('vehicle_assignments').delete().in('id',assignmentIds);
  if(departureId){await admin.from('orders').delete().eq('departure_id',departureId);await admin.from('departures').delete().eq('id',departureId)}
  if(tripId)await admin.from('trips').delete().eq('id',tripId);
  if(availabilityIds.length)await operations.from('driver_availability_windows').delete().in('id',availabilityIds);
  if(addedLinkedQualification&&driverIds[0])await operations.from('driver_vehicle_qualifications').delete().eq('driver_id',driverIds[0]).eq('vehicle_type_key','alphard-6');
  const disposableDrivers=createdLinkedDriver?driverIds:linkedDriverAvailable?driverIds.slice(1):driverIds;if(disposableDrivers.length)await operations.from('driver_resources').delete().in('id',disposableDrivers);
  if(vehicleIds.length)await operations.from('fleet_vehicles').delete().in('id',vehicleIds);
  await operations.auth.signOut();
}
