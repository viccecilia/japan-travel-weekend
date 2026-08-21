import type {SupabaseClient} from '@supabase/supabase-js';
export class SupabaseAuthRepository{
  constructor(private readonly client:SupabaseClient|null){}
  get available(){return this.client!==null}
  async signUp(email:string,password:string,displayName:string){if(!this.client)return null;const {data,error}=await this.client.auth.signUp({email,password,options:{data:{display_name:displayName}}});return error?null:data}
  async signIn(email:string,password:string){if(!this.client)return null;const {data,error}=await this.client.auth.signInWithPassword({email,password});return error?null:data}
  async currentUser(){if(!this.client)return null;const {data,error}=await this.client.auth.getUser();return error?null:data.user}
}
export class SupabaseOrderRepository{
  constructor(private readonly client:SupabaseClient|null){}
  async listOwnOrders(){if(!this.client)return [];const {data,error}=await this.client.from('orders').select('id,departure_id,seat_count,status,amount,currency,created_at').order('created_at',{ascending:false});return error?[]:data}
  async ownPrivateAssistance(orderId:string){if(!this.client)return null;const {data,error}=await this.client.from('passenger_assistance').select('encrypted_payload,review_status,updated_at').eq('order_id',orderId).maybeSingle();return error?null:data}
}
export class SupabasePrivateStorageAdapter{
  constructor(private readonly client:SupabaseClient|null){}
  async uploadOrderFile(accountId:string,orderId:string,fileName:string,body:Blob){if(!this.client)return null;const safeName=fileName.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${accountId}/${orderId}/${crypto.randomUUID()}-${safeName}`;const {data,error}=await this.client.storage.from('private-order-files').upload(path,body,{upsert:false});return error?null:data.path}
}
