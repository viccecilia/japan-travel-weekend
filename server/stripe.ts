import Stripe from 'stripe';
import {createHash} from 'node:crypto';

export type StripeTestConfig={secretKey:string;webhookSecret:string;mode?:'test'|'live'};
export type PaymentEventStore={has(providerEventId:string):Promise<boolean>;findOrderIdByPaymentIntent(paymentIntentId:string):Promise<string|null>;apply(input:{providerEventId:string;orderId:string;status:'succeeded'|'failed'|'cancelled';createdAt:string;payloadDigest:string}):Promise<boolean>;applyRefund(input:{providerEventId:string;orderId:string;providerRefundId:string|null;amountRefunded:number;chargeAmount:number;createdAt:string;payloadDigest:string}):Promise<boolean>;applyRefundStatus?(input:{providerEventId:string;orderId:string;providerRefundId:string;status:'succeeded'|'failed'|'canceled'|'pending'|'requires_action';amount:number;createdAt:string;payloadDigest:string}):Promise<boolean>};
export class StripeTestAdapter{
  private readonly stripe:Stripe|null;
  readonly mode:'test'|'live';
  constructor(private readonly config:StripeTestConfig){this.mode=config.mode??'test';const expectedPrefix=this.mode==='live'?'sk_live_':'sk_test_';this.stripe=config.secretKey.startsWith(expectedPrefix)?new Stripe(config.secretKey):null}
  get available(){return this.stripe!==null&&this.config.webhookSecret.startsWith('whsec_')}
  async createPaymentIntent(input:{orderId:string;amount:number;idempotencyKey:string}){
    if(!this.stripe||input.amount<=0)return null;
    return this.stripe.paymentIntents.create({
      amount:input.amount,
      currency:'jpy',
      automatic_payment_methods:{enabled:true},
      metadata:{order_id:input.orderId,jtw_payment_mode:this.mode}
    },{idempotencyKey:input.idempotencyKey});
  }
  async cancelPaymentIntent(id:string){if(!this.stripe)return false;await this.stripe.paymentIntents.cancel(id);return true}
  async createRefund(input:{paymentIntentId:string;amount:number;idempotencyKey:string}){if(!this.stripe||!input.paymentIntentId.startsWith('pi_')||!Number.isSafeInteger(input.amount)||input.amount<1)return null;return this.stripe.refunds.create({payment_intent:input.paymentIntentId,amount:input.amount,metadata:{jtw_payment_mode:this.mode}},{idempotencyKey:input.idempotencyKey})}
  async handleWebhook(rawBody:Buffer,signature:string,store:PaymentEventStore){
    if(!this.available||!this.stripe)return {accepted:false,reason:'unavailable'} as const;
    let event:Stripe.Event;
    try{event=this.stripe.webhooks.constructEvent(rawBody,signature,this.config.webhookSecret)}catch{return {accepted:false,reason:'invalid-signature'} as const}
    if(await store.has(event.id))return {accepted:true,duplicate:true} as const;
    const status=mapStripeEvent(event.type);if(!status)return {accepted:true,ignored:true} as const;
    const orderId=await extractOrderId(event,store);
    if(!orderId)return {accepted:false,reason:'missing-order'} as const;
    const createdAt=new Date(event.created*1000).toISOString();const payloadDigest=createHash('sha256').update(rawBody).digest('hex');
    const applied=status==='refund_updated'
      ?event.type==='charge.refunded'?await store.applyRefund(refundEventInput(event,orderId,createdAt,payloadDigest)):store.applyRefundStatus?await store.applyRefundStatus(refundStatusEventInput(event,orderId,createdAt,payloadDigest)):false
      :await store.apply({providerEventId:event.id,orderId,status,createdAt,payloadDigest});
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
  if(event.type==='refund.updated'||event.type==='refund.failed'){const refund=event.data.object as Stripe.Refund;const paymentIntentId=typeof refund.payment_intent==='string'?refund.payment_intent:refund.payment_intent?.id;if(!paymentIntentId)return null;return store.findOrderIdByPaymentIntent(paymentIntentId)}
  return null;
}
export function mapStripeEvent(type:string){if(type==='payment_intent.succeeded')return 'succeeded' as const;if(type==='payment_intent.payment_failed')return 'failed' as const;if(type==='payment_intent.canceled')return 'cancelled' as const;if(type==='charge.refunded'||type==='refund.updated'||type==='refund.failed')return 'refund_updated' as const;return null}
export function refundEventInput(event:Stripe.Event,orderId:string,createdAt:string,payloadDigest:string){
  const charge=event.data.object as Stripe.Charge;const refunds=charge.refunds?.data??[];const latest=refunds.reduce<Stripe.Refund|null>((value,item)=>!value||item.created>value.created?item:value,null);
  return {providerEventId:event.id,orderId,providerRefundId:latest?.id??null,amountRefunded:charge.amount_refunded,chargeAmount:charge.amount,createdAt,payloadDigest};
}
export function refundStatusEventInput(event:Stripe.Event,orderId:string,createdAt:string,payloadDigest:string){const refund=event.data.object as Stripe.Refund;return {providerEventId:event.id,orderId,providerRefundId:refund.id,status:(event.type==='refund.failed'?'failed':refund.status??'pending') as 'succeeded'|'failed'|'canceled'|'pending'|'requires_action',amount:refund.amount,createdAt,payloadDigest}}
export function acceptPaymentTransition(current:{status:'created'|'processing'|'succeeded'|'failed'|'cancelled'|'refunded';eventCreatedAt:string}|null,next:{status:'succeeded'|'failed'|'cancelled'|'refunded';eventCreatedAt:string}){
  if(!current)return true;
  if(new Date(next.eventCreatedAt).getTime()<new Date(current.eventCreatedAt).getTime())return false;
  if(current.status==='refunded')return next.status==='refunded';
  if(current.status==='succeeded')return next.status==='succeeded'||next.status==='refunded';
  return true;
}
