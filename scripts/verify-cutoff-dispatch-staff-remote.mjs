import {createHash,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_PUBLISHABLE_KEY'])if(!process.env[key])throw new Error(`missing ${key}`);
if(process.env.JTW_RUNTIME_MODE!=='test')throw new Error('dispatch/staff acceptance requires explicit test mode');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const operations=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const driver=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const passenger=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const prefix=`full-flow-${Date.now()}`;
const state={users:[],tripId:null,departureId:null,orderId:null,vehicleId:null,driverResourceId:null,taskIds:[],assignmentIds:[],groupIds:[],roomIds:[]};
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};
const digest=value=>`\\x${createHash('sha256').update(value).digest('hex')}`;
const createAccount=async role=>{
  const email=`${prefix}-${role}@example.invalid`;const password=`T3st-${randomUUID()}!`;
  const created=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`虚构${role}验收账户`}}),`${role} auth`).user;
  state.users.push(created.id);
  must(await admin.from('profiles').upsert({id:created.id,role},{onConflict:'id'}),`${role} profile`);
  return {id:created.id,email,password};
};
async function cleanup(){
  if(state.roomIds.length){await admin.from('trip_room_messages').delete().in('trip_room_id',state.roomIds);await admin.from('trip_rooms').delete().in('id',state.roomIds)}
  if(state.groupIds.length){await admin.from('staff_assignments').delete().in('vehicle_group_id',state.groupIds);await admin.from('vehicle_group_orders').delete().in('vehicle_group_id',state.groupIds)}
  if(state.taskIds.length){
    if(!state.assignmentIds.length)state.assignmentIds=((await operations.from('dispatch_tasks').select('vehicle_assignment_id').in('id',state.taskIds)).data??[]).map(row=>row.vehicle_assignment_id);
    await operations.from('dispatch_task_audit').delete().in('dispatch_task_id',state.taskIds);await operations.from('dispatch_tasks').delete().in('id',state.taskIds)
  }
  if(state.orderId){const boarding=(await admin.from('boardings').select('id').eq('order_id',state.orderId)).data??[];if(boarding.length){const boardingIds=boarding.map(row=>row.id);await admin.from('boarding_verification_attempts').delete().in('boarding_id',boardingIds);await admin.from('boarding_credentials').delete().in('boarding_id',boardingIds)}for(const table of ['boardings','fulfilment_work_items','notification_outbox','manual_payment_decisions','payment_events','inventory_locks'])await admin.from(table).delete().eq('order_id',state.orderId);await admin.from('orders').delete().eq('id',state.orderId)}
  if(state.groupIds.length)await admin.from('vehicle_groups').delete().in('id',state.groupIds);
  if(state.assignmentIds.length)await admin.from('vehicle_assignments').delete().in('id',state.assignmentIds);
  if(state.departureId){await admin.from('departure_operations_alerts').delete().eq('departure_id',state.departureId);await admin.from('departures').delete().eq('id',state.departureId)}
  if(state.tripId)await admin.from('trips').delete().eq('id',state.tripId);
  if(state.driverResourceId){await operations.from('driver_availability_windows').delete().eq('driver_id',state.driverResourceId);await operations.from('driver_vehicle_qualifications').delete().eq('driver_id',state.driverResourceId);await operations.from('driver_resources').delete().eq('id',state.driverResourceId)}
  if(state.vehicleId)await operations.from('fleet_vehicles').delete().eq('id',state.vehicleId);
  await Promise.all(state.users.map(id=>admin.auth.admin.deleteUser(id)));
}

