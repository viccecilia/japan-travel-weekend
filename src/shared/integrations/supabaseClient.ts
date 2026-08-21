import {createClient, type SupabaseClient} from '@supabase/supabase-js';

export type PublicSupabaseConfig={url:string;publishableKey:string};
export function createSupabaseBrowserClient(config:PublicSupabaseConfig):SupabaseClient|null{
  if(!config.url.startsWith('https://')||!config.publishableKey.trim())return null;
  return createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
}

export class SupabaseRealtimeAdapter{
  constructor(private readonly client:SupabaseClient|null){}
  get connected(){return this.client!==null}
  async subscribePrivateVehicleGroup(vehicleGroupId:string,onMessage:(payload:unknown)=>void){
    if(!this.client)return {subscribed:false,close(){}};
    const channel=this.client.channel(`private:vehicle-group:${vehicleGroupId}`,{config:{private:true}}).on('broadcast',{event:'message'},payload=>onMessage(payload));
    const subscribed=await new Promise<boolean>(resolve=>channel.subscribe(status=>resolve(status==='SUBSCRIBED')));
    return {subscribed,close:()=>{void this.client?.removeChannel(channel)}};
  }
}
