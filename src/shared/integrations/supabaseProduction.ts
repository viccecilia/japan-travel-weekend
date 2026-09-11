import type { SupabaseClient } from "@supabase/supabase-js";
import type { Departure, SeatStatus } from "../types";

type SellableDepartureRow = {
  id: string;
  trip_slug: string;
  trip_title: string;
  departs_at: string;
  ends_at: string;
  capacity: number;
  available_seats: number;
  minimum_guests: number;
  seat_price_jpy: number;
  child_price_jpy?: number | null;
  infant_price_jpy?: number | null;
  currency: "JPY";
  tax_included: boolean;
  sales_close_at: string;
  meeting_name: string;
  meeting_address: string;
  map_lat: number;
  map_lng: number;
  arrival_transit?: string | null;
  arrival_walking?: string | null;
  arrival_driving?: string | null;
  meeting_photo_url?: string | null;
};
export type StaffTaskRow = {
  staff_assignment_id: string;
  assignment_role: "driver" | "guide" | "operations";
  vehicle_group_id: string;
  room_id: string | null;
  room_status: string | null;
  departure_id: string;
  trip_title: string;
  departs_at: string | null;
  chat_opens_at: string | null;
  meeting_name: string | null;
  meeting_address: string | null;
  map_lat: number | null;
  map_lng: number | null;
  vehicle_sequence: number;
  vehicle_type: string;
  vehicle_label: string | null;
  vehicle_capacity: number;
  booked_seats: number;
  passenger_count: number;
  boarded_count: number;
  journey_status?: "pending" | "meeting" | "in_progress" | "completed" | string;
};
export type VehicleGroupMeetingRow = {
  vehicle_group_id: string;
  meeting_at: string;
  meeting_name: string;
  meeting_address: string;
  latitude: number;
  longitude: number;
  landmark_description: string;
  status: "scheduled" | "active" | "completed" | "cancelled";
  revision: number;
  changed_reason: string | null;
  changed_at: string;
  acknowledged: boolean;
};
export type PassengerTripContextRow={trip_title:string;itinerary:string[];return_at:string|null;staff_name:string|null;staff_role:'driver'|'guide'|'driver_guide'|'operations'|null;staff_phone:string|null;vehicle_type:string;vehicle_label:string|null;vehicle_color:string|null;vehicle_photo_url:string|null};
export type VehicleGroupItineraryStopRow={id:string;name:string;arrivalTime?:string;meetingTime:string;meetingPointName:string;meetingPointDescription?:string;meetingPointPhoto?:string;latitude:number;longitude:number};
const seatStatus = (available: number, capacity: number): SeatStatus =>
  available <= 0
    ? "已售罄"
    : available <= 2
      ? "余位较少"
      : available / capacity <= 0.25
        ? "即将满员"
        : "可预订";
