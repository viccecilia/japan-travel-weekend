import type {AccessTokenVerifier} from './checkout.js';
import type {SupabaseClient} from '@supabase/supabase-js';

export type ResumeContext={orderId:string;amount:number;paymentIntentId:string|null};
export type ExpiredCheckoutContext=ResumeContext&{draftId:string};
export interface ResumeStore{
 context(accountId:string,orderId:string):Promise<ResumeContext|null>;
 record(accountId:string,context:ResumeContext,intentId:string):Promise<boolean>;
 expiredContext(accountId:string,orderId:string):Promise<ExpiredCheckoutContext|null>;
 resetExpired(accountId:string,context:ExpiredCheckoutContext):Promise<boolean>;
}
type Intent={id:string;amount:number;currency:string;status:string;livemode:boolean;client_secret:string|null;metadata:Record<string,string>};
export interface ResumeStripe{
 available:boolean;mode:'test'|'live';
 retrievePaymentIntent(id:string):Promise<Intent|null>;
 createPaymentIntent(input:{orderId:string;amount:number;idempotencyKey:string}):Promise<Intent|null>;
 cancelPaymentIntent(id:string):Promise<boolean>;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class ResumePaymentEndpoint{
 constructor(private auth:AccessTokenVerifier,private store:ResumeStore,private stripe:ResumeStripe){}
 async post(authorization:string|undefined,input:unknown){
  const token=authorization?.match(/^Bearer (.+)$/)?.[1];
  const session=token?await this.auth.verify(token):null;
  if(!session)return {status:401,body:{error:'unauthorized'}};
  // This new flow is intentionally test-only. Existing live gates are untouched.
  if(!this.stripe.available||this.stripe.mode!=='test')return {status:503,body:{error:'test_payment_unavailable'}};
  if(!input||typeof input!=='object')return {status:400,body:{error:'invalid_request'}};
  const {orderId,idempotencyKey}=input as Record<string,unknown>;
  if(typeof orderId!=='string'||!uuid.test(orderId)||typeof idempotencyKey!=='string'||!idempotencyKey.trim()||idempotencyKey.length>128)
   return {status:400,body:{error:'invalid_request'}};
  const context=await this.store.context(session.accountId,orderId);
  if(!context){
   const expired=await this.store.expiredContext(session.accountId,orderId);
   if(!expired||expired.orderId!==orderId||!Number.isSafeInteger(expired.amount)||expired.amount<=0)return {status:409,body:{error:'order_not_resumable'}};
   const previous=expired.paymentIntentId?await this.stripe.retrievePaymentIntent(expired.paymentIntentId):null;
   if(expired.paymentIntentId&&!previous)return {status:503,body:{error:'payment_status_unavailable'}};
   if(previous&&(previous.livemode||previous.metadata.order_id!==orderId||previous.currency!=='jpy'||previous.amount!==expired.amount))return {status:409,body:{error:'payment_snapshot_mismatch'}};
   if(previous&&previous.status!=='canceled'){
    if(!['requires_payment_method','requires_confirmation','requires_action'].includes(previous.status))return {status:409,body:{error:'payment_not_actionable'}};
    try{if(!await this.stripe.cancelPaymentIntent(previous.id))return {status:503,body:{error:'payment_cancel_unavailable'}}}catch{return {status:503,body:{error:'payment_cancel_unavailable'}}}
   }
   if(!await this.store.resetExpired(session.accountId,expired))return {status:409,body:{error:'order_changed'}};
   return {status:200,body:{orderId,status:'restart_checkout' as const,draftId:expired.draftId}};
  }
  if(context.orderId!==orderId||!Number.isSafeInteger(context.amount)||context.amount<=0)return {status:409,body:{error:'order_not_resumable'}};
  let intent=context.paymentIntentId?await this.stripe.retrievePaymentIntent(context.paymentIntentId):null;
  // A failed retrieval is unknown, not permission to create a replacement.
  if(context.paymentIntentId&&!intent)return {status:503,body:{error:'payment_status_unavailable'}};
  if(intent&&(intent.livemode||intent.metadata.order_id!==orderId||intent.currency!=='jpy'||intent.amount!==context.amount))
   return {status:409,body:{error:'payment_snapshot_mismatch'}};
  if(!intent||intent.status==='canceled'){
   // Order + prior PI is the generation key: different browser keys still converge.
   intent=await this.stripe.createPaymentIntent({orderId,amount:context.amount,idempotencyKey:'resume:'+orderId+':'+(context.paymentIntentId??'initial')});
  }
  if(!intent)return {status:503,body:{error:'payment_unavailable'}};
  if(intent.livemode||intent.metadata.order_id!==orderId||intent.currency!=='jpy'||intent.amount!==context.amount)
   return {status:409,body:{error:'payment_snapshot_mismatch'}};
  if(!['requires_payment_method','requires_confirmation','requires_action'].includes(intent.status)||!intent.client_secret)
   return {status:409,body:{error:'payment_not_actionable'}};
  if(!await this.store.record(session.accountId,context,intent.id))
   return {status:409,body:{error:'order_changed'}};
  return {status:200,body:{orderId,amount:context.amount,clientSecret:intent.client_secret,status:'requires_payment_action'}};
 }
}
export class SupabaseResumeStore implements ResumeStore{
 constructor(private client:SupabaseClient|null){}
 async context(accountId:string,orderId:string){
  if(!this.client)return null;
  const {data,error}=await this.client.rpc('get_payment_resume_context',{p_account:accountId,p_order:orderId}).maybeSingle<{order_id:string;amount:number;payment_intent_id:string|null}>();
  return error||!data?null:{orderId:data.order_id as string,amount:Number(data.amount),paymentIntentId:data.payment_intent_id as string|null};
 }
 async record(accountId:string,context:ResumeContext,intentId:string){
  if(!this.client)return false;
  const {data,error}=await this.client.rpc('record_resumed_payment_intent',{p_account:accountId,p_order:context.orderId,p_expected_intent:context.paymentIntentId,p_intent:intentId,p_amount:context.amount});
  return !error&&data===true;
 }
 async expiredContext(accountId:string,orderId:string){
  if(!this.client)return null;
  const {data,error}=await this.client.rpc('get_expired_payment_recovery_context',{p_account:accountId,p_order:orderId}).maybeSingle<{order_id:string;amount:number;payment_intent_id:string|null;draft_id:string}>();
  return error||!data?null:{orderId:data.order_id as string,amount:Number(data.amount),paymentIntentId:data.payment_intent_id as string|null,draftId:data.draft_id as string};
 }
 async resetExpired(accountId:string,context:ExpiredCheckoutContext){
  if(!this.client)return false;
  const {data,error}=await this.client.rpc('reset_expired_payment_checkout',{p_account:accountId,p_order:context.orderId,p_intent:context.paymentIntentId,p_draft:context.draftId});
  return !error&&data===true;
 }
}
