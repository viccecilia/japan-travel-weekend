import type { SupabaseClient } from "@supabase/supabase-js";
import type { Departure, SeatStatus } from "../types";

type SellableDepartureRow={id:string;trip_slug:string;trip_title:string;departs_at:string;capacity:number;available_seats:number;seat_price_jpy:number};
const seatStatus=(available:number,capacity:number):SeatStatus=>available<=0?'已售罄':available<=2?'余位较少':available/capacity<=.25?'即将满员':'可预订';
const weekendBucket=(date:Date,now=new Date()):Departure['weekend']=>{const days=(date.getTime()-now.getTime())/86400000;return days<=7?'本周末':days<=14?'下周末':'稍后'};
export function mapSellableDeparture(row:SellableDepartureRow,now=new Date()):Departure{
  const departsAt=new Date(row.departs_at);
  return {id:row.id,tripSlug:row.trip_slug,dateLabel:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(departsAt),weekend:weekendBucket(departsAt,now),status:seatStatus(row.available_seats,row.capacity),departureTime:departsAt.toISOString(),meetingPointName:null,meetingAddress:null,meetingCoordinates:null,arrivalInstructions:{transit:null,walking:null,driving:null},meetingPhoto:null,meetingPhotoStatus:'待确认',mapStatus:'未连接',price:row.seat_price_jpy,availableSeats:row.available_seats,isSeed:false};
}
export class SupabaseDepartureRepository{
  constructor(private readonly client:SupabaseClient|null){}
  get available(){return this.client!==null}
  async listSellable(){if(!this.client)return {data:[] as Departure[],error:'班次服务未配置'};try{const {data,error}=await this.client.rpc('list_sellable_departures');return error?{data:[] as Departure[],error:'无法读取可售班次'}:{data:((data??[]) as SellableDepartureRow[]).map(row=>mapSellableDeparture(row)),error:null}}catch{return {data:[] as Departure[],error:'无法读取可售班次'}}}
}
export class SupabaseAuthRepository {
  constructor(private readonly client: SupabaseClient | null,private readonly appOrigin:string=typeof window==='undefined'?'http://localhost':window.location.origin) {}
  get available() {
    return this.client !== null;
  }
  private redirect(path:'/app/auth/callback'|'/app/reset-password'){
    try{const origin=new URL(this.appOrigin);if(!['http:','https:'].includes(origin.protocol)||origin.pathname!=='/'||origin.search||origin.hash)return null;return new URL(path,origin.origin).toString()}catch{return null}
  }
  async signUp(email: string, password: string) {
    if (!this.client) return null;
    const emailRedirectTo=this.redirect('/app/auth/callback');if(!emailRedirectTo)return null;
    try{const { data, error } = await this.client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      return error ? null : data;
    }catch{return null}
  }
  async requestPasswordReset(email:string){
    if(!this.client)return false;const redirectTo=this.redirect('/app/reset-password');if(!redirectTo)return false;
    try{await this.client.auth.resetPasswordForEmail(email,{redirectTo});}catch{/* 防账户枚举：网络与账户状态使用同一客户端结果。 */}return true;
  }
  async updatePassword(password:string){if(!this.client)return false;try{return !(await this.client.auth.updateUser({password})).error}catch{return false}}
  onAuthStateChange(handler:(event:string,user:{email?:string|null}|null)=>void){
    if(!this.client||typeof this.client.auth.onAuthStateChange!=='function')return ()=>{};
    const {data}=this.client.auth.onAuthStateChange((event,session)=>handler(event,session?.user??null));
    return ()=>data.subscription.unsubscribe();
  }
  async signIn(email: string, password: string) {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    return error ? null : data;
  }
  async currentUser() {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getUser();
    return error ? null : data.user;
  }
  async signOut() {
    if (!this.client) return false;
    return !(await this.client.auth.signOut()).error;
  }
  async currentRole() {
    if (!this.client) return null;
    const user = await this.currentUser();
    if (!user) return null;
    const { data, error } = await this.client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return error ? null : (data?.role ?? null);
  }
}
export class SupabaseOrderRepository {
  constructor(private readonly client: SupabaseClient | null) {}
  get available() { return this.client !== null; }
  async listOwnOrders() {
    if (!this.client) return [];
    const { data, error } = await this.client
      .from("orders")
      .select("id,departure_id,seat_count,status,amount,currency,created_at")
      .order("created_at", { ascending: false });
    return error ? [] : data;
  }
  async loadOwnOrders() {
    if (!this.client) return { data: [], error: "账户服务未配置" };
    const { data, error } = await this.client
      .from("orders")
      .select("id,departure_id,seat_count,status,amount,currency,created_at")
      .order("created_at", { ascending: false });
    return error
      ? { data: [], error: "订单读取失败" }
      : { data: data ?? [], error: null };
  }
  async ownPrivateAssistance(orderId: string) {
    if (!this.client) return null;
    const { data, error } = await this.client
      .from("passenger_assistance")
      .select("encrypted_payload,review_status,updated_at")
      .eq("order_id", orderId)
      .maybeSingle();
    return error ? null : data;
  }
  async ownFulfilment(orderId:string){if(!this.client)return null;try{const {data,error}=await this.client.rpc('get_own_order_fulfilment',{p_order:orderId}).maybeSingle();return error?null:data}catch{return null}}
}
export class SupabaseTripRoomRepository {
  constructor(private readonly client: SupabaseClient | null) {}
  get available() { return this.client !== null; }
  async loadAccessibleRoom() {
    if (!this.client) return { data: null, error: "行程房间服务未配置" };
    const { data, error } = await this.client.rpc("get_accessible_trip_room").maybeSingle();
    return error
      ? { data: null, error: "无法读取本车行程房间" }
      : { data, error: null };
  }
  async startOwnLocationShare(vehicleGroupId:string,minutes:15|30){if(!this.client)return false;const {error}=await this.client.rpc('start_own_location_share',{p_vehicle_group:vehicleGroupId,p_minutes:minutes});return !error}
  async stopOwnLocationShare(vehicleGroupId:string){if(!this.client)return false;const {error}=await this.client.rpc('stop_own_location_share',{p_vehicle_group:vehicleGroupId});return !error}
  async publishDriverLocation(vehicleGroupId:string,coordinates:{latitude:number;longitude:number;accuracy:number|null},minutes=15){if(!this.client)return false;const {error}=await this.client.rpc('publish_driver_location',{p_vehicle_group:vehicleGroupId,p_latitude:coordinates.latitude,p_longitude:coordinates.longitude,p_accuracy_meters:coordinates.accuracy,p_minutes:minutes});return !error}
  async stopDriverLocation(vehicleGroupId:string){if(!this.client)return false;const {error}=await this.client.rpc('stop_driver_location',{p_vehicle_group:vehicleGroupId});return !error}
  async loadDriverLocation(vehicleGroupId:string){if(!this.client)return null;const {data,error}=await this.client.rpc('get_active_driver_location',{p_vehicle_group:vehicleGroupId}).maybeSingle();return error?null:data}
  async loadMessages(roomId: string) {
    if (!this.client) return [];
    const { data, error } = await this.client
      .from("trip_room_messages")
      .select("id,author_id,content,created_at")
      .eq("trip_room_id", roomId)
      .order("created_at");
    return error ? [] : (data ?? []);
  }
  async sendMessage(roomId: string, content: string, idempotencyKey:string=crypto.randomUUID()) {
    if (!this.client || !content.trim()) return false;
    const { error } = await this.client.rpc('send_trip_room_message',{p_room:roomId,p_content:content.trim(),p_idempotency_key:idempotencyKey});
    return !error;
  }
  async loadStaffProjection() {
    if (!this.client) return [];
    const { data, error } = await this.client
      .from("passenger_assistance_staff_projection")
      .select(
        "order_id,child_seat_count,wheelchair_type,accessible_vehicle_required,lift_required,staff_assistance_required,large_luggage_count,service_dog,operational_note",
      );
    return error ? [] : (data ?? []);
  }
  async loadBoardingStatus(vehicleGroupId:string){if(!this.client)return [];const {data,error}=await this.client.rpc('get_vehicle_group_boarding_status',{p_vehicle_group:vehicleGroupId});return error?[]:(data??[])}
  async sendStaffTemplate(roomId:string,templateKey:string){if(!this.client)return false;const {error}=await this.client.rpc('send_staff_trip_room_template',{p_room:roomId,p_template_key:templateKey});return !error}
  async markOrderBoarded(vehicleGroupId:string,orderId:string){if(!this.client)return false;const {error}=await this.client.rpc('mark_vehicle_group_order_boarded',{p_vehicle_group:vehicleGroupId,p_order:orderId});return !error}
  async loadAttendance(vehicleGroupId:string){if(!this.client)return [];const {data,error}=await this.client.rpc('get_vehicle_group_attendance',{p_vehicle_group:vehicleGroupId});return error?[]:(data??[])}
  async setOwnCheckin(passengerId:string,status:'confirmed_departure'|'at_meeting_point'|'needs_assistance'){if(!this.client)return false;const {error}=await this.client.rpc('set_own_passenger_checkin',{p_passenger:passengerId,p_status:status,p_idempotency_key:crypto.randomUUID()});return !error}
  async setStaffCheckin(vehicleGroupId:string,passengerId:string,status:'at_meeting_point'|'boarded'|'needs_assistance'|'contacting'|'unreachable'){if(!this.client)return false;const {error}=await this.client.rpc('set_staff_passenger_checkin',{p_vehicle_group:vehicleGroupId,p_passenger:passengerId,p_status:status,p_idempotency_key:crypto.randomUUID()});return !error}
  async recordContact(vehicleGroupId:string,passengerId:string,action:'contact_requested'|'contacting'|'reached'|'unreachable'|'escalated_to_operations'|'resolved'){if(!this.client)return false;const {error}=await this.client.rpc('record_passenger_contact_action',{p_vehicle_group:vehicleGroupId,p_passenger:passengerId,p_action:action,p_idempotency_key:crypto.randomUUID(),p_note:null});return !error}
}
export class SupabasePrivateStorageAdapter {
  constructor(private readonly client: SupabaseClient | null) {}
  async uploadOrderFile(
    accountId: string,
    orderId: string,
    fileName: string,
    body: Blob,
  ) {
    if (!this.client) return null;
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${accountId}/${orderId}/${crypto.randomUUID()}-${safeName}`;
    const { data, error } = await this.client.storage
      .from("private-order-files")
      .upload(path, body, { upsert: false });
    return error ? null : data.path;
  }
}
