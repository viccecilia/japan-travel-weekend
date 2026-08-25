import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type PublicSupabaseConfig = { url: string; publishableKey: string };
export function createSupabaseBrowserClient(
  config: PublicSupabaseConfig,
): SupabaseClient | null {
  if (!config.url.startsWith("https://") || !config.publishableKey.trim())
    return null;
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export class SupabaseRealtimeAdapter {
  constructor(private readonly client: SupabaseClient | null) {}
  get connected() {
    return this.client !== null;
  }
  async subscribePrivateVehicleGroup(
    vehicleGroupId: string,
    onMessage: (payload: unknown) => void,
    onStatus?: (status: string) => void,
  ) {
    if (!this.client)
      return { subscribed: false, send: async () => false, close() {} };
    const channel = this.client
      .channel(`private:vehicle-group:${vehicleGroupId}`, {
        config: { private: true },
      })
      .on("broadcast", { event: "message" }, (payload) => onMessage(payload));
    const subscribed = await new Promise<boolean>((resolve) =>
      channel.subscribe((status) => {
        onStatus?.(status);
        resolve(status === "SUBSCRIBED");
      }),
    );
    return {
      subscribed,
      send: async (payload: unknown) =>
        (await channel.send({
          type: "broadcast",
          event: "message",
          payload,
        })) === "ok",
      close: () => {
        void this.client?.removeChannel(channel);
      },
    };
  }
  async subscribeTripRoom(
    roomId:string,
    onMessage:()=>void,
    onRoomStatus:(status:"frozen"|"open"|"closed")=>void,
    onAttendance:()=>void,
    onStatus?:(status:string)=>void,
  ){
    if(!this.client)return {subscribed:false,close(){}};
    const channel=this.client.channel(`trip-room-durable:${roomId}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'trip_room_messages',filter:`trip_room_id=eq.${roomId}`},()=>onMessage())
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'trip_rooms',filter:`id=eq.${roomId}`},payload=>{
        const status=(payload.new as {status?:string}).status;
        if(status==='frozen'||status==='open'||status==='closed')onRoomStatus(status);
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'passenger_checkins'},()=>onAttendance());
    const subscribed=await new Promise<boolean>(resolve=>channel.subscribe(status=>{onStatus?.(status);if(status==='SUBSCRIBED'||status==='CHANNEL_ERROR'||status==='TIMED_OUT')resolve(status==='SUBSCRIBED')}));
    return {subscribed,close:()=>{void this.client?.removeChannel(channel)}};
  }
}
