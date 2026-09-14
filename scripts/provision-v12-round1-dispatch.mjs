import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPERATIONS_EMAIL','OPERATIONS_PASSWORD','DRIVER_EMAIL','DRIVER_PASSWORD'];
for(const key of required)if(!process.env[key])throw new Error(`missing ${key}`);
if(process.env.JTW_RUNTIME_MODE!=='test')throw new Error('V12 scenario provisioning requires explicit test mode');
const [departureId,orderId,batchId]=process.argv.slice(2);
if(!departureId||!orderId||!/^v12-stripe-/.test(batchId??''))throw new Error('departure id, order id and V12 batch id are required');

const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const operations=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const driver=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};

async function restoreAccount(email,password,role){
  const users=must(await admin.auth.admin.listUsers({page:1,perPage:1000}),`list ${role} users`).users;
  const account=users.find(user=>user.email?.toLowerCase()===email.toLowerCase());
  if(!account)throw new Error(`configured ${role} acceptance account does not exist`);
  must(await admin.auth.admin.updateUserById(account.id,{password,email_confirm:true}),`restore ${role} login`);
  must(await admin.from('profiles').upsert({id:account.id,role},{onConflict:'id'}),`restore ${role} profile`);
  return account;
}

const [operationsAccount,driverAccount]=await Promise.all([
  restoreAccount(process.env.OPERATIONS_EMAIL,process.env.OPERATIONS_PASSWORD,'operations'),
  restoreAccount(process.env.DRIVER_EMAIL,process.env.DRIVER_PASSWORD,'driver'),
]);
must(await operations.auth.signInWithPassword({email:process.env.OPERATIONS_EMAIL,password:process.env.OPERATIONS_PASSWORD}),'operations sign-in');
must(await driver.auth.signInWithPassword({email:process.env.DRIVER_EMAIL,password:process.env.DRIVER_PASSWORD}),'driver sign-in');

const departure=must(await admin.from('departures').select('id,departs_at,ends_at,status,dispatch_planning_status').eq('id',departureId).single(),'departure');
const order=must(await admin.from('orders').select('id,status,seat_count,departure_id').eq('id',orderId).single(),'paid order');
if(order.departure_id!==departureId||order.status!=='paid'||Number(order.seat_count)!==2)throw new Error('the retained Stripe order is not the expected two-seat paid order');
const committed=must(await admin.from('orders').select('id,seat_count,status').eq('departure_id',departureId).in('status',['paid','confirmed']),'committed orders');
if(committed.length!==1||committed[0].id!==orderId)throw new Error('departure is no longer isolated to the V12 paid order');
const existingAssignments=must(await admin.from('vehicle_assignments').select('id').eq('departure_id',departureId),'existing assignments');
if(existingAssignments.length)throw new Error('departure already has a dispatch plan');

const vehicleType=must(await operations.from('vehicle_type_configs').select('type_key,sellable_capacity').eq('active',true).gte('sellable_capacity',2).order('sellable_capacity').limit(1).single(),'vehicle type');
const registration=`V12-${Date.now().toString().slice(-6)}`;
const vehicleId=must(await operations.rpc('operations_create_vehicle_v2',{p_registration:registration,p_vehicle_type:vehicleType.type_key,p_external_dispatch_id:null,p_public_color:'测试黄色',p_public_photo_url:null}),'create V12 vehicle');
const driverResourceId=must(await operations.rpc('operations_create_driver_v2',{p_display_name:'V12 隔离测试司机',p_external_dispatch_id:null,p_vehicle_types:[vehicleType.type_key],p_languages:['zh-CN','ja'],p_available_from:new Date(new Date(departure.departs_at).getTime()-60*60_000).toISOString(),p_available_until:new Date(new Date(departure.ends_at).getTime()+60*60_000).toISOString(),p_service_role:'driver',p_public_phone:'000-0000-0000'}),'create V12 driver');
must(await operations.from('driver_resources').update({account_id:driverAccount.id}).eq('id',driverResourceId),'link test driver account');

const taskIds=must(await operations.rpc('operations_save_dispatch_plan',{p_departure:departureId,p_tasks:[{sequence:1,vehicleType:vehicleType.type_key,capacity:Number(vehicleType.sellable_capacity),passengerCount:2,driverId:driverResourceId,fleetVehicleId:vehicleId,startsAt:departure.departs_at,endsAt:departure.ends_at,operationalNotes:['V12-DEMO','测试订单，不发送外部通知']}]}),'save dispatch draft');
const draftGroups=must(await admin.from('vehicle_groups').select('id').eq('departure_id',departureId),'groups before confirmation');
if(draftGroups.length!==0)throw new Error('saving dispatch draft created a vehicle group');
must(await operations.rpc('operations_confirm_dispatch_tasks',{p_task_ids:taskIds}),'confirm V12 dispatch');

const groups=must(await admin.from('vehicle_groups').select('id,vehicle_assignment_id').eq('departure_id',departureId),'confirmed groups');
if(groups.length!==1)throw new Error(`expected one confirmed vehicle group, got ${groups.length}`);
const group=groups[0];
const room=must(await admin.from('trip_rooms').select('id,status,opens_at').eq('vehicle_group_id',group.id).single(),'trip room');
const assignedOrders=must(await admin.from('vehicle_group_orders').select('order_id').eq('vehicle_group_id',group.id),'group orders');
if(assignedOrders.length!==1||assignedOrders[0].order_id!==orderId)throw new Error('paid order was not assigned intact to its vehicle group');

const driverTasks=must(await driver.rpc('get_staff_portal_tasks'),'driver tasks');
const task=driverTasks.find(item=>item.departure_id===departureId);
if(!task||Number(task.passenger_count)!==2||Number(task.booked_seats)!==2)throw new Error(`driver task mismatch: ${JSON.stringify(task??null)}`);
const acknowledgedAt=must(await driver.rpc('acknowledge_own_staff_assignment',{p_staff_assignment:task.staff_assignment_id}),'driver acknowledgement');
const refreshedTask=must(await driver.rpc('get_staff_portal_tasks'),'refreshed driver tasks').find(item=>item.staff_assignment_id===task.staff_assignment_id);
if(!refreshedTask?.assignment_acknowledged||!refreshedTask.assignment_acknowledged_at)throw new Error('driver acknowledgement was not retained');

const notificationCount=await admin.from('notification_outbox').select('id',{count:'exact',head:true}).eq('order_id',orderId);
if(notificationCount.error)throw notificationCount.error;
console.log(JSON.stringify({
  ok:true,batchId,operationsAccountId:operationsAccount.id,departureId,orderId,
  dispatchDraft:{saved:true,vehicleGroupsBeforeConfirmation:0,taskIds},
  confirmedGroup:{vehicleGroupId:group.id,roomId:room.id,roomStatus:room.status,opensAt:room.opens_at,vehicleId,vehicleCode:registration,driverResourceId,driverAccountId:driverAccount.id,passengerCount:2,orderKeptIntact:true},
  driverAcknowledgement:{staffAssignmentId:task.staff_assignment_id,acknowledgedAt,retained:true},
  notificationOutboxCount:notificationCount.count,externalNotificationSent:false,
  retainedForColleagueTesting:true
}));
