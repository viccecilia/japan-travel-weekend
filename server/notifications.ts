import {randomUUID} from 'node:crypto';import type {SupabaseClient} from '@supabase/supabase-js';
export type OutboxNotification={id:string;event_id:string;event_type:string;recipient_id:string;order_id:string|null;necessary:boolean;payload:Record<string,unknown>;attempts:number};
export interface NotificationDeliveryAdapter{available:boolean;provider:string;deliver(item:OutboxNotification):Promise<{externalId:string}>}
export class SupabaseNotificationOutbox{
  constructor(private readonly client:SupabaseClient|null){}
  async claim(limit=20){if(!this.client)return null;const lockToken=randomUUID();const {data,error}=await this.client.rpc('claim_notification_outbox',{p_limit:limit,p_lock_token:lockToken,p_now:new Date().toISOString()});return error?null:{lockToken,items:(data??[]) as OutboxNotification[]}}
  async complete(id:string,lockToken:string,input:{outcome:'delivered'|'retry'|'suppressed'|'failed';provider?:string;externalId?:string;errorCode?:string}){if(!this.client)return false;const {data,error}=await this.client.rpc('complete_notification_delivery',{p_id:id,p_lock_token:lockToken,p_outcome:input.outcome,p_provider:input.provider??null,p_external_id:input.externalId??null,p_error_code:input.errorCode??null,p_now:new Date().toISOString()});return !error&&data===true}
}
export class NotificationOutboxWorker{
  constructor(private readonly outbox:SupabaseNotificationOutbox,private readonly adapter:NotificationDeliveryAdapter|null){}
  async runOnce(){if(!this.adapter?.available)return {claimed:0,delivered:0,retried:0,reason:'provider-unavailable' as const};const batch=await this.outbox.claim();if(!batch)return {claimed:0,delivered:0,retried:0,reason:'outbox-unavailable' as const};let delivered=0;let retried=0;for(const item of batch.items){try{const result=await this.adapter.deliver(item);if(await this.outbox.complete(item.id,batch.lockToken,{outcome:'delivered',provider:this.adapter.provider,externalId:result.externalId}))delivered++}catch{if(await this.outbox.complete(item.id,batch.lockToken,{outcome:'retry',errorCode:'provider-error'}))retried++}}return {claimed:batch.items.length,delivered,retried,reason:'processed' as const}}
}
