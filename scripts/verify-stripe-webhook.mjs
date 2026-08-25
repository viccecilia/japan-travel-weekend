import Stripe from 'stripe';
import {createClient} from '@supabase/supabase-js';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','STRIPE_WEBHOOK_SECRET'];
for(const name of required)if(!process.env[name])throw new Error(`Missing ${name}`);
if(!process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_'))throw new Error('Test webhook secret required');

const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data:profiles,error:profileError}=await admin.from('profiles').select('id').limit(1);
if(profileError||!profiles?.[0])throw profileError??new Error('No fictional test profile');
const {data:departures,error:departureError}=await admin.from('departures').select('id,capacity').eq('status','open').order('capacity',{ascending:false});
if(departureError||!departures?.length)throw departureError??new Error('No open test departure');
const departure=departures[0];
const stamp=Date.now();
const idempotencyKey=`stripe-webhook-acceptance-${stamp}`;
const expiresAt=new Date(Date.now()+15*60_000).toISOString();
const {data:reserved,error:reserveError}=await admin.rpc('reserve_inventory',{p_departure:departure.id,p_account:profiles[0].id,p_seats:1,p_key:idempotencyKey,p_expires:expiresAt});
if(reserveError||!reserved?.[0])throw reserveError??new Error('Inventory reservation failed');
const orderId=reserved[0].order_id;
const holdId=reserved[0].hold_id;
const paymentIntentId=`pi_jtw_acceptance_${stamp}`;
const {data:recorded,error:recordError}=await admin.rpc('record_stripe_payment_intent',{p_order:orderId,p_payment_intent:paymentIntentId,p_amount:100});
if(recordError||recorded!==true)throw recordError??new Error('Payment intent record failed');

const eventId=`evt_jtw_acceptance_${stamp}`;
const payload=JSON.stringify({id:eventId,object:'event',api_version:'2026-07-29.dahlia',created:Math.floor(Date.now()/1000),data:{object:{id:paymentIntentId,object:'payment_intent',metadata:{order_id:orderId}}},livemode:false,pending_webhooks:1,request:null,type:'payment_intent.succeeded'});
const signature=Stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
const response=await fetch('https://api-test.japan-travel.info/v1/webhooks/stripe',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:payload});
const responseBody=await response.json();
if(!response.ok||responseBody.accepted!==true)throw new Error(`Webhook rejected with ${response.status}`);
const duplicateResponse=await fetch('https://api-test.japan-travel.info/v1/webhooks/stripe',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:payload});
const duplicateBody=await duplicateResponse.json();
if(!duplicateResponse.ok||duplicateBody.accepted!==true||duplicateBody.duplicate!==true)throw new Error('Duplicate webhook was not handled idempotently');

const [{data:order,error:orderError},{data:hold,error:holdError},{count:eventCount,error:eventError}]=await Promise.all([
  admin.from('orders').select('status,amount,payment_intent_id').eq('id',orderId).single(),
  admin.from('inventory_locks').select('status').eq('id',holdId).single(),
  admin.from('payment_events').select('id',{count:'exact',head:true}).eq('provider_event_id',eventId),
]);
if(orderError||holdError||eventError)throw orderError??holdError??eventError;
if(order.status!=='paid'||order.amount!==100||order.payment_intent_id!==paymentIntentId||hold.status!=='committed'||eventCount!==1)throw new Error('Webhook state transition verification failed');
console.log(JSON.stringify({pass:true,mode:'stripe-test-signed-webhook',orderStatus:order.status,holdStatus:hold.status,eventRecorded:eventCount===1,duplicateIdempotent:true}));
