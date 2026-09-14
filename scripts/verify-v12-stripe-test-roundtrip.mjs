import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import Stripe from 'stripe';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','PASSENGER_EMAIL','PASSENGER_PASSWORD'];
for(const key of required)if(!process.env[key])throw new Error(`missing ${key}`);
if(process.env.JTW_RUNTIME_MODE!=='test'||!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'))throw new Error('V12 Stripe verification requires explicit test mode');

const apiBase=process.env.JTW_TEST_API_BASE??'https://api-test.japan-travel.info';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const passenger=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
const batchId=`v12-stripe-${Date.now()}-${randomUUID().slice(0,8)}`;
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};

const users=must(await admin.auth.admin.listUsers({page:1,perPage:1000}),'list test users').users;
const account=users.find(user=>user.email?.toLowerCase()===process.env.PASSENGER_EMAIL.toLowerCase());
if(!account)throw new Error('configured passenger acceptance account does not exist');
must(await admin.auth.admin.updateUserById(account.id,{password:process.env.PASSENGER_PASSWORD,email_confirm:true}),'restore test passenger login');
must(await admin.from('profiles').upsert({id:account.id,role:'passenger'},{onConflict:'id'}),'restore passenger role');
const session=must(await passenger.auth.signInWithPassword({email:process.env.PASSENGER_EMAIL,password:process.env.PASSENGER_PASSWORD}),'passenger sign-in');
const token=session.session?.access_token;
if(!token)throw new Error('passenger access token missing');

const departures=must(await admin.rpc('list_sellable_departures'),'sellable departures');
let selected=null;
for(const departure of departures){
  if(Number(departure.seat_price_jpy)<=100||Number(departure.available_seats)<4)continue;
  const existing=await admin.from('orders').select('id',{count:'exact',head:true}).eq('departure_id',departure.id).in('status',['paid','confirmed']);
  if(existing.error)throw existing.error;
  if((existing.count??0)===0){selected=departure;break;}
}
if(!selected)throw new Error('no sellable departure with clean test capacity is available');

