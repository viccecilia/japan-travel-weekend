import type { SupabaseClient } from "@supabase/supabase-js";
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
}
export class SupabaseTripRoomRepository {
  constructor(private readonly client: SupabaseClient | null) {}
  get available() { return this.client !== null; }
  async loadAccessibleRoom() {
    if (!this.client) return { data: null, error: "行程房间服务未配置" };
    const { data, error } = await this.client
      .from("trip_rooms")
      .select("id,vehicle_group_id,status,opens_at")
      .limit(1)
      .maybeSingle();
    return error
      ? { data: null, error: "无法读取本车行程房间" }
      : { data, error: null };
  }
  async loadMessages(roomId: string) {
    if (!this.client) return [];
    const { data, error } = await this.client
      .from("trip_room_messages")
      .select("id,author_id,content,created_at")
      .eq("trip_room_id", roomId)
      .order("created_at");
    return error ? [] : (data ?? []);
  }
  async sendMessage(roomId: string, authorId: string, content: string) {
    if (!this.client || !content.trim()) return false;
    const { error } = await this.client
      .from("trip_room_messages")
      .insert({
        trip_room_id: roomId,
        author_id: authorId,
        content: content.trim(),
      });
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
