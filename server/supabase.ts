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
  async markPending(orderId:string){if(!this.client)return false;const {data,error}=await this.client.rpc('mark_bank_transfer_pending',{p_order:orderId});return !error&&data===true}
}

export class SupabaseServerPricingGateway{
  constructor(private readonly client:SupabaseClient|null){}
  async quote(departureId:string,seats:number){
    if(!this.client||!Number.isInteger(seats)||seats<1)return null;
    const {data,error}=await this.client.from('departures').select('seat_price_jpy,status').eq('id',departureId).maybeSingle();
    const unit=Number(data?.seat_price_jpy);
    if(error||data?.status!=='open'||!Number.isSafeInteger(unit)||unit<1)return null;
    const amount=unit*seats;return Number.isSafeInteger(amount)?{amount,currency:'JPY' as const}:null;
  }
}

export class SupabasePaymentIntentRecorder{
  constructor(private readonly client:SupabaseClient|null){}
  async record(input:{orderId:string;paymentIntentId:string;amount:number}){if(!this.client)return false;const {data,error}=await this.client.rpc('record_stripe_payment_intent',{p_order:input.orderId,p_payment_intent:input.paymentIntentId,p_amount:input.amount});return !error&&data===true}
}

export class SupabasePaymentEventStore{
  constructor(private readonly client:SupabaseClient|null){}
  async has(providerEventId:string){if(!this.client)return false;const {count,error}=await this.client.from('payment_events').select('id',{count:'exact',head:true}).eq('provider_event_id',providerEventId);if(error)throw error;return (count??0)>0}
  async findOrderIdByPaymentIntent(paymentIntentId:string){if(!this.client)return null;const {data,error}=await this.client.from('orders').select('id').eq('payment_intent_id',paymentIntentId).maybeSingle();if(error)throw error;return data?.id??null}
  async apply(input:{providerEventId:string;orderId:string;status:'succeeded'|'failed'|'cancelled'|'refunded';createdAt:string;payloadDigest:string}){if(!this.client)return false;const {data,error}=await this.client.rpc('apply_payment_event',{p_event_id:input.providerEventId,p_order:input.orderId,p_status:input.status,p_created:input.createdAt,p_digest:input.payloadDigest});if(error)throw error;return data===true}
}
