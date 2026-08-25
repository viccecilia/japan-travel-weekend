export type CheckoutRequest={departureId:string;seats:number;idempotencyKey:string;paymentMethod:'card'|'bank_transfer'};
export type CheckoutResponse={orderId:string;holdId:string;status:'requires_payment_action';clientSecret:string}|{orderId:string;holdId:string;status:'pending_manual_review'};
export class TestBackendApi{
  constructor(private readonly baseUrl:string|undefined,private readonly accessToken:()=>Promise<string|null>,private readonly fetcher:typeof fetch=fetch){}
  get available(){return Boolean(this.baseUrl?.startsWith('https://'))}
  async checkout(input:CheckoutRequest):Promise<CheckoutResponse|null>{
    const token=await this.accessToken();if(!this.available||!token)return null;
    try{const response=await this.fetcher(`${this.baseUrl}/v1/checkout`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(input)});
      if(!response.ok)return null;return await response.json() as CheckoutResponse;
    }catch{return null}
  }
}
