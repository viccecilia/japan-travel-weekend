import type {SupabaseClient} from '@supabase/supabase-js';
import type {StripeTestAdapter} from './stripe.js';
import type {VerifiedSession} from './supabase.js';

export type RefundRequest={requestId:string;orderId:string;paymentIntentId:string|null;amount:number};
export type PreparedRefund={operationId:string;providerIdempotencyKey:string;status:string};
export interface RefundGateway{
  loadForOperations(accountId:string,requestId:string):Promise<RefundRequest|null>;
  prepare(input:{requestId:string;accountId:string;clientRequestKey:string;channel:'stripe'|'manual'|'none'}):Promise<PreparedRefund|null>;
  completeWithoutRefund(input:{operationId:string;accountId:string}):Promise<boolean>;
  markProviderResult(input:{operationId:string;accountId:string;status:'submitted'|'failed';refundId?:string;errorCode?:string}):Promise<boolean>;
}

export class SupabaseRefundGateway implements RefundGateway{
  constructor(private readonly client:SupabaseClient|null){}
  async loadForOperations(accountId:string,requestId:string){
    if(!this.client)return null;
    const {data:profile}=await this.client.from('profiles').select('role').eq('id',accountId).maybeSingle();
    if(profile?.role!=='operations')return null;
    const {data,error}=await this.client.from('order_cancellation_requests').select('id,order_id,status,estimated_refund_amount,orders!inner(payment_intent_id,status)').eq('id',requestId).maybeSingle();
    if(error||!data)return null;
    const order=Array.isArray(data.orders)?data.orders[0]:data.orders;
    if(!order||!['paid','confirmed','payment_review'].includes(order.status)||!['requested','reviewing','refund_prepared','refund_processing','provider_result_unknown'].includes(data.status))return null;
    return {requestId:data.id as string,orderId:data.order_id as string,paymentIntentId:String(order.payment_intent_id??'')||null,amount:Number(data.estimated_refund_amount)};
  }
  async prepare(input:{requestId:string;accountId:string;clientRequestKey:string;channel:'stripe'|'manual'|'none'}){if(!this.client)return null;const {data,error}=await this.client.rpc('operations_prepare_refund',{p_request:input.requestId,p_actor:input.accountId,p_client_request_key:input.clientRequestKey,p_channel:input.channel});const row=Array.isArray(data)?data[0]:data;return error||!row?null:{operationId:String(row.operation_id),providerIdempotencyKey:String(row.provider_idempotency_key),status:String(row.operation_status)}}
  async completeWithoutRefund(input:{operationId:string;accountId:string}){if(!this.client)return false;const {data,error}=await this.client.rpc('operations_complete_cancellation_without_refund',{p_operation:input.operationId,p_actor:input.accountId});return !error&&data===true}
  async markProviderResult(input:{operationId:string;accountId:string;status:'submitted'|'failed';refundId?:string;errorCode?:string}){if(!this.client)return false;const {data,error}=await this.client.rpc('operations_record_refund_provider_result',{p_operation:input.operationId,p_actor:input.accountId,p_status:input.status,p_refund_id:input.refundId??null,p_error_code:input.errorCode??null});return !error&&data===true}
}

export class RefundEndpoint{
  constructor(private readonly gateway:RefundGateway,private readonly stripe:Pick<StripeTestAdapter,'available'|'createRefund'>){}
  async post(session:VerifiedSession,input:{requestId?:string;idempotencyKey?:string}){
    if(!input.requestId||!input.idempotencyKey||input.idempotencyKey.length<8||input.idempotencyKey.length>100)return {status:400,body:{error:'invalid_request'}};
    const request=await this.gateway.loadForOperations(session.accountId,input.requestId);if(!request)return {status:403,body:{error:'refund_not_allowed'}};
    if(!Number.isSafeInteger(request.amount)||request.amount<0)return {status:409,body:{error:'refund_amount_invalid'}};
    const channel=request.amount===0?'none':request.paymentIntentId?.startsWith('pi_')?'stripe':'manual';
    const operation=await this.gateway.prepare({requestId:request.requestId,accountId:session.accountId,clientRequestKey:input.idempotencyKey,channel});
    if(!operation)return {status:409,body:{error:'refund_operation_conflict'}};
    if(operation.status==='submitted'||operation.status==='completed')return {status:202,body:{accepted:true,requestId:request.requestId,status:'refund_processing',operationId:operation.operationId,replayed:true}};
    if(operation.status==='awaiting_manual_refund')return {status:202,body:{accepted:true,requestId:request.requestId,status:'manual_refund_required',operationId:operation.operationId,replayed:true}};
    if(operation.status==='completed_without_refund')return {status:200,body:{accepted:true,requestId:request.requestId,status:'cancelled_without_refund',operationId:operation.operationId,replayed:true}};
    if(channel==='none'){
      const completed=await this.gateway.completeWithoutRefund({operationId:operation.operationId,accountId:session.accountId});
      return completed?{status:200,body:{accepted:true,requestId:request.requestId,status:'cancelled_without_refund'}}:{status:500,body:{error:'cancellation_store_failed'}};
    }
    if(channel==='manual')return {status:202,body:{accepted:true,requestId:request.requestId,status:'manual_refund_required',operationId:operation.operationId}};
    if(!this.stripe.available)return {status:503,body:{error:'refund_provider_unavailable',operationId:operation.operationId}};
    const refund=await this.stripe.createRefund({paymentIntentId:request.paymentIntentId!,amount:request.amount,idempotencyKey:operation.providerIdempotencyKey});
    if(!refund){await this.gateway.markProviderResult({operationId:operation.operationId,accountId:session.accountId,status:'failed',errorCode:'provider_creation_failed'});return {status:502,body:{error:'refund_creation_failed',operationId:operation.operationId}}}
    const stored=await this.gateway.markProviderResult({operationId:operation.operationId,accountId:session.accountId,status:'submitted',refundId:refund.id});
    return stored?{status:202,body:{accepted:true,requestId:request.requestId,status:'refund_processing',operationId:operation.operationId}}:{status:202,body:{accepted:true,requestId:request.requestId,status:'refund_result_pending_reconciliation',operationId:operation.operationId}};
  }
}
