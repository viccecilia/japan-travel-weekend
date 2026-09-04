import {createClient} from '@supabase/supabase-js';
import Stripe from 'stripe';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','STRIPE_SECRET_KEY','JTW_OTHER_EMAIL','JTW_OTHER_PASSWORD'];
if(required.some((key)=>!process.env[key]))throw new Error('Missing required test environment variables');
if(!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'))throw new Error('Refusing to run outside Stripe test mode');

let departureId=process.argv[2]??null;
const apiBase=process.argv[3]??'https://api-test.japan-travel.info';
const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const authClient=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);

if(!departureId){
  const {data:sellable,error:sellableError}=await supabase.rpc('list_sellable_departures');
  if(sellableError)throw sellableError;
  const formal=(sellable??[]).find((row)=>Number(row.seat_price_jpy)>100);
  if(!formal)throw new Error('No formally priced sellable test departure is available');
  departureId=formal.id??formal.departure_id;
}
const {data:departure,error:departureError}=await supabase.from('departures').select('seat_price_jpy').eq('id',departureId).single();
if(departureError||!departure?.seat_price_jpy)throw departureError??new Error('Departure price is unavailable');
const expectedAmount=Number(departure.seat_price_jpy);

const {data:session,error:signInError}=await authClient.auth.signInWithPassword({email:process.env.JTW_OTHER_EMAIL,password:process.env.JTW_OTHER_PASSWORD});
if(signInError||!session.session?.access_token)throw signInError??new Error('Fictional test account did not return an access token');

const idempotencyKey=`stripe-test-card-${crypto.randomUUID()}`;
const checkout=await fetch(`${apiBase}/v1/checkout`,{method:'POST',headers:{authorization:`Bearer ${session.session.access_token}`,'content-type':'application/json',origin:'https://weekend.japan-travel.info'},body:JSON.stringify({departureId,seats:1,idempotencyKey,paymentMethod:'card'})});
const checkoutBody=await checkout.json();
if(!checkout.ok||checkoutBody.status!=='requires_payment_action'||!checkoutBody.clientSecret)throw new Error(`Checkout failed with ${checkout.status}: ${JSON.stringify(checkoutBody)}`);

const paymentIntentId=checkoutBody.clientSecret.split('_secret_')[0];
const confirmed=await stripe.paymentIntents.confirm(paymentIntentId,{payment_method:'pm_card_visa',return_url:'https://weekend.japan-travel.info/app/payment-result'});
if(confirmed.livemode||confirmed.amount!==expectedAmount||confirmed.currency!=='jpy'||confirmed.status!=='succeeded')throw new Error(`Unexpected Stripe test result: ${JSON.stringify({livemode:confirmed.livemode,amount:confirmed.amount,currency:confirmed.currency,status:confirmed.status})}`);

let order=null;
let hold=null;
let eventCount=0;
for(let attempt=0;attempt<20;attempt+=1){
  const [{data:orderData,error:orderError},{data:holdData,error:holdError},{count,error:eventError}]=await Promise.all([
    supabase.from('orders').select('id,status,amount,currency,payment_intent_id').eq('id',checkoutBody.orderId).single(),
    supabase.from('inventory_locks').select('id,status,seats').eq('id',checkoutBody.holdId).single(),
    supabase.from('payment_events').select('id',{count:'exact',head:true}).eq('order_id',checkoutBody.orderId).eq('status','succeeded')
  ]);
  if(orderError)throw orderError;if(holdError)throw holdError;if(eventError)throw eventError;
  order=orderData;hold=holdData;eventCount=count??0;
  if(order.status==='paid'&&hold.status==='committed'&&eventCount===1)break;
  await new Promise((resolve)=>setTimeout(resolve,1500));
}

if(order?.status!=='paid'||order.amount!==expectedAmount||order.currency!=='JPY'||order.payment_intent_id!==paymentIntentId||hold?.status!=='committed'||eventCount!==1)throw new Error(`Webhook settlement incomplete: ${JSON.stringify({orderStatus:order?.status,amount:order?.amount,holdStatus:hold?.status,eventCount})}`);

console.log(JSON.stringify({pass:true,mode:'stripe-test-card',livemode:false,amount:confirmed.amount,currency:confirmed.currency,paymentIntentStatus:confirmed.status,orderStatus:order.status,holdStatus:hold.status,eventRecorded:eventCount===1}));
