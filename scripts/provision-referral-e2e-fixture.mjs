import {createClient} from '@supabase/supabase-js';
import Stripe from 'stripe';
import {randomUUID} from 'node:crypto';

const url=process.env.SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeKey=process.env.STRIPE_SECRET_KEY;
const password=process.env.JTW_TEST_ACCOUNT_PASSWORD;
const apiUrl=process.env.JTW_TEST_API_URL??'https://api-test.japan-travel.info';
if(!url||!serviceKey||!stripeKey?.startsWith('sk_test_')||!password)throw new Error('test environment is incomplete');
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

async function findUser(email){
 for(let page=1;page<=20;page++){const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});if(error)throw error;const found=data.users.find(item=>item.email===email);if(found)return found;if(data.users.length<100)break}
 return null;
}
async function ensureUser(email,displayName,metadata={}){
 const existing=await findUser(email);if(existing)return existing;
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:displayName,requested_account_type:'passenger',...metadata}});
 if(error)throw error;return data.user;
}
function must(result,label){if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data}

const inviter=await ensureUser('test1@daitora','测试游客A');
const inviterClient=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
must(await inviterClient.auth.signInWithPassword({email:'test1@daitora',password}),'sign in inviter');
const inviterSummary=must(await inviterClient.rpc('get_own_referral_summary'),'ensure inviter code');
const inviterCode=inviterSummary.code;
const invitee=await ensureUser('test2@daitora','测试游客B',{referral_code:inviterCode});
const existingRelation=must(await admin.from('referral_relationships').select('id').eq('invitee_account_id',invitee.id).maybeSingle(),'load relation');
if(!existingRelation)must(await admin.rpc('apply_referral_registration',{p_invitee:invitee.id,p_raw_code:inviterCode}),'apply referral');
const relation=must(await admin.from('referral_relationships').select('id,referral_code').eq('invitee_account_id',invitee.id).single(),'verify relation');
const coupons=must(await admin.from('discount_coupons').select('id,recipient_kind,status,available_at').eq('referral_relationship_id',relation.id).order('recipient_kind'),'verify coupons');
if(coupons.length!==2)throw new Error(`expected 2 coupons, found ${coupons.length}`);

const departures=must(await admin.from('departures').select('id,departs_at,ends_at,seat_price_jpy,status').eq('status','open').not('seat_price_jpy','is',null).gt('departs_at',new Date(Date.now()+48*3600_000).toISOString()).order('departs_at').limit(1),'load departure');
if(!departures.length)throw new Error('no future sellable test departure');
const authClient=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const session=must(await authClient.auth.signInWithPassword({email:'test2@daitora',password}),'sign in invitee').session;
if(!session)throw new Error('invitee session missing');
const key=`referral-e2e-${randomUUID()}`;
const response=await fetch(`${apiUrl}/v1/checkout`,{method:'POST',headers:{authorization:`Bearer ${session.access_token}`,'content-type':'application/json',origin:'https://weekend.japan-travel.info'},body:JSON.stringify({departureId:departures[0].id,seats:1,idempotencyKey:key,paymentMethod:'card'})});
const checkout=await response.json();if(!response.ok||!checkout.clientSecret)throw new Error(`checkout failed ${response.status}: ${JSON.stringify(checkout)}`);
const intentId=checkout.clientSecret.split('_secret_')[0];
const stripe=new Stripe(stripeKey);
const intent=await stripe.paymentIntents.confirm(intentId,{payment_method:'pm_card_visa',return_url:'https://weekend.japan-travel.info/app/payment-result'});
if(intent.status!=='succeeded')throw new Error(`payment not succeeded: ${intent.status}`);
let order=null;
for(let attempt=0;attempt<20;attempt++){
 const current=must(await admin.from('orders').select('id,status,amount,gross_amount,discount_amount,discount_coupon_id,departure_id').eq('id',checkout.orderId).single(),'poll order');
 order=current;if(['paid','confirmed'].includes(current.status))break;await new Promise(resolve=>setTimeout(resolve,1000));
}
if(!order||!['paid','confirmed'].includes(order.status))throw new Error(`webhook did not confirm order: ${order?.status}`);
const rewards=must(await admin.from('discount_coupons').select('id,recipient_kind,status,available_at,qualifying_order_id').eq('referral_relationship_id',relation.id).order('recipient_kind'),'load rewards');
console.log(JSON.stringify({inviter:{email:'test1@daitora',code:inviterCode},invitee:{email:'test2@daitora'},relationId:relation.id,couponCount:rewards.length,order,departure:departures[0],coupons:rewards,stripeMode:'test'},null,2));
