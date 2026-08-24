import Stripe from 'stripe';
import {createHash} from 'node:crypto';

export type StripeTestConfig={secretKey:string;webhookSecret:string};
export type PaymentEventStore={has(providerEventId:string):Promise<boolean>;findOrderIdByPaymentIntent(paymentIntentId:string):Promise<string|null>;apply(input:{providerEventId:string;orderId:string;status:'succeeded'|'failed'|'cancelled'|'refunded';createdAt:string;payloadDigest:string}):Promise<boolean>};
export class StripeTestAdapter{
  private readonly stripe:Stripe|null;
  constructor(private readonly config:StripeTestConfig){this.stripe=config.secretKey.startsWith('sk_test_')?new Stripe(config.secretKey):null}
  get available(){return this.stripe!==null&&this.config.webhookSecret.startsWith('whsec_')}
  async createPaymentIntent(input:{orderId:string;amount:number;idempotencyKey:string}){
    if(!this.stripe||input.amount<=0)return null;
    return this.stripe.paymentIntents.create({amount:input.amount,currency:'jpy',metadata:{order_id:input.orderId}},{idempotencyKey:input.idempotencyKey});
  }
  async cancelPaymentIntent(id:string){if(!this.stripe)return false;await this.stripe.paymentIntents.cancel(id);return true}
  async handleWebhook(rawBody:Buffer,signature:string,store:PaymentEventStore){
    if(!this.available||!this.stripe)return {accepted:false,reason:'unavailable'} as const;
    let event:Stripe.Event;
    try{event=this.stripe.webhooks.constructEvent(rawBody,signature,this.config.webhookSecret)}catch{return {accepted:false,reason:'invalid-signature'} as const}
    if(await store.has(event.id))return {accepted:true,duplicate:true} as const;
    const orderId=await extractOrderId(event,store);
    if(!orderId)return {accepted:false,reason:'missing-order'} as const;
    const status=mapStripeEvent(event.type);if(!status)return {accepted:true,ignored:true} as const;
    const applied=await store.apply({providerEventId:event.id,orderId,status,createdAt:new Date(event.created*1000).toISOString(),payloadDigest:createHash('sha256').update(rawBody).digest('hex')});
    return {accepted:applied,duplicate:false} as const;
  }
}
export class StripeCardPaymentSessionGateway{
  constructor(private readonly adapter:StripeTestAdapter,private readonly recorder?:{record(input:{orderId:string;paymentIntentId:string;amount:number}):Promise<boolean>}){}
  get available(){return this.adapter.available}
  async create(input:{orderId:string;amount:number;idempotencyKey:string}){const intent=await this.adapter.createPaymentIntent(input);if(!intent?.client_secret)return null;if(this.recorder&&!await this.recorder.record({orderId:input.orderId,paymentIntentId:intent.id,amount:input.amount})){await this.adapter.cancelPaymentIntent(intent.id);return null}return {clientSecret:intent.client_secret}}
}
export async function extractOrderId(event:Stripe.Event,store:Pick<PaymentEventStore,'findOrderIdByPaymentIntent'>){
  if(event.type.startsWith('payment_intent.'))return (event.data.object as Stripe.PaymentIntent).metadata?.order_id||null;
  if(event.type==='charge.refunded'){const charge=event.data.object as Stripe.Charge;const paymentIntentId=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;if(!paymentIntentId)return null;return store.findOrderIdByPaymentIntent(paymentIntentId)}
  return null;
}
export function mapStripeEvent(type:string){if(type==='payment_intent.succeeded')return 'succeeded' as const;if(type==='payment_intent.payment_failed')return 'failed' as const;if(type==='payment_intent.canceled')return 'cancelled' as const;if(type==='charge.refunded')return 'refunded' as const;return null}
export function acceptPaymentTransition(current:{status:'created'|'processing'|'succeeded'|'failed'|'cancelled'|'refunded';eventCreatedAt:string}|null,next:{status:'succeeded'|'failed'|'cancelled'|'refunded';eventCreatedAt:string}){
  if(!current)return true;
  if(new Date(next.eventCreatedAt).getTime()<new Date(current.eventCreatedAt).getTime())return false;
  if(current.status==='refunded')return next.status==='refunded';
  if(current.status==='succeeded')return next.status==='succeeded'||next.status==='refunded';
  return true;
}
