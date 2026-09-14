import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import Stripe from 'stripe';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','DRIVER_EMAIL','DRIVER_PASSWORD'];
for(const key of required)if(!process.env[key])throw new Error(`missing ${key}`);
if(!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'))throw new Error('Stripe test key required');
const apiBase=process.env.JTW_TEST_API_BASE??'https://weekend.japan-travel.info/api';
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const publicKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(!publicKey)throw new Error('missing VITE_SUPABASE_PUBLISHABLE_KEY');
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
const batchId=`v12-referral-${Date.now()}-${randomUUID().slice(0,8)}`;
const inviteeEmail=`${batchId}@example.invalid`;
const password=`V12!${randomUUID()}aA9`;
let userId=null,orderId=null,relationId=null;
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};
const waitFor=async(label,probe)=>{for(let i=0;i<30;i+=1){const result=await probe();if(result)return result;await new Promise(resolve=>setTimeout(resolve,1000))}throw new Error(`${label} timed out`)};

try{
  const users=must(await admin.auth.admin.listUsers({page:1,perPage:1000}),'list identities').users;
  const driver=users.find(item=>item.email?.toLowerCase()===process.env.DRIVER_EMAIL.toLowerCase());
  if(!driver)throw new Error('configured driver identity not found');
  const qualification=must(await admin.from('ambassador_qualifications').select('status,source').eq('account_id',driver.id).maybeSingle(),'load ambassador qualification');
  if(qualification?.status!=='approved'||qualification.source!=='staff_approval')throw new Error('configured driver is not an approved staff ambassador');
  const driverClient=createClient(process.env.SUPABASE_URL,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  must(await driverClient.auth.signInWithPassword({email:process.env.DRIVER_EMAIL,password:process.env.DRIVER_PASSWORD}),'driver sign-in');
  const referralSummary=must(await driverClient.rpc('get_own_referral_summary'),'load fixed referral link');
  if(!referralSummary?.code)throw new Error('approved driver has no referral code');

  const created=must(await admin.auth.admin.createUser({email:inviteeEmail,password,email_confirm:true,user_metadata:{display_name:'V12 推荐付款隔离游客',referral_code:referralSummary.code}}),'create invitee');
  userId=created.user.id;
  must(await admin.from('profiles').upsert({id:userId,role:'passenger',display_name:'V12 推荐付款隔离游客'},{onConflict:'id'}),'create profile');
  const passenger=createClient(process.env.SUPABASE_URL,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const session=must(await passenger.auth.signInWithPassword({email:inviteeEmail,password}),'invitee sign-in').session;
  const relation=must(await admin.from('referral_relationships').select('id,inviter_account_id,invitee_account_id').eq('invitee_account_id',userId).single(),'load referral relation');
  relationId=relation.id;
  if(relation.inviter_account_id!==driver.id)throw new Error('referral relation points to the wrong ambassador');
  const coupons=must(await admin.from('discount_coupons').select('recipient_kind,rules_version').eq('referral_relationship_id',relationId),'load referral coupons');
  if(coupons.length!==1||coupons[0].recipient_kind!=='invitee'||coupons[0].rules_version!=='cash-referral-v2')throw new Error(`new cash referral unexpectedly created legacy inviter coupons: ${JSON.stringify(coupons)}`);

  const departures=must(await admin.rpc('list_sellable_departures'),'list sellable departures');
  const selected=departures.find(item=>Number(item.available_seats)>=1&&Number(item.seat_price_jpy)>100);
  if(!selected)throw new Error('no sellable departure for referral payment verification');
  const checkoutResponse=await fetch(`${apiBase}/v1/checkout`,{method:'POST',headers:{authorization:`Bearer ${session.access_token}`,'content-type':'application/json',origin:'https://weekend.japan-travel.info'},body:JSON.stringify({departureId:selected.id,seats:1,idempotencyKey:`${batchId}-checkout`,paymentMethod:'card'})});
  const checkout=await checkoutResponse.json();
  if(!checkoutResponse.ok||!checkout.clientSecret)throw new Error(`checkout failed ${checkoutResponse.status}: ${JSON.stringify(checkout)}`);
  orderId=checkout.orderId;
  const intentId=checkout.clientSecret.split('_secret_')[0];
  const intent=await stripe.paymentIntents.confirm(intentId,{payment_method:'pm_card_visa',return_url:'https://weekend.japan-travel.info/app/payment-result'});
  if(intent.livemode||intent.status!=='succeeded')throw new Error(`unexpected Stripe result: ${intent.status}`);
  const settled=await waitFor('paid referral commission',async()=>{
    const [order,entries,event]=await Promise.all([
      admin.from('orders').select('status,amount').eq('id',orderId).single(),
      admin.from('cash_commission_entries').select('id,status,basis_amount_jpy,commission_percent,amount_jpy,beneficiary_account_id,source_order_id').eq('source_order_id',orderId),
      admin.from('payment_events').select('provider_event_id').eq('order_id',orderId).eq('status','succeeded').maybeSingle(),
    ]);
    if(order.error||entries.error||event.error)throw order.error??entries.error??event.error;
    return order.data.status==='paid'&&entries.data.length===1&&entries.data[0].status==='pending'&&event.data?{order:order.data,entry:entries.data[0],providerEventId:event.data.provider_event_id}:null;
  });
  const basis=must(await admin.rpc('commission_basis_for_order',{p_order:orderId}),'commission basis');
  if(settled.entry.beneficiary_account_id!==driver.id||settled.entry.basis_amount_jpy!==basis||settled.entry.commission_percent!==10||settled.entry.amount_jpy!==Math.floor(basis*0.1))throw new Error(`pending commission mismatch: ${JSON.stringify({basis,entry:settled.entry})}`);
  const providerEvent=await stripe.events.retrieve(settled.providerEventId);
  const payload=JSON.stringify(providerEvent);
  const signature=Stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
  const replayResponse=await fetch(`${apiBase}/v1/webhooks/stripe`,{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:payload});
  const replay=await replayResponse.json();
  if(!replayResponse.ok||replay.duplicate!==true)throw new Error(`duplicate webhook was not recognized: ${JSON.stringify(replay)}`);
  const count=await admin.from('cash_commission_entries').select('id',{count:'exact',head:true}).eq('source_order_id',orderId);
  if(count.error||count.count!==1)throw new Error(`duplicate commission count: ${count.count}`);
  console.log(JSON.stringify({ok:true,batchId,ambassador:{status:qualification.status,source:qualification.source,fixedReferralCode:true},relationship:{correctInviter:true,legacyInviterCouponCreated:false},payment:{livemode:false,orderId,status:settled.order.status,amountJpy:settled.order.amount},commission:{status:settled.entry.status,basisAmountJpy:basis,percent:10,amountJpy:settled.entry.amount_jpy},duplicateWebhook:{duplicate:true,commissionEntries:count.count},cleanup:'completed'},null,2));
}finally{
  if(orderId){
    await admin.from('cash_commission_entries').delete().eq('source_order_id',orderId);
    await admin.from('notification_outbox').delete().eq('order_id',orderId);
    await admin.from('fulfilment_work_items').delete().eq('order_id',orderId);
    await admin.from('payment_events').delete().eq('order_id',orderId);
    await admin.from('order_snapshots').delete().eq('order_id',orderId);
    await admin.from('inventory_locks').delete().eq('order_id',orderId);
    await admin.from('orders').delete().eq('id',orderId);
  }
  if(relationId)await admin.from('discount_coupons').delete().eq('referral_relationship_id',relationId);
  if(relationId)await admin.from('referral_relationships').delete().eq('id',relationId);
  if(userId)await admin.auth.admin.deleteUser(userId);
}