const weekendBucket = (date: Date, now = new Date()): Departure["weekend"] => {
  const days = (date.getTime() - now.getTime()) / 86400000;
  return days <= 7 ? "本周末" : days <= 14 ? "下周末" : "稍后";
};
export function mapSellableDeparture(
  row: SellableDepartureRow,
  now = new Date(),
): Departure {
  const departsAt = new Date(row.departs_at);
  const coordinates =
    row.map_lat == null || row.map_lng == null
      ? null
      : { lat: Number(row.map_lat), lng: Number(row.map_lng) };
  return {
    id: row.id,
    tripSlug: row.trip_slug,
    dateLabel: new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Tokyo",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(departsAt),
    weekend: weekendBucket(departsAt, now),
    status: seatStatus(row.available_seats, row.capacity),
    departureTime: departsAt.toISOString(),
    expectedEndTime: row.ends_at,
    meetingPointName: row.meeting_name,
    meetingAddress: row.meeting_address,
    meetingCoordinates: coordinates,
    arrivalInstructions: {
      transit: row.arrival_transit ?? null,
      walking: row.arrival_walking ?? null,
      driving: row.arrival_driving ?? null,
    },
    meetingPhoto: row.meeting_photo_url ?? null,
    meetingPhotoStatus: row.meeting_photo_url ? "已确认" : "待确认",
    mapStatus: coordinates ? "已连接" : "未连接",
    price: row.seat_price_jpy,
    availableSeats: row.available_seats,
    minimumGuests: row.minimum_guests,
    salesCloseAt: row.sales_close_at,
    currency: row.currency,
    taxIncluded: row.tax_included,
    inventoryStatus: "权威库存",
    isSeed: false,
  };
}
export function sellableDepartureIssues(
  row: SellableDepartureRow,
  now = new Date(),
) {
  const issues: string[] = [];
  const departure = new Date(row.departs_at),
    end = new Date(row.ends_at),
    close = new Date(row.sales_close_at);
  if (!Number.isFinite(departure.getTime()) || departure <= now)
    issues.push("departure");
  if (!Number.isFinite(end.getTime()) || end <= departure)
    issues.push("return");
  if (!Number.isFinite(close.getTime()) || close <= now || close >= departure)
    issues.push("sales-close");
  if (
    row.capacity < 1 ||
    row.minimum_guests < 1 ||
    row.minimum_guests > row.capacity
  )
    issues.push("capacity");
  if (row.available_seats < 1 || row.available_seats > row.capacity)
    issues.push("inventory");
  if (
    row.seat_price_jpy < 1 ||
    row.currency !== "JPY" ||
    row.tax_included !== true
  )
    issues.push("price");
  if (
    !row.meeting_name?.trim() ||
    !row.meeting_address?.trim() ||
    !Number.isFinite(Number(row.map_lat)) ||
    !Number.isFinite(Number(row.map_lng))
  )
    issues.push("meeting");
  return issues;
}
export class SupabaseDepartureRepository {
  constructor(private readonly client: SupabaseClient | null) {}
  get available() {
    return this.client !== null;
  }
  async listSellable() {
    if (!this.client)
      return { data: [] as Departure[], error: "班次服务未配置" };
    try {
      const { data, error } = await this.client.rpc("list_sellable_departures");
      return error
        ? { data: [] as Departure[], error: "无法读取可售班次" }
        : {
            data: ((data ?? []) as SellableDepartureRow[])
              .filter((row) => sellableDepartureIssues(row).length === 0)
              .map((row) => mapSellableDeparture(row)),
            error: null,
          };
    } catch {
      return { data: [] as Departure[], error: "无法读取可售班次" };
    }
  }
}
export type PublicCatalogRow={id:string;slug:string;title:string;content:Record<string,unknown>|null;hero_image_url:string|null;gallery:unknown;revision_number:number;updated_at:string};
export class SupabaseCatalogRepository{
  constructor(private readonly client:SupabaseClient|null){}
  async listPublished(){
    if(!this.client)return {data:[],error:'产品目录服务未配置'};
    try{const {data,error}=await this.client.rpc('list_public_product_catalog');
      if(error||!Array.isArray(data))return {data:[],error:'无法读取已发布产品目录'};
      return {data:(data as PublicCatalogRow[]).map(row=>({id:row.id,slug:row.slug,title:row.title,content:row.content??{},heroImageUrl:row.hero_image_url,gallery:Array.isArray(row.gallery)?row.gallery.filter((item):item is string=>typeof item==='string'):[],revisionNumber:Number(row.revision_number),updatedAt:row.updated_at})),error:null};
    }catch{return {data:[],error:'无法读取已发布产品目录'}}
  }
}
export class SupabaseAuthRepository {
  constructor(
    private readonly client: SupabaseClient | null,
    private readonly appOrigin: string = typeof window === "undefined"
      ? "http://localhost"
      : window.location.origin,
  ) {}
  get available() {
    return this.client !== null;
  }
  private redirect(path: "/app/auth/callback" | "/app/reset-password") {
    try {
      const origin = new URL(this.appOrigin);
      if (
        !["http:", "https:"].includes(origin.protocol) ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash
      )
        return null;
      return new URL(path, origin.origin).toString();
    } catch {
      return null;
    }
  }
  async signUp(email: string, password: string, accountType:"passenger"|"driver"|"guide"="passenger", displayName="", referralCode="") {
    if (!this.client) return null;
    const emailRedirectTo = this.redirect("/app/auth/callback");
    if (!emailRedirectTo) return null;
    try {
      const cleanReferral=referralCode.trim().toUpperCase();
      const options=accountType==='passenger'&&!displayName.trim()&&!cleanReferral?{emailRedirectTo}:{emailRedirectTo,data:{requested_account_type:accountType,display_name:displayName.trim(),referral_code:accountType==='passenger'?cleanReferral:''}};
      const { data, error } = await this.client.auth.signUp({
        email,
        password,
        options,
      });
      return error ? null : data;
    } catch {
      return null;
    }
  }
  async loadOwnReferralSummary(){if(!this.client)return null;try{const {data,error}=await this.client.rpc('get_own_referral_summary');return error?null:data as {code:string;active:boolean;discountPercent:number;validityDays:number;successfulInvites:number;completedInvites:number;pendingInvites:number;achievementKey:string;nextMilestone:number|null;coupons:Array<{id:string;discountPercent:number;status:string;expiresAt:string;recipientKind:string;activatedAt:string|null;availableAt:string|null;qualifyingTripStartsAt:string|null}>}}catch{return null}}
  async loadOwnCashCommissionSummary(){if(!this.client)return null;const {data,error}=await this.client.rpc('get_own_cash_commission_summary');return error?null:data as {qualificationStatus:string;pendingJpy:number;availableJpy:number;lockedJpy:number;paidJpy:number;recoveryDueJpy:number;entries:Array<{id:string;sourceOrderId:string;basisAmountJpy:number;commissionPercent:number;amountJpy:number;status:string;unlockedAt:string|null}>;payouts:Array<{id:string;weekStart:string;amountJpy:number;status:string;requestedAt:string}>}}
  async applyForAmbassador(note=''){if(!this.client)return {ok:false,error:'账户服务未配置'};const {error}=await this.client.rpc('apply_for_ambassador',{p_note:note});return {ok:!error,error:error?.message??null}}
  async requestOwnCommissionPayout(idempotencyKey:string){if(!this.client)return {ok:false,error:'账户服务未配置'};const {error}=await this.client.rpc('request_own_commission_payout',{p_idempotency_key:idempotencyKey});return {ok:!error,error:error?.message??null}}
  async requestPasswordReset(email: string) {
    if (!this.client) return false;
    const redirectTo = this.redirect("/app/reset-password");
    if (!redirectTo) return false;
    try {
      await this.client.auth.resetPasswordForEmail(email, { redirectTo });
    } catch {
      /* 防账户枚举：网络与账户状态使用同一客户端结果。 */
    }
    return true;
  }
  async updatePassword(password: string) {
    if (!this.client) return false;
    try {
      return !(await this.client.auth.updateUser({ password })).error;
    } catch {
      return false;
    }
  }
  onAuthStateChange(
    handler: (event: string, user: { email?: string | null } | null) => void,
  ) {
    if (
      !this.client ||
      typeof this.client.auth.onAuthStateChange !== "function"
    )
      return () => {};
    const { data } = this.client.auth.onAuthStateChange((event, session) =>
      handler(event, session?.user ?? null),
    );
    return () => data.subscription.unsubscribe();
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
  async currentAccessDestination():Promise<"passenger"|"staff"|"operations"|"staff_pending"|"staff_blocked"|null>{
    if(!this.client)return null;
    try{
      if(typeof this.client.rpc==='function'){
        const {data,error}=await this.client.rpc("get_own_access_destination");
        const value=!error&&Array.isArray(data)?data[0]?.destination:null;
        if(["passenger","staff","operations","staff_pending","staff_blocked"].includes(value))return value;
      }
      const role=await this.currentRole();
      return role==='operations'?'operations':role==='driver'||role==='guide'?'staff':'passenger';
    }catch{return 'passenger'}
  }
  async loadOwnStaffLeaves(){if(!this.client)return [];const {data,error}=await this.client.rpc('get_own_staff_leave_requests');return error?[]:(data??[]) as Array<{id:string;starts_at:string;ends_at:string;reason:string;status:string;review_note:string;created_at:string}>}
  async submitOwnStaffLeave(startsAt:string,endsAt:string,reason:string){if(!this.client)return false;const {error}=await this.client.rpc('submit_own_staff_leave',{p_starts_at:startsAt,p_ends_at:endsAt,p_reason:reason});return !error}
  async cancelOwnStaffLeave(requestId:string){if(!this.client)return false;const {data,error}=await this.client.rpc('cancel_own_staff_leave',{p_request:requestId});return !error&&data===true}
}
export class SupabaseOrderRepository {
  constructor(private readonly client: SupabaseClient | null) {}
  get available() {
    return this.client !== null;
  }
  async listOwnOrders() {
    if (!this.client) return [];
    const { data, error } = await this.client
      .from("orders")
      .select("id,departure_id,seat_count,status,amount,currency,manual_payment_due_at,created_at")
      .order("created_at", { ascending: false });
    return error ? [] : data;
  }
  async loadOwnOrders() {
    if (!this.client) return { data: [], error: "账户服务未配置" };
    const { data, error } = await this.client
      .from("orders")
      .select("id,departure_id,seat_count,status,amount,currency,manual_payment_due_at,created_at")
      .order("created_at", { ascending: false });
    return error
      ? { data: [], error: "订单读取失败" }
      : { data: data ?? [], error: null };
  }
  async loadOwnOrderBilling(orderId:string){
    if(!this.client)return null;
    const {data,error}=await this.client.rpc('get_own_order_billing',{p_order:orderId});
    return error||!data?null:data as {orderId:string;status:string;currency:string;amountPaidJpy:number;grossAmountJpy:number;discountAmountJpy:number;lineItems:Array<{kind:string;label:string;quantity:number;unitPriceJpy:number;amountJpy:number}>;paymentKind:string|null;paymentStatus:string|null;userConfirmedAt:string|null;title:string|null;departsAt:string|null;meetingName:string|null;meetingAddress:string|null;cancellationPolicy:string|null;cancellationPolicyVersion:string|null;refunds:Array<{status:string;amountJpy:number|null;completedAt:string|null;channel:string}>;snapshotAvailable:boolean};
  }
  async loadOwnNotifications() {
    if (!this.client) return { data: [], error: "通知服务未配置" };
    try {
      const { data, error } = await this.client
        .from("notification_outbox")
        .select("id,event_type,order_id,necessary,status,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(100);
      return error
        ? { data: [], error: "通知读取失败" }
        : { data: data ?? [], error: null };
    } catch {
      return { data: [], error: "通知读取失败" };
    }
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
  async ownFulfilment(orderId: string) {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .rpc("get_own_order_fulfilment", { p_order: orderId })
        .maybeSingle();
      return error ? null : data;
    } catch {
      return null;
    }
  }
  async loadOwnCancellationRequest(orderId:string){
    if(!this.client)return null;
    const {data,error}=await this.client.from('order_cancellation_requests').select('id,status,reason_code,refund_percent,estimated_refund_amount,requested_at,updated_at').eq('order_id',orderId).in('status',['requested','reviewing','refund_processing']).order('requested_at',{ascending:false}).limit(1).maybeSingle();
    return error?null:data;
  }
  async requestOwnCancellation(orderId:string,reasonCode:string,note:string){
    if(!this.client)return {ok:false,error:'取消申请服务未配置'};
    const {data,error}=await this.client.rpc('request_own_order_cancellation',{p_order:orderId,p_reason_code:reasonCode,p_customer_note:note.trim()});
    return error||!data?{ok:false,error:'申请未提交，请检查订单状态和出发日期'}:{ok:true,error:null,id:String(data)};
  }
  async saveOwnDraft(input: {
    departureId: string;
    adults: number;
    children: number;
    infants: number;
    passengerPrivate: Record<string, unknown>;
    assistancePrivate: Record<string, unknown>;
    reviewStatus: string;
    acceptedCancellation: boolean;
    acceptedTerms: boolean;
    idempotencyKey: string;
  }) {
    if (!this.client) return { id: null, error: "订单草稿服务未配置" };
    try {
      const { data, error } = await this.client.rpc("save_own_booking_draft", {
        p_departure: input.departureId,
        p_adults: input.adults,
        p_children: input.children,
        p_infants: input.infants,
        p_passenger_private: input.passengerPrivate,
        p_assistance_private: input.assistancePrivate,
        p_operational_review_status:
          (
            {
              未提出: "not_requested",
              确认中: "reviewing",
              需人工联系: "manual_contact",
              已确认: "confirmed",
              无法提供: "unavailable",
            } as Record<string, string>
          )[input.reviewStatus] ?? "reviewing",
        p_accepted_cancellation: input.acceptedCancellation,
        p_accepted_terms: input.acceptedTerms,
        p_idempotency_key: input.idempotencyKey,
      });
      return error
        ? { id: null, error: "订单草稿保存失败，请检查班次与账户状态" }
        : { id: String(data), error: null };
    } catch {
      return { id: null, error: "订单草稿保存失败，请稍后重试" };
    }
  }
  async loadOwnDrafts() {
    if (!this.client) return { data: [], error: "订单草稿服务未配置" };
    try {
      const expired = await this.client.rpc("expire_own_booking_drafts");
      if (expired.error) return { data: [], error: "订单草稿状态更新失败" };
      const { data, error } = await this.client
        .from("booking_drafts")
        .select(
          "id,departure_id,adults,children,infants,seat_impact,assistance_summary,operational_review_status,status,converted_order_id,converted_at,created_at,updated_at,expires_at",
        )
        .order("updated_at", { ascending: false });
      return error
        ? { data: [], error: "订单草稿读取失败" }
        : { data: data ?? [], error: null };
    } catch {
      return { data: [], error: "订单草稿读取失败" };
    }
  }
  async abandonOwnDraft(draftId: string) {
    if (!this.client) return { ok: false, error: "订单草稿服务未配置" };
    try {
      const { data, error } = await this.client.rpc(
        "abandon_own_booking_draft",
        { p_draft: draftId },
      );
      return error
        ? { ok: false, error: "无法放弃该草稿" }
        : {
            ok: data === true,
            error: data === true ? null : "草稿已处理或无权操作",
          };
    } catch {
      return { ok: false, error: "无法放弃该草稿" };
    }
  }
  async loadOwnShareCampaign(){if(!this.client)return {campaign:null,submissions:[],orders:[],error:'分享活动服务未配置'};const [campaigns,submissions,orders]=await Promise.all([this.client.from('link_campaigns').select('id,campaign_month,status,opens_at,closes_at,rules_version').eq('status','open').order('campaign_month',{ascending:false}).limit(1),this.client.from('link_campaign_submissions').select('id,campaign_id,order_id,platform,post_url,platform_account,status,created_at').order('created_at',{ascending:false}),this.client.from('orders').select('id,status,created_at').in('status',['paid','confirmed']).order('created_at',{ascending:false})]);const error=campaigns.error??submissions.error??orders.error;return {campaign:campaigns.data?.[0]??null,submissions:submissions.data??[],orders:orders.data??[],error:error?'分享活动读取失败':null}}
  async submitShareLink(input:{campaignId:string;orderId:string;platform:'tiktok'|'instagram'|'facebook';url:string;platformAccount:string;authorizationVersion:string}){if(!this.client)return {ok:false,error:'分享活动服务未配置'};const {data,error}=await this.client.rpc('submit_travel_share_link',{p_campaign:input.campaignId,p_order:input.orderId,p_platform:input.platform,p_url:input.url,p_platform_account:input.platformAccount,p_authorization_version:input.authorizationVersion,p_authorization_scope:{repost:true,editing:false,paid_ads:false}});return error||!data?{ok:false,error:error?.message??'投稿未提交'}:{ok:true,error:null,id:String(data)}}
}
export type OwnAccountProfile = {
  account_id: string;
  display_name: string;
  preferred_language: "zh-CN";
  phone: string;
  emergency_name: string;
  emergency_phone: string;
  accepted_terms_at: string | null;
  accepted_privacy_at: string | null;
  updated_at: string;
};
export type AccountDeletionRequest = {
  id: string;
  status: "requested" | "deferred_active_booking" | "reviewing" | "rejected" | "cancelled" | "completed";
  reason: string | null;
  requested_at: string;
  updated_at: string;
};
export class SupabaseAccountProfileRepository {
  constructor(private readonly client: SupabaseClient | null) {}
  get available() {
    return this.client !== null;
  }
  async loadOwnDisplayName() {
    if (!this.client) return { data: "", error: "账户资料服务未配置" };
    try {
      const user=await this.client.auth.getUser();
      if(user.error||!user.data.user)return {data:"",error:"无法读取显示名"};
      const { data, error } = await this.client.from("profiles").select("display_name").eq("id",user.data.user.id).maybeSingle();
      return error
        ? { data: "", error: "无法读取显示名" }
        : { data: String(data?.display_name ?? ""), error: null };
    } catch {
      return { data: "", error: "无法读取显示名" };
    }
  }
  async updateOwnDisplayName(displayName: string) {
    if (!this.client) return { ok: false, error: "账户资料服务未配置" };
    const normalized=displayName.trim();
    if(!normalized||normalized.length>80)return {ok:false,error:"显示名未保存，请输入 1–80 个字符"};
    try {
      const { data, error } = await this.client.rpc("update_own_profile", {
        p_display_name: normalized,
      });
      return error
        ? { ok: false, error: "显示名未保存，请输入 1–80 个字符" }
        : { ok: true, data: String(data?.display_name ?? normalized), error: null };
    } catch {
      return { ok: false, error: "显示名未保存，请稍后重试" };
    }
  }
  async loadOwn() {
    if (!this.client) return { data: null, error: "账户资料服务未配置" };
    try {
      const { data, error } = await this.client
        .rpc("get_own_account_profile")
        .maybeSingle();
      return error
        ? { data: null, error: "无法读取本人资料" }
        : { data: data as OwnAccountProfile | null, error: null };
    } catch {
      return { data: null, error: "无法读取本人资料" };
    }
  }
  async updateOwn(input: {
    displayName: string;
    phone: string;
    emergencyName: string;
    emergencyPhone: string;
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
  }) {
    if (!this.client) return { ok: false, error: "账户资料服务未配置" };
    try {
      const { error } = await this.client.rpc("update_own_account_profile", {
        p_display_name: input.displayName,
        p_phone: input.phone,
        p_emergency_name: input.emergencyName,
        p_emergency_phone: input.emergencyPhone,
        p_accept_terms: input.acceptedTerms,
        p_accept_privacy: input.acceptedPrivacy,
      });
      return error
        ? { ok: false, error: "资料未保存，请检查必填内容" }
        : { ok: true, error: null };
    } catch {
      return { ok: false, error: "资料未保存，请稍后重试" };
    }
  }
  async loadOwnDeletionRequest() {
    if (!this.client) return { data: null, error: "账户资料服务未配置" };
    try {
      const { data, error } = await this.client.from("account_deletion_requests").select("id,status,reason,requested_at,updated_at").in("status",["requested","deferred_active_booking","reviewing"]).order("requested_at",{ascending:false}).limit(1).maybeSingle();
      return error ? { data: null, error: "无法读取删除申请" } : { data: data as AccountDeletionRequest | null, error: null };
    } catch { return {data:null,error:"无法读取删除申请"}; }
  }
  async requestOwnDeletion(confirmation:string,reason:string) {
    if (!this.client) return { data: null, error: "账户资料服务未配置" };
    const { data, error } = await this.client.rpc("request_own_account_deletion",{p_confirmation:confirmation,p_reason:reason||null});
    return error ? { data: null, error: "删除申请未提交，请检查确认文字" } : { data: data as AccountDeletionRequest, error: null };
  }
  async cancelOwnDeletion(requestId:string) {
    if (!this.client) return { ok:false,error:"账户资料服务未配置" };
    const { data,error }=await this.client.rpc("cancel_own_account_deletion",{p_request:requestId});
    return error||data!==true?{ok:false,error:"申请无法取消，可能已进入人工处理"}:{ok:true,error:null};
  }
}
export class SupabaseStaffRepository {
  constructor(private readonly client: SupabaseClient | null) {}
  get available() {
    return this.client !== null;
  }
  async listTasks() {
    if (!this.client)
      return { data: [] as StaffTaskRow[], error: "工作人员任务服务未配置" };
    try {
      const { data, error } = await this.client.rpc("get_staff_portal_tasks");
      return error
        ? { data: [] as StaffTaskRow[], error: "无法读取已分配任务" }
        : { data: (data ?? []) as StaffTaskRow[], error: null };
    } catch {
      return { data: [] as StaffTaskRow[], error: "无法读取已分配任务" };
    }
  }
  async recordExecution(
    vehicleGroupId: string,
    eventType:
      | "task_accepted"
      | "meeting_started"
      | "delay_reported"
      | "incident_reported"
      | "support_requested",
    detail: Record<string, unknown> = {},
  ) {
    if (!this.client) return false;
    try {
      const { error } = await this.client.rpc("record_staff_execution_event", {
        p_vehicle_group: vehicleGroupId,
        p_event_type: eventType,
        p_detail: detail,
        p_idempotency_key: crypto.randomUUID(),
      });
      return !error;
    } catch {
      return false;
    }
  }
  async loadMeeting(vehicleGroupId: string) {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .rpc("get_current_vehicle_group_meeting", {
          p_vehicle_group: vehicleGroupId,
        })
        .maybeSingle();
      return error ? null : (data as VehicleGroupMeetingRow | null);
    } catch {
      return null;
    }
  }
  async updateMeeting(input: {
    vehicleGroupId: string;
    meetingAt: string;
    meetingName: string;
    meetingAddress: string;
    latitude: number;
    longitude: number;
    landmarkDescription: string;
    reason: string;
  }) {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client.rpc(
        "update_vehicle_group_meeting",
        {
          p_vehicle_group: input.vehicleGroupId,
          p_meeting_at: input.meetingAt,
          p_meeting_name: input.meetingName,
          p_meeting_address: input.meetingAddress,
          p_latitude: input.latitude,
          p_longitude: input.longitude,
          p_landmark_description: input.landmarkDescription,
          p_reason: input.reason,
          p_idempotency_key: crypto.randomUUID(),
        },
      );
      return error ? null : Number(data);
    } catch {
      return null;
    }
  }
  async reportDelay(
    vehicleGroupId: string,
    delayMinutes: number,
    reason: string,
  ) {
    if (!this.client) return false;
    try {
      const { data, error } = await this.client.rpc(
        "report_vehicle_group_delay",
        {
          p_vehicle_group: vehicleGroupId,
          p_delay_minutes: delayMinutes,
          p_reason: reason,
          p_idempotency_key: crypto.randomUUID(),
        },
      );
      return !error && Boolean(data);
    } catch {
      return false;
    }
  }
  async advanceJourney(vehicleGroupId:string,action:'stop_arrived'|'trip_completed',stopName:string,reason:string){
    if(!this.client)return null;
    try{const {data,error}=await this.client.rpc('advance_vehicle_group_journey',{p_vehicle_group:vehicleGroupId,p_action:action,p_stop_name:stopName,p_reason:reason,p_idempotency_key:crypto.randomUUID()});return error?null:data?.[0]??null}catch{return null}
  }
  async advanceToItineraryStop(vehicleGroupId:string,stopId:string,reason:string){if(!this.client)return null;try{const {data,error}=await this.client.rpc('advance_vehicle_group_to_itinerary_stop',{p_vehicle_group:vehicleGroupId,p_stop_id:stopId,p_reason:reason,p_idempotency_key:crypto.randomUUID()});return error?null:data?.[0]??null}catch{return null}}
  async startFreeTime(vehicleGroupId:string,stopName:string,minutes:number){if(!this.client)return false;try{const {data,error}=await this.client.rpc('start_vehicle_group_free_time',{p_vehicle_group:vehicleGroupId,p_stop_name:stopName,p_minutes:minutes,p_idempotency_key:crypto.randomUUID()});return !error&&data===true}catch{return false}}
  async publishLocation(vehicleGroupId:string,sessionId:string,latitude:number,longitude:number,accuracy:number|null,recordedAt=new Date().toISOString(),sequence=1){
    if(!this.client)return false;const {error}=await this.client.rpc('append_driver_location_point',{p_vehicle_group:vehicleGroupId,p_session:sessionId,p_latitude:latitude,p_longitude:longitude,p_accuracy_meters:accuracy,p_sampled_at:recordedAt,p_sequence:sequence});return !error;
  }
  async startLocation(vehicleGroupId:string){if(!this.client)return null;const {data,error}=await this.client.rpc('start_driver_location_session_v2',{p_vehicle_group:vehicleGroupId,p_minutes:30});if(error||!data||typeof data!=='object')return null;const row=data as {sessionId?:unknown;expiresAt?:unknown};return typeof row.sessionId==='string'&&typeof row.expiresAt==='string'?{sessionId:row.sessionId,expiresAt:row.expiresAt}:null}
  async stopLocation(vehicleGroupId:string){if(!this.client)return false;const {error}=await this.client.rpc('stop_driver_location',{p_vehicle_group:vehicleGroupId});return !error}
}
export class SupabaseTripRoomRepository {
  constructor(private readonly client: SupabaseClient | null) {}
  get available() {
    return this.client !== null;
  }
  async loadAccessibleRoom() {
    if (!this.client) return { data: null, error: "行程房间服务未配置" };
    const { data, error } = await this.client
      .rpc("get_accessible_trip_room")
      .maybeSingle();
    return error
      ? { data: null, error: "无法读取本车行程房间" }
      : { data, error: null };
  }
  async loadCurrentMeeting(vehicleGroupId: string) {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .rpc("get_current_vehicle_group_meeting", {
          p_vehicle_group: vehicleGroupId,
        })
        .maybeSingle();
      return error ? null : (data as VehicleGroupMeetingRow | null);
    } catch {
      return null;
    }
  }
  async loadPassengerContext(vehicleGroupId:string){if(!this.client)return null;try{const {data,error}=await this.client.rpc('get_passenger_trip_context_v2',{p_vehicle_group:vehicleGroupId}).maybeSingle();return error?null:data as PassengerTripContextRow|null}catch{return null}}
  async loadItinerary(vehicleGroupId:string){if(!this.client)return [] as VehicleGroupItineraryStopRow[];try{const {data,error}=await this.client.rpc('get_vehicle_group_itinerary',{p_vehicle_group:vehicleGroupId});return error||!Array.isArray(data)?[]:data as VehicleGroupItineraryStopRow[]}catch{return []}}
  async acknowledgeMeeting(vehicleGroupId: string, revision: number) {
    if (!this.client) return false;
    try {
      const { data, error } = await this.client.rpc(
        "acknowledge_vehicle_group_meeting",
        { p_vehicle_group: vehicleGroupId, p_revision: revision },
      );
      return !error && data === true;
    } catch {
      return false;
    }
  }
  async startOwnLocationShare(vehicleGroupId: string, minutes: 15 | 30) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("start_own_location_share", {
      p_vehicle_group: vehicleGroupId,
      p_minutes: minutes,
    });
    return !error;
  }
  async stopOwnLocationShare(vehicleGroupId: string) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("stop_own_location_share", {
      p_vehicle_group: vehicleGroupId,
    });
    return !error;
  }
  async publishDriverLocation(
    vehicleGroupId: string,
    coordinates: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
    },
    minutes = 15,
  ) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("publish_driver_location", {
      p_vehicle_group: vehicleGroupId,
      p_latitude: coordinates.latitude,
      p_longitude: coordinates.longitude,
      p_accuracy_meters: coordinates.accuracy,
      p_minutes: minutes,
    });
    return !error;
  }
  async stopDriverLocation(vehicleGroupId: string) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("stop_driver_location", {
      p_vehicle_group: vehicleGroupId,
    });
    return !error;
  }
  async loadDriverLocation(vehicleGroupId: string) {
    if (!this.client) return null;
    const { data, error } = await this.client
      .rpc("get_active_driver_location", { p_vehicle_group: vehicleGroupId })
      .maybeSingle();
    return error ? null : data;
  }
  async loadMessages(roomId: string) {
    if (!this.client) return [];
    const { data, error } = await this.client.rpc('get_trip_room_messages_for_member',{p_room:roomId});
    return error ? [] : (data ?? []);
  }
  async sendMessage(
    roomId: string,
    content: string,
    idempotencyKey: string = crypto.randomUUID(),
  ) {
    if (!this.client || !content.trim()) return false;
    const { error } = await this.client.rpc("send_trip_room_message", {
      p_room: roomId,
      p_content: content.trim(),
      p_idempotency_key: idempotencyKey,
    });
    return !error;
  }
  async loadTranslationPreference() {
    if (!this.client) return null;
    const { data, error } = await this.client
      .from("chat_translation_preferences")
      .select("target_language,auto_translate,follow_device_language")
      .maybeSingle();
    return error ? null : data;
  }
  async saveTranslationPreference(
    targetLanguage: "zh-CN" | "zh-TW" | "ja" | "en" | "vi" | "ne" | "ko",
    autoTranslate: boolean,
    followDeviceLanguage: boolean,
  ) {
    if (!this.client) return false;
    const { error } = await this.client.rpc(
      "update_own_chat_translation_preference",
      {
        p_target_language: targetLanguage,
        p_auto_translate: autoTranslate,
        p_follow_device_language: followDeviceLanguage,
      },
    );
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
  async loadBoardingStatus(vehicleGroupId: string) {
    if (!this.client) return [];
    const { data, error } = await this.client.rpc(
      "get_vehicle_group_boarding_status",
      { p_vehicle_group: vehicleGroupId },
    );
    return error ? [] : (data ?? []);
  }
  async sendStaffTemplate(roomId: string, templateKey: string) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("send_staff_trip_room_template", {
      p_room: roomId,
      p_template_key: templateKey,
    });
    return !error;
  }
  async markOrderBoarded(vehicleGroupId: string, orderId: string) {
    if (!this.client) return false;
    const { error } = await this.client.rpc(
      "mark_vehicle_group_order_boarded",
      { p_vehicle_group: vehicleGroupId, p_order: orderId },
    );
    return !error;
  }
  async loadAttendance(vehicleGroupId: string) {
    if (!this.client) return [];
    const { data, error } = await this.client.rpc(
      "get_vehicle_group_attendance",
      { p_vehicle_group: vehicleGroupId },
    );
    return error ? [] : (data ?? []);
  }
  async loadAttendanceSummary(vehicleGroupId: string) {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .rpc("get_vehicle_group_attendance_summary", {
          p_vehicle_group: vehicleGroupId,
        })
        .maybeSingle();
      return error ? null : data;
    } catch {
      return null;
    }
  }
  async setOwnCheckin(
    passengerId: string,
    status: "confirmed_departure" | "at_meeting_point" | "needs_assistance",
  ) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("set_own_passenger_checkin", {
      p_passenger: passengerId,
      p_status: status,
      p_idempotency_key: crypto.randomUUID(),
    });
    return !error;
  }
  async reportOwnLate(passengerId: string, minutes: 5 | 10 | 15) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("report_own_late_arrival", {
      p_passenger: passengerId,
      p_minutes: minutes,
      p_idempotency_key: crypto.randomUUID(),
    });
    return !error;
  }
  async setStaffCheckin(
    vehicleGroupId: string,
    passengerId: string,
    status:
      | "at_meeting_point"
      | "boarded"
      | "needs_assistance"
      | "contacting"
      | "unreachable",
  ) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("set_staff_passenger_checkin", {
      p_vehicle_group: vehicleGroupId,
      p_passenger: passengerId,
      p_status: status,
      p_idempotency_key: crypto.randomUUID(),
    });
    return !error;
  }
  async recordContact(
    vehicleGroupId: string,
    passengerId: string,
    action:
      | "contact_requested"
      | "contacting"
      | "reached"
      | "unreachable"
      | "escalated_to_operations"
      | "resolved",
  ) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("record_passenger_contact_action", {
      p_vehicle_group: vehicleGroupId,
      p_passenger: passengerId,
      p_action: action,
      p_idempotency_key: crypto.randomUUID(),
      p_note: null,
    });
    return !error;
  }
  async loadStaffPassengerContact(vehicleGroupId: string, passengerId: string) {
    if (!this.client) return null;
    const { data, error } = await this.client.rpc(
      "get_staff_passenger_contact",
      { p_vehicle_group: vehicleGroupId, p_passenger: passengerId },
    );
    if (error || !data?.[0]) return null;
    return data[0] as { contact_name: string; phone: string };
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