async function cleanupStale(){
  const trips=(await admin.from('trips').select('id').eq('title','TEST 截单配车司机同步')).data??[];
  for(const trip of trips){
    const departures=(await admin.from('departures').select('id').eq('trip_id',trip.id)).data??[];
    for(const departure of departures){
      const assignments=(await admin.from('vehicle_assignments').select('id').eq('departure_id',departure.id)).data??[];
      const assignmentIds=assignments.map(row=>row.id);
      const tasks=assignmentIds.length?(await operations.from('dispatch_tasks').select('id').in('vehicle_assignment_id',assignmentIds)).data??[]:[];
      const taskIds=tasks.map(row=>row.id);
      if(taskIds.length){await operations.from('dispatch_task_audit').delete().in('dispatch_task_id',taskIds);await operations.from('dispatch_tasks').delete().in('id',taskIds)}
      const groups=(await admin.from('vehicle_groups').select('id').eq('departure_id',departure.id)).data??[];const groupIds=groups.map(row=>row.id);
      if(groupIds.length){const rooms=(await admin.from('trip_rooms').select('id').in('vehicle_group_id',groupIds)).data??[];if(rooms.length)await admin.from('trip_room_messages').delete().in('trip_room_id',rooms.map(row=>row.id));await admin.from('trip_rooms').delete().in('vehicle_group_id',groupIds);await admin.from('staff_assignments').delete().in('vehicle_group_id',groupIds);await admin.from('vehicle_group_orders').delete().in('vehicle_group_id',groupIds)}
      const orders=(await admin.from('orders').select('id').eq('departure_id',departure.id)).data??[];
      for(const order of orders){const boarding=(await admin.from('boardings').select('id').eq('order_id',order.id)).data??[];if(boarding.length){const boardingIds=boarding.map(row=>row.id);await admin.from('boarding_verification_attempts').delete().in('boarding_id',boardingIds);await admin.from('boarding_credentials').delete().in('boarding_id',boardingIds)}for(const table of ['boardings','fulfilment_work_items','notification_outbox','manual_payment_decisions','payment_events','inventory_locks'])await admin.from(table).delete().eq('order_id',order.id);await admin.from('orders').delete().eq('id',order.id)}
      if(groupIds.length)await admin.from('vehicle_groups').delete().in('id',groupIds);
      if(assignmentIds.length)await admin.from('vehicle_assignments').delete().in('id',assignmentIds);
      await admin.from('departure_operations_alerts').delete().eq('departure_id',departure.id);await admin.from('departures').delete().eq('id',departure.id);
    }
    await admin.from('trips').delete().eq('id',trip.id);
  }
}

