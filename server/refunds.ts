import type {SupabaseClient} from '@supabase/supabase-js';
import type {StripeTestAdapter} from './stripe.js';
import type {VerifiedSession} from './supabase.js';

export class SupabaseRefundGateway{
  constructor(private readonly client:SupabaseClient|null){}
  async loadForOperations(accountId:string,requestId:string){
    if(!this.client)return null;
    const {data:profile}=await this.client.from('profiles').select('role').eq('id',accountId).maybeSingle();
    if(profile?.role!=='operations')return null;
    const {data,error}=await this.client.from('order_cancellation_requests').select('id,order_id,status,estimated_refund_amount,orders!inner(payment_intent_id,status)').eq('id',requestId).maybeSingle();
    if(error||!data)return null;
    const order=Array.isArray(data.orders)?data.orders[0]:data.orders;
    if(!order||!['paid','confirmed','payment_review'].includes(order.status)||!String(order.payment_intent_id??'').startsWith('pi_')||data.status!=='requested')return null;
    return {requestId:data.id as string,orderId:data.order_id as string,paymentIntentId:order.payment_intent_id as string,amount:Number(data.estimated_refund_amount)};
  }
  async markProcessing(input:{requestId:string;accountId:string;refundId:string;idempotencyKey:string}){if(!this.client)return false;const {data,error}=await this.client.rpc('operations_mark_refund_processing',{p_request:input.requestId,p_actor:input.accountId,p_refund_id:input.refundId,p_idempotency_key:input.idempotencyKey});return !error&&data===true}
}

export class RefundEndpoint{
  constructor(private readonly gateway:SupabaseRefundGateway,private readonly stripe:Pick<StripeTestAdapter,'available'|'createRefund'>){}
  async post(session:VerifiedSession,input:{requestId?:string;idempotencyKey?:string}){
    if(!input.requestId||!input.idempotencyKey||input.idempotencyKey.length>100)return {status:400,body:{error:'invalid_request'}};
    if(!this.stripe.available)return {status:503,body:{error:'refund_provider_unavailable'}};
    const request=await this.gateway.loadForOperations(session.accountId,input.requestId);if(!request)return {status:403,body:{error:'refund_not_allowed'}};
    if(!Number.isSafeInteger(request.amount)||request.amount<1)return {status:409,body:{error:'refund_amount_invalid'}};
    const refund=await this.stripe.createRefund({paymentIntentId:request.paymentIntentId,amount:request.amount,idempotencyKey:input.idempotencyKey});if(!refund)return {status:502,body:{error:'refund_creation_failed'}};
    const stored=await this.gateway.markProcessing({requestId:request.requestId,accountId:session.accountId,refundId:refund.id,idempotencyKey:input.idempotencyKey});
    return stored?{status:202,body:{accepted:true,requestId:request.requestId,status:'refund_processing'}}:{status:500,body:{error:'refund_audit_store_failed'}};
  }
}
