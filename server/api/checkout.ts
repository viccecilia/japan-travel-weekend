import type {OrderInventoryGateway,VerifiedSession} from '../supabase.js';
export type ServerCheckoutInput={departureId:string;seats:number;idempotencyKey:string;paymentMethod:'card'|'bank_transfer';draftId?:string;couponId?:string};
export interface AccessTokenVerifier{verify(token:string):Promise<VerifiedSession|null>}
export interface CardPaymentSessionGateway{available:boolean;create(input:{orderId:string;amount:number;idempotencyKey:string}):Promise<{clientSecret:string}|null>}
export interface ManualPaymentGateway{markPending(orderId:string,amount:number):Promise<{dueAt:string}|null>}
export interface ServerPricingGateway{quote(departureId:string,seats:number):Promise<{amount:number;currency:'JPY'}|null>;applyCoupon?(accountId:string,orderId:string,couponId:string,grossAmount:number):Promise<{amount:number;grossAmount:number;discountAmount:number;discountPercent:number}|null>}
export class CheckoutEndpoint{
  constructor(private readonly auth:AccessTokenVerifier,private readonly inventory:OrderInventoryGateway,private readonly card:CardPaymentSessionGateway,private readonly manual:ManualPaymentGateway,private readonly pricing:ServerPricingGateway,private readonly now=()=>new Date()){}
  async post(authorization:string|undefined,input:ServerCheckoutInput){
    const token=authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)return {status:401,body:{error:'unauthorized'}};
    const session=await this.auth.verify(token);if(!session)return {status:401,body:{error:'unauthorized'}};
    if(!input.departureId||input.seats<1||!Number.isInteger(input.seats)||!input.idempotencyKey||!['card','bank_transfer'].includes(input.paymentMethod))return {status:400,body:{error:'invalid_request'}};
    if(input.paymentMethod==='card'&&!this.card.available)return {status:503,body:{error:'card_payment_unavailable'}};
    const quote=await this.pricing.quote(input.departureId,input.seats);if(!quote)return {status:409,body:{error:'price_unavailable'}};
    const expiresAt=new Date(this.now().getTime()+15*60*1000).toISOString();const reserved=await this.inventory.reserve(session,{departureId:input.departureId,seats:input.seats,idempotencyKey:input.idempotencyKey,expiresAt,draftId:input.draftId});if(!reserved)return {status:409,body:{error:'inventory_unavailable'}};
    const discount=input.couponId?await this.pricing.applyCoupon?.(session.accountId,reserved.orderId,input.couponId,quote.amount):null;if(input.couponId&&!discount){await this.inventory.cancel(session,reserved.orderId);return {status:409,body:{error:'coupon_unavailable'}}}const payable=discount?.amount??quote.amount;const breakdown=discount?{grossAmount:discount.grossAmount,discountAmount:discount.discountAmount,discountPercent:discount.discountPercent}:{grossAmount:quote.amount,discountAmount:0,discountPercent:0};
    if(input.paymentMethod==='bank_transfer'){const pending=await this.manual.markPending(reserved.orderId,payable);if(!pending){await this.inventory.cancel(session,reserved.orderId);return {status:503,body:{error:'manual_payment_unavailable'}}}return {status:200,body:{...reserved,...breakdown,amount:payable,status:'pending_manual_review' as const,paymentDueAt:pending.dueAt}}}
    const payment=await this.card.create({orderId:reserved.orderId,amount:payable,idempotencyKey:input.idempotencyKey});if(!payment){await this.inventory.cancel(session,reserved.orderId);return {status:503,body:{error:'card_payment_unavailable'}}}return {status:200,body:{...reserved,...breakdown,amount:payable,status:'requires_payment_action' as const,clientSecret:payment.clientSecret}}
  }
}