try{
  const [opsAccount,driverAccount,passengerAccount]=await Promise.all([createAccount('operations'),createAccount('driver'),createAccount('passenger')]);
  must(await operations.auth.signInWithPassword({email:opsAccount.email,password:opsAccount.password}),'operations sign-in');
  must(await driver.auth.signInWithPassword({email:driverAccount.email,password:driverAccount.password}),'driver sign-in');
  must(await passenger.auth.signInWithPassword({email:passengerAccount.email,password:passengerAccount.password}),'passenger sign-in');
  await cleanupStale();
  state.tripId=must(await admin.from('trips').insert({slug:prefix,title:'TEST 截单配车司机同步',status:'published',content:{description:'用于隔离测试项目的班次截单、自动配车与司机任务同步验收，不代表真实销售产品。',itinerary:['TEST 日本桥集合','TEST 京都奈良','TEST 返回大阪'],included:['测试车辆与司机服务'],excluded:['所有真实收费项目'],childPolicy:'儿童政策仅用于虚构验收，不产生真实收费。',luggagePolicy:'一日游原则上不安排大型行李，测试数据不得使用真实行李信息。',accessibilityInfo:'辅助服务必须由运营确认，测试不得输入真实健康信息。',mealInfo:'餐食自理，测试班次不包含任何真实餐食安排。',weatherPolicy:'天气调整遵循依法退款、解除或补偿的正式规则。',cancellationPolicyVersion:'test-2026-09-04'}}).select('id').single(),'trip').id;
  const now=new Date();const departs=new Date(now.getTime()+20*60*60_000);const ends=new Date(departs.getTime()+10*60*60_000);
  state.departureId=must(await admin.from('departures').insert({trip_id:state.tripId,departs_at:departs.toISOString(),ends_at:ends.toISOString(),capacity:20,status:'open',meeting_name:'TEST-日本桥端到端集合点',meeting_address:'TEST-大阪市中央区日本桥端到端验收地址',map_lat:34.666944,map_lng:135.506111,seat_price_jpy:7600,sales_open_at:new Date(now.getTime()-48*60*60_000).toISOString(),sales_close_at:new Date(now.getTime()-60_000).toISOString(),booking_closes_at:new Date(now.getTime()-1_000).toISOString(),chat_opens_at:new Date(now.getTime()-1_000).toISOString(),minimum_guests:1,currency:'JPY',tax_included:true}).select('id').single(),'departure').id;
  state.orderId=randomUUID();must(await admin.from('orders').insert({id:state.orderId,account_id:passengerAccount.id,departure_id:state.departureId,idempotency_key:`${prefix}-order`,seat_count:6,status:'paid',currency:'JPY',amount:45600}),'paid order');
  must(await admin.from('passengers').insert(Array.from({length:6},(_,index)=>({order_id:state.orderId,display_name:`虚构乘客${index+1}`,passenger_type:index===5?'child':'adult'}))),'passengers');
  const cutoff=must(await admin.rpc('process_due_departure_cutoffs',{p_now:now.toISOString()}),'cutoff');if(cutoff?.[0]?.result!=='ready_for_planning')throw new Error(`six passengers not ready for planning: ${JSON.stringify(cutoff)}`);
  state.vehicleId=must(await operations.rpc('operations_create_vehicle_v2',{p_registration:`TEST-${Date.now().toString().slice(-6)}`,p_vehicle_type:'alphard-6',p_external_dispatch_id:null,p_public_color:'黑色',p_public_photo_url:null}),'vehicle');
  state.driverResourceId=must(await operations.rpc('operations_create_driver_v2',{p_display_name:'虚构验收司机',p_external_dispatch_id:null,p_vehicle_types:['alphard-6'],p_languages:['zh-CN','ja'],p_available_from:new Date(departs.getTime()-60*60_000).toISOString(),p_available_until:new Date(ends.getTime()+60*60_000).toISOString(),p_service_role:'driver',p_public_phone:'000-0000-0000'}),'driver resource');
  must(await operations.from('driver_resources').update({account_id:driverAccount.id}).eq('id',state.driverResourceId),'link driver account');
  state.taskIds=must(await operations.rpc('operations_save_dispatch_plan',{p_departure:state.departureId,p_tasks:[{sequence:1,vehicleType:'alphard-6',capacity:6,passengerCount:6,driverId:state.driverResourceId,fleetVehicleId:state.vehicleId,startsAt:departs.toISOString(),endsAt:ends.toISOString(),operationalNotes:['TEST ONLY','截单后配车']}]}),'save plan');
  state.assignmentIds=must(await operations.from('dispatch_tasks').select('vehicle_assignment_id').in('id',state.taskIds),'assignments').map(row=>row.vehicle_assignment_id);
  must(await operations.rpc('operations_confirm_dispatch_tasks',{p_task_ids:state.taskIds}),'confirm dispatch');
  state.groupIds=must(await admin.from('vehicle_groups').select('id').eq('departure_id',state.departureId),'groups').map(row=>row.id);
  state.roomIds=must(await admin.from('trip_rooms').select('id,status,opens_at').in('vehicle_group_id',state.groupIds),'rooms').map(row=>row.id);
  const driverTasks=must(await driver.rpc('get_staff_portal_tasks'),'driver tasks');
  const passengerTasks=must(await passenger.rpc('get_staff_portal_tasks'),'passenger task isolation');
  const task=driverTasks.find(row=>row.departure_id===state.departureId);
  if(!task||task.passenger_count!==6||task.booked_seats!==6||task.room_status!=='open'||task.chat_opens_at==null)throw new Error(`driver task mismatch: ${JSON.stringify(task??null)}`);
  if(passengerTasks.length!==0)throw new Error('passenger received staff task');
  const status=must(await admin.from('departures').select('dispatch_planning_status').eq('id',state.departureId).single(),'departure status');if(status.dispatch_planning_status!=='confirmed')throw new Error('departure was not confirmed');
  const groupId=state.groupIds[0];
  const passengerRows=must(await admin.from('passengers').select('id').eq('order_id',state.orderId).order('created_at'),'passenger ids');
  const meetingRevision=must(await driver.rpc('update_vehicle_group_meeting',{p_vehicle_group:groupId,p_meeting_at:departs.toISOString(),p_meeting_name:'TEST 日本桥集合点',p_meeting_address:'TEST 大阪市中央区日本桥验收地址',p_latitude:34.666944,p_longitude:135.506111,p_landmark_description:'TEST 黄色验收旗帜旁',p_reason:'首次确认测试集合点',p_idempotency_key:`${prefix}-confirm-meeting`}),'confirm meeting');
  const executionEvents=[
    ['task_accepted',{},'accept-task'],
    ['meeting_started',{},'start-meeting'],
    ['delay_reported',{detail:'TEST 道路拥堵，预计延迟五分钟'},'report-delay'],
    ['incident_reported',{detail:'TEST 仅验收事故上报链路，无真实事故'},'report-incident'],
    ['support_requested',{detail:'TEST 请求运营协助确认集合信息'},'request-support'],
  ];
  for(const [eventType,detail,key] of executionEvents)must(await driver.rpc('record_staff_execution_event',{p_vehicle_group:groupId,p_event_type:eventType,p_detail:detail,p_idempotency_key:`${prefix}-${key}`}),`staff ${eventType}`);
  const passengerStaffAttempt=await passenger.rpc('record_staff_execution_event',{p_vehicle_group:groupId,p_event_type:'task_accepted',p_detail:{},p_idempotency_key:`${prefix}-passenger-denied`});
  if(!passengerStaffAttempt.error)throw new Error('passenger was allowed to record a staff execution event');
  const ownArrival=must(await passenger.rpc('set_own_passenger_checkin',{p_passenger:passengerRows[0].id,p_status:'at_meeting_point',p_idempotency_key:`${prefix}-own-arrival`}),'own arrival');
  const ownLate=must(await passenger.rpc('report_own_late_arrival',{p_passenger:passengerRows[1].id,p_minutes:10,p_idempotency_key:`${prefix}-own-late`}),'own late report');
  const staffBoarded=must(await driver.rpc('set_staff_passenger_checkin',{p_vehicle_group:groupId,p_passenger:passengerRows[2].id,p_status:'boarded',p_idempotency_key:`${prefix}-staff-boarded`}),'staff attendance');
  const attendance=must(await driver.rpc('get_vehicle_group_attendance',{p_vehicle_group:groupId}),'staff attendance view');
  if(attendance.length!==6)throw new Error(`attendance count mismatch: ${attendance.length}`);
  const rawToken=`bp_${randomUUID().replaceAll('-','')}${randomUUID().replaceAll('-','')}`;
  const expiresAt=new Date(Date.now()+12*60*60_000).toISOString();
  const issued=must(await admin.rpc('issue_owner_boarding_credential',{p_order:state.orderId,p_account:passengerAccount.id,p_token_digest:digest(rawToken),p_expires_at:expiresAt}),'issue boarding credential')?.[0];
  if(!issued||issued.vehicle_group_id!==groupId)throw new Error('boarding credential was issued for the wrong vehicle group');
  const firstScan=must(await admin.rpc('verify_boarding_credential',{p_token_digest:digest(rawToken),p_scanner_account:driverAccount.id,p_vehicle_group:groupId,p_idempotency_key:`${prefix}-scan-1`,p_now:new Date().toISOString()}),'first boarding scan')?.[0];
  const secondScan=must(await admin.rpc('verify_boarding_credential',{p_token_digest:digest(rawToken),p_scanner_account:driverAccount.id,p_vehicle_group:groupId,p_idempotency_key:`${prefix}-scan-2`,p_now:new Date().toISOString()}),'duplicate boarding scan')?.[0];
  if(firstScan?.result!=='valid'||secondScan?.result!=='used')throw new Error(`boarding replay protection mismatch: ${firstScan?.result}/${secondScan?.result}`);
  const meetingNotifications=must(await passenger.from('notification_outbox').select('event_type,status').eq('order_id',state.orderId).eq('event_type','meeting-started'),'meeting notifications');
  if(meetingNotifications.length!==1||meetingNotifications[0].status!=='pending')throw new Error(`meeting notification mismatch: ${JSON.stringify(meetingNotifications)}`);
  const nextMeetingAt=new Date(departs.getTime()+3*60*60_000).toISOString();
  const changedRevision=must(await driver.rpc('update_vehicle_group_meeting',{p_vehicle_group:groupId,p_meeting_at:nextMeetingAt,p_meeting_name:'TEST 东大寺南大门东侧',p_meeting_address:'TEST 奈良市东大寺集合验收地址',p_latitude:34.688985,p_longitude:135.839815,p_landmark_description:'TEST 南大门东侧黄色旗帜',p_reason:'到达下一景点后更新集合点',p_idempotency_key:`${prefix}-next-meeting`}),'update next meeting');
  const passengerMeeting=must(await passenger.rpc('get_current_vehicle_group_meeting',{p_vehicle_group:groupId}),'passenger meeting')?.[0];
  if(Number(passengerMeeting?.revision)!==Number(changedRevision)||Number(passengerMeeting?.latitude)!==34.688985)throw new Error('passenger did not receive the new meeting point');
  const acknowledged=must(await passenger.rpc('acknowledge_vehicle_group_meeting',{p_vehicle_group:groupId,p_revision:Number(changedRevision)}),'acknowledge meeting');
  if(acknowledged!==true)throw new Error('passenger meeting acknowledgement failed');
  must(await driver.rpc('publish_driver_location',{p_vehicle_group:groupId,p_latitude:34.6891,p_longitude:135.8399,p_accuracy_meters:8,p_minutes:15}),'publish driver location');
  const passengerLocation=must(await passenger.rpc('get_active_driver_location',{p_vehicle_group:groupId}),'passenger driver location')?.[0];
  if(Number(passengerLocation?.latitude)!==34.6891||Number(passengerLocation?.longitude)!==135.8399)throw new Error('driver location was not visible to assigned passenger');
  const arrivedStop=must(await driver.rpc('advance_vehicle_group_journey',{p_vehicle_group:groupId,p_action:'stop_arrived',p_stop_name:'东大寺',p_reason:'车辆已停稳，开始自由活动',p_idempotency_key:`${prefix}-stop-arrived`}),'arrive stop')?.[0];
  if(arrivedStop?.status!=='in_progress'||arrivedStop?.current_stop_name!=='东大寺')throw new Error('stop arrival did not advance journey');
  const completed=must(await driver.rpc('advance_vehicle_group_journey',{p_vehicle_group:groupId,p_action:'trip_completed',p_stop_name:'',p_reason:'已安全返回大阪日本桥',p_idempotency_key:`${prefix}-trip-completed`}),'complete journey')?.[0];
  if(completed?.status!=='completed'||completed?.room_status!=='closed')throw new Error(`journey completion mismatch: ${JSON.stringify(completed)}`);
  const locationAfterCompletion=must(await passenger.rpc('get_active_driver_location',{p_vehicle_group:groupId}),'location after completion');
  if(locationAfterCompletion.length!==0)throw new Error('driver location remained visible after journey completion');
  const closedMessageAttempt=await passenger.rpc('send_trip_room_message',{p_room:state.roomIds[0],p_content:'TEST 行程结束后不应发送',p_idempotency_key:`${prefix}-closed-message`});
  if(!closedMessageAttempt.error)throw new Error('passenger could send chat messages after journey completion');
  const completedDeparture=must(await admin.from('departures').select('status').eq('id',state.departureId).single(),'completed departure');
  if(completedDeparture.status!=='completed')throw new Error('departure was not marked completed');
  const storedEvents=must(await driver.from('staff_execution_events').select('event_type').eq('vehicle_group_id',groupId),'stored staff events');
  if(storedEvents.length!==executionEvents.length+4)throw new Error(`staff event count mismatch: ${storedEvents.length}`);
  console.log(JSON.stringify({ok:true,cutoff:'ready_for_planning',passengers:6,vehicleGroups:state.groupIds.length,driverTaskVisible:true,driverPassengerCount:task.passenger_count,chatStatus:task.room_status,chatOpensAt:task.chat_opens_at,passengerStaffTasks:passengerTasks.length,dispatchStatus:status.dispatch_planning_status,meetingRevision,taskAccepted:true,meetingStarted:true,meetingNotificationQueued:meetingNotifications.length,executionEvents:storedEvents.length,passengerStaffDenied:true,ownArrival:ownArrival?.[0]?.status,lateMinutes:ownLate?.[0]?.late_minutes,staffAttendance:staffBoarded?.[0]?.status,attendanceRows:attendance.length,boardingFirstScan:firstScan.result,boardingDuplicateScan:secondScan.result,nextMeetingRevision:Number(changedRevision),passengerAcknowledgedMeeting:acknowledged,driverLocationVisible:true,stopArrived:arrivedStop.current_stop_name,journeyStatus:completed.status,roomStatus:completed.room_status,driverLocationStopped:true,closedChatRejected:true,departureStatus:completedDeparture.status,cleanup:'pending'}));
}finally{
  await cleanup();
  await Promise.allSettled([operations.auth.signOut(),driver.auth.signOut(),passenger.auth.signOut()]);
  const remaining=state.departureId?(await admin.from('departures').select('id').eq('id',state.departureId)).data??[]:[];
  console.log(JSON.stringify({cleanupComplete:remaining.length===0,remaining:remaining.length}));
}
