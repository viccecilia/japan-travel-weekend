import type {AccessTokenVerifier} from './checkout.js';
import type {SupabaseClient} from '@supabase/supabase-js';

export type ResumeContext={orderId:string;amount:number;paymentIntentId:string|null};
export interface ResumeStore{
 context(accountId:string,orderId:string):Promise<ResumeContext|null>;
 record(accountId:string,context:ResumeContext,intentId:string):Promise<boolean>;
}
type Intent={id:string;amount:number;currency:string;status:string;livemode:boolean;client_secret:string|null;metadata:Record<string,string>};
export interface ResumeStripe{
 available:boolean;mode:'test'|'live';
 retrievePaymentIntent(id:string):Promise<Intent|null>;
 createPaymentIntent(input:{orderId:string;amount:number;idempotencyKey:string}):Promise<Intent|null>;
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
  if(!context||context.orderId!==orderId||!Number.isSafeInteger(context.amount)||context.amount<=0)return {status:409,body:{error:'order_not_resumable'}};
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
}
