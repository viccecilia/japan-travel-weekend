import type {SupabaseClient} from '@supabase/supabase-js';import {TestBackendApi,type CheckoutRequest} from './testApi';import {SupabaseAuthRepository,SupabaseOrderRepository} from '../integrations/supabaseProduction';
export class ProductionBrowserServices{
  readonly auth;readonly orders;readonly checkout;
  constructor(client:SupabaseClient|null,apiBaseUrl:string|undefined,fetcher?:typeof fetch){this.auth=new SupabaseAuthRepository(client);this.orders=new SupabaseOrderRepository(client);this.checkout=new TestBackendApi(apiBaseUrl,async()=>client?(await client.auth.getSession()).data.session?.access_token??null:null,fetcher)}
  get available(){return this.auth.available&&this.checkout.available}
  signIn(email:string,password:string){return this.auth.signIn(email,password)}
  currentUser(){return this.auth.currentUser()}
  listOwnOrders(){return this.orders.listOwnOrders()}
  createCheckout(input:CheckoutRequest){return this.checkout.checkout(input)}
}
