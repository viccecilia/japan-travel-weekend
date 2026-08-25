export type CheckoutRequest={departureId:string;seats:number;idempotencyKey:string;paymentMethod:'card'|'bank_transfer'};
export type CheckoutResponse={orderId:string;holdId:string;status:'requires_payment_action';clientSecret:string}|{orderId:string;holdId:string;status:'pending_manual_review'};
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
  private async post<T>(path:string,input:unknown):Promise<T|null>{const token=await this.accessToken();if(!this.available||!token)return null;try{const response=await this.fetcher(`${this.baseUrl}${path}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(input)});return response.ok?await response.json() as T:null}catch{return null}}
  issueBoardingCredential(orderId:string){return this.post<{token:string;expiresAt:string;vehicleGroupId:string}>('/v1/boarding/issue',{orderId})}
  verifyBoardingCredential(input:{token:string;vehicleGroupId:string;idempotencyKey:string}){return this.post<{status:string;boardingId:string|null;verifiedAt:string}>('/v1/boarding/verify',input)}
}
