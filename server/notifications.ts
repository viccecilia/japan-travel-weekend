import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';import type {SupabaseClient} from '@supabase/supabase-js';
export type OutboxNotification={id:string;event_id:string;event_type:string;recipient_id:string;order_id:string|null;necessary:boolean;payload:Record<string,unknown>;attempts:number};
export interface NotificationDeliveryAdapter{available:boolean;provider:string;deliver(item:OutboxNotification):Promise<{externalId:string}>}
export class SupabaseNotificationOutbox{
  constructor(private readonly client:SupabaseClient|null){}
  async claim(limit=20){if(!this.client)return null;const lockToken=randomUUID();const {data,error}=await this.client.rpc('claim_notification_outbox',{p_limit:limit,p_lock_token:lockToken,p_now:new Date().toISOString()});return error?null:{lockToken,items:(data??[]) as OutboxNotification[]}}
  async complete(id:string,lockToken:string,input:{outcome:'submitted'|'retry'|'suppressed'|'failed';provider?:string;externalId?:string;errorCode?:string}){if(!this.client)return false;const {data,error}=await this.client.rpc('complete_notification_delivery',{p_id:id,p_lock_token:lockToken,p_outcome:input.outcome,p_provider:input.provider??null,p_external_id:input.externalId??null,p_error_code:input.errorCode??null,p_now:new Date().toISOString()});return !error&&data===true}
}
export class NotificationOutboxWorker{
  constructor(private readonly outbox:SupabaseNotificationOutbox,private readonly adapter:NotificationDeliveryAdapter|null){}
  async runOnce(){if(!this.adapter?.available)return {claimed:0,submitted:0,retried:0,reason:'provider-unavailable' as const};const batch=await this.outbox.claim();if(!batch)return {claimed:0,submitted:0,retried:0,reason:'outbox-unavailable' as const};let submitted=0;let retried=0;for(const item of batch.items){try{const result=await this.adapter.deliver(item);if(await this.outbox.complete(item.id,batch.lockToken,{outcome:'submitted',provider:this.adapter.provider,externalId:result.externalId}))submitted++}catch{if(await this.outbox.complete(item.id,batch.lockToken,{outcome:'retry',errorCode:'provider-error'}))retried++}}return {claimed:batch.items.length,submitted,retried,reason:'processed' as const}}
}

export type NotificationReceipt={eventId:string;outboxId:string;status:'delivered'|'failed';externalId:string;occurredAt:string};
export interface NotificationReceiptStore{apply(input:NotificationReceipt&{payloadDigest:string}):Promise<boolean>}
export class SupabaseNotificationReceiptStore implements NotificationReceiptStore{
  constructor(private readonly client:SupabaseClient|null){}
  async apply(input:NotificationReceipt&{payloadDigest:string}){if(!this.client)return false;const {data,error}=await this.client.rpc('apply_notification_delivery_receipt',{p_provider_event_id:input.eventId,p_outbox_id:input.outboxId,p_status:input.status,p_external_id:input.externalId,p_occurred_at:input.occurredAt,p_payload_digest:input.payloadDigest});return !error&&data===true}
}
const receiptKeys=['eventId','outboxId','status','externalId','occurredAt'] as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class SignedNotificationReceiptHandler{
  constructor(private readonly secret:string,private readonly store:NotificationReceiptStore){}
  async handle(rawBody:Buffer,signature:string){
    if(this.secret.length<32)return {accepted:false,reason:'receipt-webhook-unavailable' as const};
    const expected=createHmac('sha256',this.secret).update(rawBody).digest();const supplied=Buffer.from(signature.replace(/^sha256=/i,''),'hex');
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return {accepted:false,reason:'invalid-signature' as const};
    let value:unknown;try{value=JSON.parse(rawBody.toString('utf8'))}catch{return {accepted:false,reason:'invalid-payload' as const}}
    if(!value||typeof value!=='object'||Array.isArray(value))return {accepted:false,reason:'invalid-payload' as const};
    const body=value as Record<string,unknown>;if(Object.keys(body).some(key=>!receiptKeys.includes(key as typeof receiptKeys[number]))||typeof body.eventId!=='string'||!uuid.test(String(body.outboxId))||(body.status!=='delivered'&&body.status!=='failed')||typeof body.externalId!=='string'||body.externalId.length<1||body.externalId.length>200||typeof body.occurredAt!=='string'||!Number.isFinite(Date.parse(body.occurredAt)))return {accepted:false,reason:'invalid-payload' as const};
    const receipt={eventId:body.eventId.slice(0,200),outboxId:String(body.outboxId),status:body.status,externalId:body.externalId,occurredAt:new Date(body.occurredAt).toISOString()} as NotificationReceipt;
    const applied=await this.store.apply({...receipt,payloadDigest:createHash('sha256').update(rawBody).digest('hex')});return applied?{accepted:true,reason:'applied' as const}:{accepted:false,reason:'store-unavailable' as const};
  }
}
