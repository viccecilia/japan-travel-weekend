import {createClient, type SupabaseClient} from '@supabase/supabase-js';

export type SupabaseServerConfig={url:string;serviceRoleKey:string};
export function createSupabaseServerClient(config:SupabaseServerConfig):SupabaseClient|null{
  if(!config.url.startsWith('https://')||!config.serviceRoleKey.trim())return null;
  return createClient(config.url,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
}

export type VerifiedSession={accountId:string;accessTokenHash:string};
export interface OrderInventoryGateway{reserve(session:VerifiedSession,input:{departureId:string;seats:number;idempotencyKey:string;expiresAt:string}):Promise<{orderId:string;holdId:string}|null>}
export class SupabaseOrderInventoryGateway implements OrderInventoryGateway{
  constructor(private readonly client:SupabaseClient|null){}
  async reserve(session:VerifiedSession,input:{departureId:string;seats:number;idempotencyKey:string;expiresAt:string}){
    if(!this.client)return null;
    const {data,error}=await this.client.rpc('reserve_inventory',{p_departure:input.departureId,p_account:session.accountId,p_seats:input.seats,p_key:input.idempotencyKey,p_expires:input.expiresAt});
    if(error||!data?.[0])return null;
    return {orderId:data[0].order_id as string,holdId:data[0].hold_id as string};
  }
}
