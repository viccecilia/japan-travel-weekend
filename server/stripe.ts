import Stripe from 'stripe';
import {createHash} from 'node:crypto';

export type StripeTestConfig={secretKey:string;webhookSecret:string};
export type PaymentEventStore={has(providerEventId:string):Promise<boolean>;apply(input:{providerEventId:string;orderId:string;status:'succeeded'|'failed'|'cancelled'|'refunded';createdAt:string;payloadDigest:string}):Promise<boolean>};
export class StripeTestAdapter{
  private readonly stripe:Stripe|null;
  constructor(private readonly config:StripeTestConfig){this.stripe=config.secretKey.startsWith('sk_test_')?new Stripe(config.secretKey):null}
  get available(){return this.stripe!==null&&this.config.webhookSecret.startsWith('whsec_')}
  async createPaymentIntent(input:{orderId:string;amount:number;idempotencyKey:string}){
    if(!this.stripe||input.amount<=0)return null;
    return this.stripe.paymentIntents.create({amount:input.amount,currency:'jpy',metadata:{order_id:input.orderId}},{idempotencyKey:input.idempotencyKey});
  }
  async handleWebhook(rawBody:Buffer,signature:string,store:PaymentEventStore){
    if(!this.available||!this.stripe)return {accepted:false,reason:'unavailable'} as const;
    let event:Stripe.Event;
    try{event=this.stripe.webhooks.constructEvent(rawBody,signature,this.config.webhookSecret)}catch{return {accepted:false,reason:'invalid-signature'} as const}
    if(await store.has(event.id))return {accepted:true,duplicate:true} as const;
    const object=event.data.object as Stripe.PaymentIntent|Stripe.Refund;
    const orderId='metadata' in object?object.metadata?.order_id:undefined;
    if(!orderId)return {accepted:false,reason:'missing-order'} as const;
    const status=mapStripeEvent(event.type);if(!status)return {accepted:true,ignored:true} as const;
    const applied=await store.apply({providerEventId:event.id,orderId,status,createdAt:new Date(event.created*1000).toISOString(),payloadDigest:createHash('sha256').update(rawBody).digest('hex')});
    return {accepted:applied,duplicate:false} as const;
  }
}
export function mapStripeEvent(type:string){if(type==='payment_intent.succeeded')return 'succeeded' as const;if(type==='payment_intent.payment_failed')return 'failed' as const;if(type==='payment_intent.canceled')return 'cancelled' as const;if(type==='charge.refunded')return 'refunded' as const;return null}
export function acceptPaymentTransition(current:{status:'created'|'processing'|'succeeded'|'failed'|'cancelled'|'refunded';eventCreatedAt:string}|null,next:{status:'succeeded'|'failed'|'cancelled'|'refunded';eventCreatedAt:string}){
  if(!current)return true;
  if(new Date(next.eventCreatedAt).getTime()<new Date(current.eventCreatedAt).getTime())return false;
  if(current.status==='refunded')return next.status==='refunded';
  if(current.status==='succeeded')return next.status==='succeeded'||next.status==='refunded';
  return true;
}
