export type CheckoutRequest={departureId:string;seats:number;idempotencyKey:string;paymentMethod:'card'|'bank_transfer';draftId?:string;couponId?:string;quoteId?:string};
export type ServerQuote={quoteId:string;version:string;currency:'JPY';seatCount:number;unitPrice:number;baseFare:number;addOnTotal:number;couponId:string|null;couponSource:string|null;discountPercent:number;discountedSeats:number;discountAmount:number;amountDue:number;expiresAt:string};
type CheckoutPrice={amount:number;grossAmount:number;discountAmount:number;discountPercent:number;discountedSeats:number;discountedUnitPrice:number;couponSource:string|null};
export type CheckoutResponse=CheckoutPrice&({orderId:string;holdId:string;status:'requires_payment_action';clientSecret:string}|{orderId:string;holdId:string;status:'pending_manual_review';paymentDueAt:string}|{orderId:string;holdId:string;status:'confirmed_no_payment';paymentKind:'coupon_covered'});
export type CheckoutFailure={status:'failed';error:string;httpStatus:number|null};
export const isSafeApiBaseUrl=(value:string|undefined)=>Boolean(value&&(value.startsWith('https://')||/^\/(?!\/)/.test(value)));
export class TestBackendApi{
  constructor(private readonly baseUrl:string|undefined,private readonly accessToken:()=>Promise<string|null>,private readonly fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){}
  get available(){return isSafeApiBaseUrl(this.baseUrl)}
  async checkout(input:CheckoutRequest):Promise<CheckoutResponse|CheckoutFailure|null>{
    const token=await this.accessToken();if(!this.available||!token)return null;
    try{const response=await this.fetcher(`${this.baseUrl}/v1/checkout`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(input)});
      const body=await response.json() as CheckoutResponse|{error?:string};if(!response.ok)return {status:'failed',error:'error' in body&&body.error?body.error:'checkout_failed',httpStatus:response.status};return body as CheckoutResponse;
    }catch(error){console.error('Checkout request failed before receiving a response.',error);return {status:'failed',error:'network_error',httpStatus:null}}
  }
  async quote(input:{departureId:string;seats:number;couponId?:string}):Promise<ServerQuote|CheckoutFailure|null>{const token=await this.accessToken();if(!this.available||!token)return null;try{const response=await this.fetcher(`${this.baseUrl}/v1/quotes`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(input)});const body=await response.json() as ServerQuote|{error?:string};if(!response.ok)return {status:'failed',error:'error' in body&&body.error?body.error:'quote_failed',httpStatus:response.status};return body as ServerQuote}catch{return {status:'failed',error:'network_error',httpStatus:null}}}
  private async post<T>(path:string,input:unknown):Promise<T|null>{const token=await this.accessToken();if(!this.available||!token)return null;try{const response=await this.fetcher(`${this.baseUrl}${path}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(input)});return response.ok?await response.json() as T:null}catch{return null}}
  issueBoardingCredential(orderId:string){return this.post<{token:string;expiresAt:string;vehicleGroupId:string}>('/v1/boarding/issue',{orderId})}
  verifyBoardingCredential(input:{token:string;vehicleGroupId:string;idempotencyKey:string}){return this.post<{status:string;boardingId:string|null;verifiedAt:string}>('/v1/boarding/verify',input)}
  translateMessage(input:{messageId:string;targetLanguage:'zh-CN'|'zh-TW'|'ja'|'en'|'vi'|'ne'|'ko'}){return this.post<{translated:true;cached:boolean}>('/v1/translations/message',input)}
  executeRefund(input:{requestId:string;idempotencyKey:string;manualReference?:string;actualAmount?:number;evidenceNote?:string}){return this.post<{accepted:true;requestId:string;status:'refund_processing'|'manual_refund_required'|'refund_completed'|'cancelled_without_refund'}>('/v1/operations/refunds',input)}
}
