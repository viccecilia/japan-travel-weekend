import {createHash,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])if(!process.env[key])throw new Error(`missing ${key}`);
if(process.env.JTW_RUNTIME_MODE!=='test')throw new Error('V12 payment cancellation verification requires explicit test mode');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const batchId=`v12-cancel-${Date.now()}-${randomUUID().slice(0,8)}`;
const state={userId:null,tripId:null,departureId:null,orderId:null,holdId:null};
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};

async function cleanup(){
  if(state.orderId){
    for(const table of ['notification_outbox','fulfilment_work_items','payment_events','inventory_locks'])await admin.from(table).delete().eq('order_id',state.orderId);
    await admin.from('orders').delete().eq('id',state.orderId);
  }
  if(state.departureId)await admin.from('departures').delete().eq('id',state.departureId);
  if(state.tripId)await admin.from('trips').delete().eq('id',state.tripId);
  if(state.userId)await admin.auth.admin.deleteUser(state.userId);
}

try{
  const account=must(await admin.auth.admin.createUser({email:`${batchId}@example.invalid`,password:`V12-${randomUUID()}!`,email_confirm:true,user_metadata:{display_name:'V12 取消付款隔离游客'}}),'create user').user;
  state.userId=account.id;
  must(await admin.from('profiles').upsert({id:account.id,role:'passenger',display_name:'V12 取消付款隔离游客'},{onConflict:'id'}),'profile');
  state.tripId=must(await admin.from('trips').insert({slug:batchId,title:'TEST V12 取消付款释放',status:'draft'}).select('id').single(),'trip').id;
  const departsAt=new Date(Date.now()+48*60*60_000);
  state.departureId=must(await admin.from('departures').insert({
    trip_id:state.tripId,departs_at:departsAt.toISOString(),ends_at:new Date(departsAt.getTime()+10*60*60_000).toISOString(),capacity:9,status:'open',sales_scope:'internal_test',
    seat_price_jpy:100,sales_open_at:new Date(Date.now()-60*60_000).toISOString(),sales_close_at:new Date(departsAt.getTime()-24*60*60_000).toISOString(),minimum_guests:1,currency:'JPY',tax_included:true,
    meeting_name:'TEST V12 集合点',meeting_address:'TEST 大阪市中央区隔离测试地址',map_lat:34.666944,map_lng:135.506111
  }).select('id').single(),'departure').id;
  const reserved=must(await admin.rpc('reserve_inventory',{p_departure:state.departureId,p_account:account.id,p_seats:2,p_key:batchId,p_expires:new Date(Date.now()+15*60_000).toISOString()}),'reserve')?.[0];
  state.orderId=reserved.order_id;state.holdId=reserved.hold_id;
  const eventId=`evt_${batchId}`;
  const applied=must(await admin.rpc('apply_payment_event',{p_event_id:eventId,p_order:state.orderId,p_status:'cancelled',p_created:new Date().toISOString(),p_digest:`\\x${createHash('sha256').update(eventId).digest('hex')}`}),'cancel event');
  const replay=must(await admin.rpc('apply_payment_event',{p_event_id:eventId,p_order:state.orderId,p_status:'cancelled',p_created:new Date().toISOString(),p_digest:`\\x${createHash('sha256').update(eventId).digest('hex')}`}),'cancel replay');
  const [order,hold,eventCount]=await Promise.all([
    admin.from('orders').select('status').eq('id',state.orderId).single(),
    admin.from('inventory_locks').select('status').eq('id',state.holdId).single(),
    admin.from('payment_events').select('id',{count:'exact',head:true}).eq('provider_event_id',eventId),
  ]);
  if(order.error||hold.error||eventCount.error)throw order.error??hold.error??eventCount.error;
  if(applied!==true||replay!==false||order.data.status!=='cancelled'||hold.data.status!=='released'||eventCount.count!==1)throw new Error(`cancellation mismatch: ${JSON.stringify({applied,replay,order:order.data,hold:hold.data,eventCount:eventCount.count})}`);
  console.log(JSON.stringify({ok:true,batchId,orderStatus:'cancelled',holdStatus:'released',eventCount:1,replayIdempotent:true,cleanup:'pending'}));
}finally{
  await cleanup();
  const remaining=state.orderId?(await admin.from('orders').select('id').eq('id',state.orderId)).data??[]:[];
  console.log(JSON.stringify({cleanupComplete:remaining.length===0,remaining:remaining.length}));
}
