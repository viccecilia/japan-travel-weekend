import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {readEmailAlertConfig,sendEmailAlert} from '../.server-dist/server/emailAlerts.js';

for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])if(!process.env[key])throw new Error(`missing ${key}`);
if(process.env.JTW_RUNTIME_MODE!=='test')throw new Error('remote cutoff acceptance requires explicit test mode');
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ids={departures:[randomUUID(),randomUUID()],orders:[],prefix:`cutoff-acceptance-${Date.now()}`,createdUser:null};
const now=new Date();
const departsAt=new Date(now.getTime()+12*60*60*1000).toISOString();
const endsAt=new Date(now.getTime()+22*60*60*1000).toISOString();
const salesOpenAt=new Date(now.getTime()-48*60*60*1000).toISOString();
const salesCloseAt=new Date(now.getTime()-60*1000).toISOString();
const bookingClosesAt=new Date(now.getTime()-1000).toISOString();
const chatOpensAt=new Date(now.getTime()-1000).toISOString();
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
async function cleanupDepartures(departureIds){
  if(!departureIds.length)return;
  const {data:orders}=await client.from('orders').select('id').in('departure_id',departureIds);
  const orderIds=(orders??[]).map(order=>order.id);
  if(orderIds.length){
    await client.from('boarding_verification_attempts').delete().in('boarding_id',(await client.from('boardings').select('id').in('order_id',orderIds)).data?.map(row=>row.id)??[]);
    await client.from('boardings').delete().in('order_id',orderIds);
    await client.from('vehicle_group_orders').delete().in('order_id',orderIds);
    await client.from('inventory_locks').delete().in('order_id',orderIds);
    await client.from('fulfilment_work_items').delete().in('order_id',orderIds);
    await client.from('notification_outbox').delete().in('order_id',orderIds);
    await client.from('manual_payment_decisions').delete().in('order_id',orderIds);
    await client.from('payment_events').delete().in('order_id',orderIds);
    await client.from('booking_drafts').update({converted_order_id:null}).in('converted_order_id',orderIds);
    const {error}=await client.from('orders').delete().in('id',orderIds);if(error)throw error;
  }
  const {error}=await client.from('departures').delete().in('id',departureIds);if(error)throw error;
}
try{
  const {data:stale}=await client.from('departures').select('id').eq('meeting_name','TEST-日本桥集合点');
  await cleanupDepartures((stale??[]).map(row=>row.id));
  const [{data:trip,error:tripError},{data:existingProfile}]=await Promise.all([
    client.from('trips').select('id,title').eq('status','published').limit(1).single(),
    client.from('profiles').select('id').limit(1).single(),
  ]);
  if(tripError||!trip)throw new Error('published test trip unavailable');
  let profile=existingProfile;
  if(!profile){
    const email=`cutoff-${Date.now()}@example.invalid`;
    const {data:created,error:createError}=await client.auth.admin.createUser({email,password:`T3st-${randomUUID()}!`,email_confirm:true,user_metadata:{display_name:'截单验收虚构乘客'}});
    if(createError||!created.user)throw createError??new Error('temporary fictional user unavailable');
    ids.createdUser=created.user.id;
    const {data:createdProfile}=await client.from('profiles').select('id').eq('id',created.user.id).maybeSingle();
    if(createdProfile)profile=createdProfile;
    else{
      const {error:insertProfileError}=await client.from('profiles').insert({id:created.user.id,role:'passenger'});if(insertProfileError)throw insertProfileError;
      profile={id:created.user.id};
    }
  }
  const departures=ids.departures.map(id=>({id,trip_id:trip.id,departs_at:departsAt,ends_at:endsAt,capacity:20,status:'open',meeting_name:'TEST-日本桥集合点',meeting_address:'TEST-大阪市中央区日本桥集合地址',map_lat:34.666944,map_lng:135.506111,seat_price_jpy:7600,sales_open_at:salesOpenAt,sales_close_at:salesCloseAt,booking_closes_at:bookingClosesAt,chat_opens_at:chatOpensAt,minimum_guests:1,currency:'JPY',tax_included:true}));
  const {error:departureError}=await client.from('departures').insert(departures);if(departureError)throw departureError;
  for(const [departureIndex,seats] of [6,3].entries()){
    const orderId=randomUUID();ids.orders.push(orderId);
    const {error}=await client.from('orders').insert({id:orderId,account_id:profile.id,departure_id:ids.departures[departureIndex],idempotency_key:`${ids.prefix}-${seats}`,seat_count:seats,status:'paid',currency:'JPY',amount:seats*7600});if(error)throw error;
  }
  const {data:processed,error:processError}=await client.rpc('process_due_departure_cutoffs',{p_now:now.toISOString()});if(processError)throw processError;
  const byId=new Map((processed??[]).map(row=>[row.processed_departure_id,row]));
  assert(byId.get(ids.departures[0])?.result==='ready_for_planning','6-seat departure was not ready for planning');
  assert(byId.get(ids.departures[1])?.result==='needs_manual_review','3-seat departure was not routed to manual review');
  const {data:rows,error:rowError}=await client.from('departures').select('id,status,dispatch_planning_status,booking_closes_at,chat_opens_at').in('id',ids.departures);if(rowError)throw rowError;
  assert(rows?.every(row=>row.status==='closed'),'sales were not closed');
  const {data:alert,error:alertError}=await client.from('departure_operations_alerts').select('id,passenger_count,threshold,email_alerted_at').eq('departure_id',ids.departures[1]).single();if(alertError||!alert)throw alertError??new Error('low-booking alert missing');
  assert(alert.passenger_count===3&&alert.threshold===4,'low-booking alert counts are wrong');
  const config=readEmailAlertConfig(process.env);let emailed=false;
  if(config){
    await sendEmailAlert(config,{event:'low-booking',endpoint:'departure-cutoff-acceptance',consecutiveFailures:0,occurredAt:now,departureId:ids.departures[1],tripTitle:`${trip.title}（虚构验收）`,departsAt,passengerCount:3,threshold:4});
    const {error}=await client.rpc('mark_departure_alert_emailed',{p_alert:alert.id,p_now:new Date().toISOString()});if(error)throw error;
    emailed=true;
  }
  console.log(JSON.stringify({ok:true,fixtures:{readyForPlanning:6,manualReview:3},salesClosed:true,manualAlert:true,emailEnabled:config!==null,emailed,cleanup:'pending'}));
}finally{
  await cleanupDepartures(ids.departures);
  if(ids.createdUser)await client.auth.admin.deleteUser(ids.createdUser);
  const {data:remaining}=await client.from('departures').select('id').in('id',ids.departures);
  console.log(JSON.stringify({cleanupComplete:(remaining??[]).length===0,remaining:(remaining??[]).length}));
}
