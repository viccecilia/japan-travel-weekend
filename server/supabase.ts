import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';

export type SupabaseServerConfig={url:string;serviceRoleKey:string};
export function createSupabaseServerClient(config:SupabaseServerConfig):SupabaseClient|null{
  if(!config.url.startsWith('https://')||!config.serviceRoleKey.trim())return null;
  return createClient(config.url,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
}

export type VerifiedSession={accountId:string;accessTokenHash:string};
export interface OrderInventoryGateway{reserve(session:VerifiedSession,input:{departureId:string;seats:number;idempotencyKey:string;expiresAt:string;draftId?:string}):Promise<{orderId:string;holdId:string}|null>;cancel(session:VerifiedSession,orderId:string):Promise<boolean>}
export class SupabaseOrderInventoryGateway implements OrderInventoryGateway{
  constructor(private readonly client:SupabaseClient|null){}
  async reserve(session:VerifiedSession,input:{departureId:string;seats:number;idempotencyKey:string;expiresAt:string;draftId?:string}){
    if(!this.client)return null;
    const {data,error}=input.draftId?await this.client.rpc('reserve_inventory_from_draft',{p_draft:input.draftId,p_account:session.accountId,p_departure:input.departureId,p_seats:input.seats,p_key:input.idempotencyKey,p_expires:input.expiresAt}):await this.client.rpc('reserve_inventory',{p_departure:input.departureId,p_account:session.accountId,p_seats:input.seats,p_key:input.idempotencyKey,p_expires:input.expiresAt});
    if(error||!data?.[0])return null;
    return {orderId:data[0].order_id as string,holdId:data[0].hold_id as string};
  }
  async cancel(session:VerifiedSession,orderId:string){if(!this.client)return false;const {data,error}=await this.client.rpc('cancel_pending_order',{p_order:orderId,p_account:session.accountId});return !error&&data===true}
}
export class SupabaseAccessTokenVerifier{
  constructor(private readonly client:SupabaseClient|null){}
  async verify(token:string):Promise<VerifiedSession|null>{if(!this.client||!token)return null;const {data,error}=await this.client.auth.getUser(token);if(error||!data.user)return null;return {accountId:data.user.id,accessTokenHash:createHash('sha256').update(token).digest('hex')}}
}
export class SupabaseManualPaymentGateway{
  constructor(private readonly client:SupabaseClient|null){}
  async markPending(orderId:string,amount:number){if(!this.client)return null;const {data,error}=await this.client.rpc('mark_bank_transfer_pending',{p_order:orderId,p_amount:amount});return !error&&typeof data==='string'?{dueAt:data}:null}
}

export class SupabaseCheckoutAttemptGateway{
  constructor(private readonly client:SupabaseClient|null){}
  async begin(accountId:string,input:{departureId:string;seats:number;idempotencyKey:string;paymentMethod:'card'|'bank_transfer';draftId?:string;quoteId?:string}){
    if(!this.client)return null;
    const {data,error}=await this.client.rpc('begin_checkout_attempt',{p_account:accountId,p_key:input.idempotencyKey,p_draft:input.draftId??null,p_departure:input.departureId,p_seats:input.seats,p_method:input.paymentMethod,p_quote:input.quoteId??null});
    const row=Array.isArray(data)?data[0]:data;
    return error||!row?null:{attemptId:String(row.attempt_id),status:String(row.attempt_status),orderId:row.attempt_order_id?String(row.attempt_order_id):null,response:row.response_payload&&typeof row.response_payload==='object'?row.response_payload as Record<string,unknown>:null};
  }
  async record(accountId:string,attemptId:string,orderId:string|null,status:string,response:Record<string,unknown>|null,errorCode?:string){
    if(!this.client)return false;
    const {data,error}=await this.client.rpc('record_checkout_attempt_result',{p_attempt:attemptId,p_account:accountId,p_order:orderId,p_status:status,p_response:response,p_error:errorCode??null});return !error&&data===true;
  }
}

export class SupabaseServerPricingGateway{
  constructor(private readonly client:SupabaseClient|null){}
  async quote(departureId:string,seats:number){
    if(!this.client||!Number.isInteger(seats)||seats<1)return null;
    const {data,error}=await this.client.from('departures').select('seat_price_jpy,status').eq('id',departureId).maybeSingle();
    const unit=Number(data?.seat_price_jpy);
    if(error||data?.status!=='open'||!Number.isSafeInteger(unit)||unit<1)return null;
    const amount=unit*seats;return Number.isSafeInteger(amount)?{amount,unitPrice:unit,currency:'JPY' as const}:null;
  }
  async applyCoupon(accountId:string,orderId:string,couponId:string,grossAmount:number){if(!this.client||!accountId||!orderId||!couponId||!Number.isSafeInteger(grossAmount)||grossAmount<1)return null;const {data,error}=await this.client.rpc('price_order_with_coupon',{p_account:accountId,p_order:orderId,p_coupon:couponId,p_expected_gross:grossAmount});const row=data?.[0];if(error||!row)return null;return {amount:Number(row.amount),grossAmount:Number(row.gross_amount),discountAmount:Number(row.discount_amount),discountPercent:Number(row.discount_percent),discountedSeats:Number(row.discounted_seats),discountedUnitPrice:Number(row.discounted_unit_price),sourceType:String(row.source_type)}}
  async createQuote(accountId:string,input:{departureId:string;seats:number;couponId?:string}){if(!this.client)return null;const {data,error}=await this.client.rpc('create_order_quote',{p_account:accountId,p_departure:input.departureId,p_seats:input.seats,p_coupon:input.couponId??null});return error||!data?null:data as Record<string,unknown>}
  async applyQuote(accountId:string,orderId:string,quoteId:string){if(!this.client)return null;const {data,error}=await this.client.rpc('apply_order_quote',{p_account:accountId,p_order:orderId,p_quote:quoteId});const row=data?.[0];if(error||!row)return null;return {amount:Number(row.amount),grossAmount:Number(row.gross_amount),discountAmount:Number(row.discount_amount),discountPercent:Number(row.discount_percent),discountedSeats:Number(row.discounted_seats),discountedUnitPrice:Number(row.discounted_unit_price),sourceType:String(row.source_type??'')}}
  async confirmFree(accountId:string,orderId:string){if(!this.client)return false;const {data,error}=await this.client.rpc('confirm_coupon_covered_order',{p_account:accountId,p_order:orderId});return !error&&data===true}
}

export class SupabasePaymentIntentRecorder{
  constructor(private readonly client:SupabaseClient|null){}
  async record(input:{orderId:string;paymentIntentId:string;amount:number}){if(!this.client)return false;const {data,error}=await this.client.rpc('record_stripe_payment_intent',{p_order:input.orderId,p_payment_intent:input.paymentIntentId,p_amount:input.amount});return !error&&data===true}
}

export class SupabasePaymentEventStore{
  constructor(private readonly client:SupabaseClient|null){}
  async has(providerEventId:string){if(!this.client)return false;const {count,error}=await this.client.from('payment_events').select('id',{count:'exact',head:true}).eq('provider_event_id',providerEventId);if(error)throw error;return (count??0)>0}
  async findOrderIdByPaymentIntent(paymentIntentId:string){if(!this.client)return null;const {data,error}=await this.client.from('orders').select('id').eq('payment_intent_id',paymentIntentId).maybeSingle();if(error)throw error;return data?.id??null}
  async apply(input:{providerEventId:string;orderId:string;status:'succeeded'|'failed'|'cancelled';createdAt:string;payloadDigest:string}){if(!this.client)return false;const {data,error}=await this.client.rpc('apply_payment_event',{p_event_id:input.providerEventId,p_order:input.orderId,p_status:input.status,p_created:input.createdAt,p_digest:input.payloadDigest});if(error)throw error;return data===true}
  async applyRefund(input:{providerEventId:string;orderId:string;providerRefundId:string|null;amountRefunded:number;chargeAmount:number;createdAt:string;payloadDigest:string}){if(!this.client)return false;const {data,error}=await this.client.rpc('apply_stripe_refund_event',{p_event_id:input.providerEventId,p_order:input.orderId,p_refund_id:input.providerRefundId,p_amount_refunded:input.amountRefunded,p_charge_amount:input.chargeAmount,p_created:input.createdAt,p_digest:input.payloadDigest});if(error)throw error;return data===true}
  async applyRefundStatus(input:{providerEventId:string;orderId:string;providerRefundId:string;status:'succeeded'|'failed'|'canceled'|'pending'|'requires_action';amount:number;createdAt:string;payloadDigest:string}){if(!this.client)return false;const {data,error}=await this.client.rpc('apply_stripe_refund_status_event',{p_event_id:input.providerEventId,p_order:input.orderId,p_refund_id:input.providerRefundId,p_status:input.status,p_amount:input.amount,p_created:input.createdAt,p_digest:input.payloadDigest});if(error)throw error;return data===true}
}