async function checkout(seats,suffix){
  const idempotencyKey=`${batchId}-${suffix}`;
  const response=await fetch(`${apiBase}/v1/checkout`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',origin:'https://weekend.japan-travel.info'},body:JSON.stringify({departureId:selected.id,seats,idempotencyKey,paymentMethod:'card'})});
  const body=await response.json();
  if(!response.ok||body.status!=='requires_payment_action'||!body.clientSecret)throw new Error(`${suffix} checkout failed ${response.status}: ${JSON.stringify(body)}`);
  return {...body,paymentIntentId:body.clientSecret.split('_secret_')[0],idempotencyKey};
}

async function waitFor(label,probe,attempts=30){
  for(let attempt=0;attempt<attempts;attempt+=1){
    const value=await probe();
    if(value)return value;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error(`${label} timed out`);
}

const success=await checkout(2,'success');
const succeededIntent=await stripe.paymentIntents.confirm(success.paymentIntentId,{payment_method:'pm_card_visa',return_url:'https://weekend.japan-travel.info/app/payment-result'});
if(succeededIntent.livemode||succeededIntent.status!=='succeeded'||succeededIntent.amount!==success.amount)throw new Error(`unexpected success intent: ${JSON.stringify({livemode:succeededIntent.livemode,status:succeededIntent.status,amount:succeededIntent.amount,quote:success.amount})}`);
const settled=await waitFor('success webhook',async()=>{
  const [order,hold,eventCount,noticeCount]=await Promise.all([
    admin.from('orders').select('status,amount,currency,payment_intent_id').eq('id',success.orderId).single(),
    admin.from('inventory_locks').select('status,seats').eq('id',success.holdId).single(),
    admin.from('payment_events').select('id',{count:'exact',head:true}).eq('order_id',success.orderId).eq('status','succeeded'),
    admin.from('notification_outbox').select('id',{count:'exact',head:true}).eq('order_id',success.orderId).eq('event_type','order-confirmed'),
  ]);
  if(order.error||hold.error||eventCount.error||noticeCount.error)throw order.error??hold.error??eventCount.error??noticeCount.error;
  return order.data.status==='paid'&&hold.data.status==='committed'&&eventCount.count===1&&noticeCount.count===1?{order:order.data,hold:hold.data,eventCount:eventCount.count,noticeCount:noticeCount.count}:null;
});
must(await admin.from('passengers').insert([
  {order_id:success.orderId,display_name:'V12 测试旅客甲',passenger_type:'adult'},
  {order_id:success.orderId,display_name:'V12 测试旅客乙',passenger_type:'adult'},
]),'create fictional passenger list');

const providerEvent=must(await admin.from('payment_events').select('provider_event_id').eq('order_id',success.orderId).eq('status','succeeded').single(),'success event');
const stripeEvent=await stripe.events.retrieve(providerEvent.provider_event_id);
const replayPayload=JSON.stringify(stripeEvent);
const replaySignature=Stripe.webhooks.generateTestHeaderString({payload:replayPayload,secret:process.env.STRIPE_WEBHOOK_SECRET});
const replayResponse=await fetch(`${apiBase}/v1/webhooks/stripe`,{method:'POST',headers:{'content-type':'application/json','stripe-signature':replaySignature},body:replayPayload});
const replayBody=await replayResponse.json();
if(!replayResponse.ok||replayBody.accepted!==true||replayBody.duplicate!==true)throw new Error(`webhook replay not idempotent: ${JSON.stringify(replayBody)}`);

const failed=await checkout(1,'failure');
let declineCode=null;
try{
  await stripe.paymentIntents.confirm(failed.paymentIntentId,{payment_method:'pm_card_chargeDeclined',return_url:'https://weekend.japan-travel.info/app/payment-result'});
  throw new Error('declined test card unexpectedly succeeded');
}catch(error){
  if(error?.type!=='StripeCardError')throw error;
  declineCode=error.code??'card_declined';
}
const failureState=await waitFor('failure webhook',async()=>{
  const [order,hold,eventCount]=await Promise.all([
    admin.from('orders').select('status').eq('id',failed.orderId).single(),
    admin.from('inventory_locks').select('status').eq('id',failed.holdId).single(),
    admin.from('payment_events').select('id',{count:'exact',head:true}).eq('order_id',failed.orderId).eq('status','failed'),
  ]);
  if(order.error||hold.error||eventCount.error)throw order.error??hold.error??eventCount.error;
  return eventCount.count===1?{order:order.data.status,hold:hold.data.status,eventCount:eventCount.count}:null;
});
if(failureState.order!=='pending_payment'||failureState.hold!=='held')throw new Error(`decline retry state mismatch: ${JSON.stringify(failureState)}`);

await stripe.paymentIntents.cancel(failed.paymentIntentId);
const cancelledState=await waitFor('cancellation webhook',async()=>{
  const [order,hold,eventCount]=await Promise.all([
    admin.from('orders').select('status').eq('id',failed.orderId).single(),
    admin.from('inventory_locks').select('status').eq('id',failed.holdId).single(),
    admin.from('payment_events').select('id',{count:'exact',head:true}).eq('order_id',failed.orderId).eq('status','cancelled'),
  ]);
  if(order.error||hold.error||eventCount.error)throw order.error??hold.error??eventCount.error;
  return order.data.status==='cancelled'&&hold.data.status==='released'&&eventCount.count===1?{order:order.data.status,hold:hold.data.status,eventCount:eventCount.count}:null;
});

console.log(JSON.stringify({
  ok:true,batchId,livemode:false,departureId:selected.id,tripSlug:selected.trip_slug,
  success:{orderId:success.orderId,seats:2,amount:success.amount,currency:settled.order.currency,status:settled.order.status,holdStatus:settled.hold.status,eventCount:settled.eventCount,confirmationNoticeCount:settled.noticeCount,replayDuplicate:true},
  failure:{orderId:failed.orderId,declineCode,statusBeforeCancel:failureState.order,holdBeforeCancel:failureState.hold},
  cancellation:{orderStatus:cancelledState.order,holdStatus:cancelledState.hold,eventCount:cancelledState.eventCount},
  retainedForRound1:true
}));
