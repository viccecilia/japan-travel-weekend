import type { SupabaseClient } from "@supabase/supabase-js";

export type OperationsVehicleType = {
  type_key: string;
  label: string;
  sellable_capacity: number;
  cost_units: number;
  active: boolean;
};
export type OperationsVehicle = {
  id: string;
  registration_identifier: string;
  vehicle_type_key: string;
  external_dispatch_id: string | null;
  status: "available" | "assigned" | "in_service" | "maintenance" | "inactive";
  public_color?:string|null;public_photo_url?:string|null;
  model_name?:string|null;inspection_required?:boolean;operations_note?:string;
};
export type OperationsDriver = {
  id: string;
  account_id?: string | null;
  display_name: string;
  external_dispatch_id: string | null;
  languages: string[];
  status: "available" | "unavailable" | "suspended";
  service_role?:"driver"|"guide"|"driver_guide";public_phone?:string|null;
  employee_code?:string|null;employment_base?:string|null;private_phone?:string|null;operations_note?:string;
  driver_vehicle_qualifications: { vehicle_type_key: string }[];
  driver_availability_windows: { starts_at: string; ends_at: string }[];
};
export type OperationsDeparture = {
  id: string;
  tripTitle: string;
  departsAt: string | null;
  capacity: number;
  status: string;
  meetingName: string | null;
  orderCount: number;
  bookedSeats: number;
  paidSeats: number;
  pendingOrders: number;
  grossAmountJpy: number;
  loadFactor: number;
  bookingClosesAt: string | null;
  chatOpensAt: string | null;
  dispatchPlanningStatus: "collecting" | "ready_for_planning" | "needs_manual_review" | "planned" | "confirmed";
  requiresManualReview: boolean;
};
export type OperationsDispatchTask = {
  id: string;
  status: string;
  externalTaskId: string | null;
  lastError: string | null;
  createdAt: string;
  driverId: string;
  fleetVehicleId: string | null;
  payload: Record<string, unknown>;
  departureId: string | null;
  departureTitle: string | null;
  departsAt: string | null;
  vehicleSequence: number | null;
};
export type OperationsBookingDraft = {
  draftId: string;
  tripTitle: string;
  departsAt: string;
  seatImpact: number;
  adults: number;
  children: number;
  infants: number;
  assistanceSummary: Record<string, unknown>;
  operationalReviewStatus: string;
  draftStatus: string;
  createdAt: string;
};
export type OperationsFulfilmentWorkItem = {
  id: string;
  orderId: string;
  departureId: string;
  kind: "paid_order_ready" | "payment_review" | "manual_payment_review";
  status: "pending" | "assigned" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
};
export type OperationsNotificationDeliveryIssue = {
  id: string;
  eventType: string;
  orderId: string | null;
  status: "failed" | "submitted";
  attempts: number;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};
export type OperationsAccountDeletionRequest={id:string;status:"requested"|"deferred_active_booking"|"reviewing";requestedAt:string;updatedAt:string};
export type OperationsCancellationRequest={id:string;orderId:string;status:string;reasonCode:string;refundPercent:number;estimatedRefundAmount:number;requestedAt:string;updatedAt:string};
export type OperationsStaffApplication={id:string;accountId:string;email:string;applicantName:string;requestedRole:"driver"|"guide";status:string;reviewNote:string;createdAt:string;updatedAt:string};
export type OperationsStaffLeave={id:string;accountId:string;email:string;displayName:string;startsAt:string;endsAt:string;reason:string;status:"pending"|"approved"|"rejected"|"cancelled";reviewNote:string;reviewedAt:string|null;createdAt:string;conflictingTasks:number};
export type OperationsReferralCouponCounts={total:number;pending:number;active:number;reserved:number;redeemed:number;void:number;frozen:number;expired:number};
export type OperationsReferralRelation={id:string;created_at:string;referral_code:string;discount_percent:number;inviter_name:string;inviter_email:string;invitee_name:string;invitee_email:string;qualifying_order_id:string|null;order_status:string|null;order_amount_jpy:number|null;order_discount_jpy:number|null;trip_title:string|null;departs_at:string|null;ends_at:string|null;inviter_coupon_id:string|null;inviter_coupon_status:string|null;available_at:string|null;invitee_coupon_id:string|null;invitee_coupon_status:string|null};
export type OperationsReferralAlert={severity:'critical'|'high'|'medium';kind:string;reference_id:string;message:string;created_at:string};
export type OperationsReferralSummary={active:boolean;discountPercent:number;validityDays:number;successfulInvites:number;paidInvitees:number;qualifiedInvites:number;couponCounts:OperationsReferralCouponCounts;discountAmountJpy:number;integrity:{relationships:number;expectedCoupons:number;actualCoupons:number;missingPairs:number;orphanCoupons:number};alerts:OperationsReferralAlert[];relations:OperationsReferralRelation[];unavailableSignals:string[]};
export type OperationsProduct={id:string;slug:string;status:'draft'|'published'|'archived';catalogVersion:number;publishedRevision:number|null;draftRevision:number|null;title:string;content:Record<string,unknown>;heroImageUrl:string|null;gallery:string[];updatedAt:string};
export type OperationsProductRevision={revisionNumber:number;state:string;title:string;createdAt:string;publishedAt:string|null};
export type OperationsRunRow={departureId:string;tripTitle:string;departsAt:string;departureStatus:string;vehicleGroupId:string|null;vehicleLabel:string|null;driverName:string|null;capacity:number|null;bookedSeats:number;arrived:number;boarded:number;journeyStatus:string;currentStop:string|null;openIncidents:number;lastEventAt:string|null};
export type OperationsMerchandising={tripId:string;slug:string;title:string;featuredRank:number|null;campaignKey:string|null;visibleFrom:string|null;visibleUntil:string|null;travelFrom:string|null;travelUntil:string|null;localeReadiness:Record<string,boolean>;version:number};
export type OperationsEditableDeparture={id:string;tripTitle:string;departsAt:string;endsAt:string;price:number;capacity:number;salesOpenAt:string;salesCloseAt:string;status:string;version:number;committedSeats:number;meetingName:string;meetingAddress:string;mapLat:number;mapLng:number;paidOrders:number};
export type OperationsDriverStatistic={driverId:string;driverName:string;serviceRole:string;assignedRuns:number;completedRuns:number;soldPassengers:number;assignedPassengers:number;boardedPassengers:number;completedPassengers:number;availableSeats:number;loadFactor:number;openIncidents:number;lastLocationAt:string|null};
export type OperationsCommissionPayout={id:string;accountId:string;displayName:string;amountJpy:number;weekStart:string;status:string;requestedAt:string;providerReference:string|null};
export type DispatchPlanDraft = {
  sequence: number;
  vehicleType: string;
  capacity: number;
  passengerCount: number;
  driverId: string;
  fleetVehicleId: string;
  startsAt: string;
  endsAt: string;
  operationalNotes: string[];
  planningSource?: "automatic" | "manual_override";
};
export type OperationsSnapshot = {
  vehicleTypes: OperationsVehicleType[];
  vehicles: OperationsVehicle[];
  drivers: OperationsDriver[];
  departures: OperationsDeparture[];
  bookingDrafts: OperationsBookingDraft[];
  fulfilmentWorkItems: OperationsFulfilmentWorkItem[];
  notificationDeliveryIssues: OperationsNotificationDeliveryIssue[];
  accountDeletionRequests?: OperationsAccountDeletionRequest[];
  cancellationRequests?: OperationsCancellationRequest[];
  staffApplications?:OperationsStaffApplication[];
  staffLeaveRequests?:OperationsStaffLeave[];
  dispatchTasks: OperationsDispatchTask[];
  dispatchDrafts: number;
  loadedAt: string;
};
type DepartureRow = {
  id: string;
  departs_at: string | null;
  capacity: number;
  status: string;
  meeting_name: string | null;
  trips: { title: string } | { title: string }[] | null;
  orders:
    | {
        id: string;
        seat_count: number;
        status: string;
        amount: number | null;
        currency: string;
      }[]
    | null;
};
type OperationsDepartureRow = {
  id: string;
  trip_title: string;
  departs_at: string | null;
  capacity: number;
  status: string;
  meeting_name: string | null;
  order_count: number;
  booked_seats: number;
  pending_orders: number;
  gross_amount_jpy: number;
  booking_closes_at: string | null;
  chat_opens_at: string | null;
  dispatch_planning_status: OperationsDeparture["dispatchPlanningStatus"];
  requires_manual_review: boolean;
};
export const summarizeDeparture = (row: DepartureRow): OperationsDeparture => {
  const orders = row.orders ?? [];
  const committed = orders.filter(
    (order) => order.status === "paid" || order.status === "confirmed",
  );
  const bookedSeats = committed.reduce(
    (sum, order) => sum + order.seat_count,
    0,
  );
  return {
    id: row.id,
    tripTitle: Array.isArray(row.trips)
      ? (row.trips[0]?.title ?? "未命名路线")
      : (row.trips?.title ?? "未命名路线"),
    departsAt: row.departs_at,
    capacity: row.capacity,
    status: row.status,
    meetingName: row.meeting_name,
    orderCount: orders.length,
    bookedSeats,
    paidSeats: bookedSeats,
    pendingOrders: orders.filter((order) => order.status === "pending_payment")
      .length,
    grossAmountJpy: committed.reduce(
      (sum, order) =>
        sum + (order.currency === "JPY" ? (order.amount ?? 0) : 0),
      0,
    ),
    loadFactor:
      row.capacity > 0
        ? Math.round((bookedSeats / row.capacity) * 1000) / 10
        : 0,
    bookingClosesAt: null,
    chatOpensAt: null,
    dispatchPlanningStatus: "collecting",
    requiresManualReview: false,
  };
};

export class SupabaseOperationsRepository {
  constructor(private readonly client: SupabaseClient | null) {}
  get available() {
    return this.client !== null;
  }
  async listProducts(){if(!this.client)return {data:[] as OperationsProduct[],error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('get_operations_products');if(error)return {data:[] as OperationsProduct[],error:error.message};return {data:((data??[]) as Array<Record<string,unknown>>).map(row=>({id:String(row.id),slug:String(row.slug),status:String(row.status) as OperationsProduct['status'],catalogVersion:Number(row.catalog_version),publishedRevision:row.published_revision==null?null:Number(row.published_revision),draftRevision:row.draft_revision==null?null:Number(row.draft_revision),title:String(row.title),content:(row.content??{}) as Record<string,unknown>,heroImageUrl:row.hero_image_url==null?null:String(row.hero_image_url),gallery:Array.isArray(row.gallery)?row.gallery.filter((item):item is string=>typeof item==='string'):[],updatedAt:String(row.updated_at)})),error:null}}
  async saveProductDraft(input:{id:string;expectedVersion:number;title:string;content:Record<string,unknown>;heroImageUrl:string|null;gallery:string[]|null}){if(!this.client)return {ok:false,error:'运营数据服务未配置'};const {error}=await this.client.rpc('operations_save_product_draft',{p_trip:input.id,p_expected_catalog_version:input.expectedVersion,p_title:input.title,p_content:input.content,p_hero_image_url:input.heroImageUrl,p_gallery:input.gallery});return {ok:!error,error:error?.message??null}}
  async publishProduct(id:string,expectedVersion:number){if(!this.client)return {ok:false,error:'运营数据服务未配置'};const {error}=await this.client.rpc('operations_publish_product',{p_trip:id,p_expected_catalog_version:expectedVersion});return {ok:!error,error:error?.message??null}}
  async createProduct(input:{slug:string;title:string}){if(!this.client)return {ok:false,id:null as string|null,error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('operations_create_product',{p_slug:input.slug,p_title:input.title,p_content:{summary:'',description:'',itinerary:[],included:[],excluded:[],locales:{}},p_hero_image_url:null,p_gallery:[]});return {ok:!error,id:error?null:String(data),error:error?.message??null}}
  async copyProduct(input:{sourceId:string;slug:string;title:string}){if(!this.client)return {ok:false,error:'运营数据服务未配置'};const {error}=await this.client.rpc('operations_copy_product',{p_source:input.sourceId,p_slug:input.slug,p_title:input.title});return {ok:!error,error:error?.message??null}}
  async setProductStatus(input:{id:string;expectedVersion:number;action:'archive'|'restore';restoreRevision?:number}){if(!this.client)return {ok:false,error:'运营数据服务未配置'};const {error}=await this.client.rpc('operations_set_product_status',{p_trip:input.id,p_expected_catalog_version:input.expectedVersion,p_action:input.action,p_restore_revision:input.restoreRevision??null});return {ok:!error,error:error?.message??null}}
  async listProductRevisions(id:string){if(!this.client)return {data:[] as OperationsProductRevision[],error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('get_operations_product_revisions',{p_trip:id});return {data:((data??[]) as Array<Record<string,unknown>>).map(row=>({revisionNumber:Number(row.revision_number),state:String(row.state),title:String(row.title),createdAt:String(row.created_at),publishedAt:row.published_at?String(row.published_at):null})),error:error?.message??null}}
  async uploadProductImage(productId: string, file: File) {
    if (!this.client) return { url: null as string | null, error: "运营数据服务未配置" };
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) return { url: null, error: "仅支持不超过10MB的 JPG、PNG 或 WebP" };
    const extension = file.name.split(".").pop()?.toLowerCase() || "webp";
    const path = `${productId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await this.client.storage.from("route-media").upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { url: null, error: error.message };
    return { url: this.client.storage.from("route-media").getPublicUrl(path).data.publicUrl, error: null };
  }
  async listCommissionPayouts(){if(!this.client)return {data:[] as OperationsCommissionPayout[],error:'运营数据服务未配置'};const {data,error}=await this.client.from('commission_payout_requests').select('id,account_id,amount_jpy,week_start,status,requested_at,provider_reference,profiles!commission_payout_requests_account_id_fkey(display_name)').order('requested_at',{ascending:false}).limit(200);return {data:((data??[]) as Array<Record<string,unknown>>).map(row=>{const profile=Array.isArray(row.profiles)?row.profiles[0]:row.profiles as Record<string,unknown>|null;return{id:String(row.id),accountId:String(row.account_id),displayName:String(profile?.display_name??'未命名账户'),amountJpy:Number(row.amount_jpy),weekStart:String(row.week_start),status:String(row.status),requestedAt:String(row.requested_at),providerReference:row.provider_reference?String(row.provider_reference):null}}),error:error?.message??null}}
  async reviewCommissionPayout(input:{id:string;action:'approve'|'mark_processing'|'mark_paid'|'fail'|'retry'|'cancel';note:string;providerReference?:string}){return this.transition('operations_review_commission_payout',{p_request:input.id,p_action:input.action,p_note:input.note,p_provider_reference:input.providerReference??null})}
  async updateDriverResource(input:{id:string;displayName:string;status:string;serviceRole:string;publicPhone:string;internalPhone:string;operationsNote:string}){return this.transition('operations_update_driver_resource',{p_driver:input.id,p_display_name:input.displayName,p_status:input.status,p_service_role:input.serviceRole,p_public_phone:input.publicPhone,p_internal_phone:input.internalPhone,p_operations_note:input.operationsNote})}
  async updateFleetVehicle(input:{id:string;status:string;color:string;photoUrl:string;modelName:string;inspectionRequired:boolean;operationsNote:string}){return this.transition('operations_update_fleet_vehicle',{p_vehicle:input.id,p_status:input.status,p_color:input.color,p_photo_url:input.photoUrl,p_model_name:input.modelName,p_inspection_required:input.inspectionRequired,p_operations_note:input.operationsNote})}
  async previewDepartureBatch(input:{tripId:string;start:string;end:string;weekdays:number[];departureTime:string;durationMinutes:number;price:number;capacity:number;salesOpen:string;closeHours:number;meetingName:string;meetingAddress:string;mapLat:number;mapLng:number}){if(!this.client)return {data:[] as Array<Record<string,unknown>>,error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('operations_preview_departure_batch',{p_trip:input.tripId,p_start:input.start,p_end:input.end,p_weekdays:input.weekdays,p_departure_time:input.departureTime,p_duration_minutes:input.durationMinutes,p_price:input.price,p_capacity:input.capacity,p_sales_open:input.salesOpen,p_close_hours:input.closeHours,p_meeting_name:input.meetingName,p_meeting_address:input.meetingAddress,p_map_lat:input.mapLat,p_map_lng:input.mapLng});return {data:Array.isArray(data)?data as Array<Record<string,unknown>>:[],error:error?.message??null}}
  async createDepartureBatch(input:{operationId:string;tripId:string;start:string;end:string;weekdays:number[];departureTime:string;durationMinutes:number;price:number;capacity:number;salesOpen:string;closeHours:number;meetingName:string;meetingAddress:string;mapLat:number;mapLng:number}){if(!this.client)return {data:null,error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('operations_create_departure_batch',{p_operation:input.operationId,p_trip:input.tripId,p_start:input.start,p_end:input.end,p_weekdays:input.weekdays,p_departure_time:input.departureTime,p_duration_minutes:input.durationMinutes,p_price:input.price,p_capacity:input.capacity,p_sales_open:input.salesOpen,p_close_hours:input.closeHours,p_meeting_name:input.meetingName,p_meeting_address:input.meetingAddress,p_map_lat:input.mapLat,p_map_lng:input.mapLng});return {data:data as Record<string,unknown>|null,error:error?.message??null}}
  async listEditableDepartures(){if(!this.client)return {data:[] as OperationsEditableDeparture[],error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('get_operations_editable_departures');return {data:((data??[]) as Array<Record<string,unknown>>).map(row=>({id:String(row.id),tripTitle:String(row.trip_title),departsAt:String(row.departs_at),endsAt:String(row.ends_at),price:Number(row.seat_price_jpy),capacity:Number(row.capacity),salesOpenAt:String(row.sales_open_at),salesCloseAt:String(row.sales_close_at),status:String(row.status),version:Number(row.schedule_version),committedSeats:Number(row.committed_seats??0),meetingName:String(row.meeting_name??''),meetingAddress:String(row.meeting_address??''),mapLat:Number(row.map_lat),mapLng:Number(row.map_lng),paidOrders:Number(row.paid_orders??0)})),error:error?.message??null}}
  async updateDeparture(input:{id:string;expectedVersion:number;departsAt:string;endsAt:string;price:number;capacity:number;salesOpenAt:string;salesCloseAt:string;status:string;meetingName:string;meetingAddress:string;mapLat:number;mapLng:number}){if(!this.client)return {ok:false,data:null as Record<string,unknown>|null,error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('operations_update_departure_v2',{p_departure:input.id,p_expected_version:input.expectedVersion,p_departs_at:input.departsAt,p_ends_at:input.endsAt,p_price:input.price,p_capacity:input.capacity,p_sales_open:input.salesOpenAt,p_sales_close:input.salesCloseAt,p_status:input.status,p_meeting_name:input.meetingName,p_meeting_address:input.meetingAddress,p_map_lat:input.mapLat,p_map_lng:input.mapLng});return {ok:!error,data:data as Record<string,unknown>|null,error:error?.message??null}}
  async cancelDeparture(id:string,expectedVersion:number,reason:string){if(!this.client)return {ok:false,data:null as Record<string,unknown>|null,error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('operations_cancel_departure',{p_departure:id,p_expected_version:expectedVersion,p_reason:reason});return {ok:!error,data:data as Record<string,unknown>|null,error:error?.message??null}}
  async loadDriverStatistics(from:string,to:string){if(!this.client)return {data:[] as OperationsDriverStatistic[],error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('get_operations_driver_transport_statistics',{p_from:from,p_to:to});return {data:((data??[]) as Array<Record<string,unknown>>).map(row=>({driverId:String(row.driver_id),driverName:String(row.driver_name),serviceRole:String(row.service_role??'driver'),assignedRuns:Number(row.assigned_runs??0),completedRuns:Number(row.completed_runs??0),soldPassengers:Number(row.sold_passengers??0),assignedPassengers:Number(row.assigned_passengers??0),boardedPassengers:Number(row.boarded_passengers??0),completedPassengers:Number(row.completed_passengers??0),availableSeats:Number(row.available_seats??0),loadFactor:Number(row.load_factor??0),openIncidents:Number(row.open_incidents??0),lastLocationAt:row.last_location_at?String(row.last_location_at):null})),error:error?.message??null}}
  async loadRunBoard(serviceDate:string){if(!this.client)return {data:[] as OperationsRunRow[],error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('get_operations_daily_run_board',{p_service_date:serviceDate});return {data:((data??[]) as Array<Record<string,unknown>>).map(row=>({departureId:String(row.departure_id),tripTitle:String(row.trip_title),departsAt:String(row.departs_at),departureStatus:String(row.departure_status),vehicleGroupId:row.vehicle_group_id?String(row.vehicle_group_id):null,vehicleLabel:row.vehicle_label?String(row.vehicle_label):null,driverName:row.driver_name?String(row.driver_name):null,capacity:row.capacity==null?null:Number(row.capacity),bookedSeats:Number(row.booked_seats??0),arrived:Number(row.arrived??0),boarded:Number(row.boarded??0),journeyStatus:String(row.journey_status??'preparing'),currentStop:row.current_stop?String(row.current_stop):null,openIncidents:Number(row.open_incidents??0),lastEventAt:row.last_event_at?String(row.last_event_at):null})),error:error?.message??null}}
  async listMerchandising(){if(!this.client)return {data:[] as OperationsMerchandising[],error:'运营数据服务未配置'};const {data,error}=await this.client.rpc('get_operations_merchandising');return {data:((data??[]) as Array<Record<string,unknown>>).map(row=>({tripId:String(row.trip_id),slug:String(row.slug),title:String(row.title),featuredRank:row.featured_rank==null?null:Number(row.featured_rank),campaignKey:row.campaign_key?String(row.campaign_key):null,visibleFrom:row.visible_from?String(row.visible_from):null,visibleUntil:row.visible_until?String(row.visible_until):null,travelFrom:row.travel_from?String(row.travel_from):null,travelUntil:row.travel_until?String(row.travel_until):null,localeReadiness:(row.locale_readiness??{}) as Record<string,boolean>,version:Number(row.version??1)})),error:error?.message??null}}
  async loadLinkCampaignReview(){if(!this.client)return {campaigns:[] as Array<Record<string,unknown>>,submissions:[] as Array<Record<string,unknown>>,error:'运营数据服务未配置'};const [campaigns,submissions]=await Promise.all([this.client.from('link_campaigns').select('id,campaign_month,status,scoring_rules,official_handles,opens_at,closes_at').order('campaign_month',{ascending:false}),this.client.from('link_campaign_submissions').select('id,campaign_id,platform,post_url,platform_account,status,created_at').order('created_at',{ascending:false}).limit(100)]);return {campaigns:(campaigns.data??[]) as Array<Record<string,unknown>>,submissions:(submissions.data??[]) as Array<Record<string,unknown>>,error:(campaigns.error??submissions.error)?.message??null}}
  async loadSnapshot(): Promise<{
    data: OperationsSnapshot | null;
    error: string | null;
  }> {
    if (!this.client) return { data: null, error: "运营数据服务未配置" };
    try {
      const [types, vehicles, drivers, departures, drafts, workItems, notificationIssues, deletionRequests, cancellationRequests, staffApplications, staffLeaveRequests, tasks] =
        await Promise.all([
          this.client
            .from("vehicle_type_configs")
            .select("type_key,label,sellable_capacity,cost_units,active")
            .eq("active", true)
            .order("sellable_capacity"),
          this.client
            .from("fleet_vehicles")
            .select(
              "id,registration_identifier,vehicle_type_key,external_dispatch_id,status,public_color,public_photo_url,model_name,inspection_required,operations_note",
            )
            .order("registration_identifier"),
          this.client
            .from("driver_resources")
            .select(
              "id,account_id,display_name,external_dispatch_id,languages,status,service_role,public_phone,employee_code,employment_base,private_phone,operations_note,driver_vehicle_qualifications(vehicle_type_key),driver_availability_windows(starts_at,ends_at)",
            )
            .order("display_name"),
          this.client.rpc("get_operations_dashboard_departures"),
          this.client.rpc("get_operations_booking_drafts"),
          this.client
            .from("fulfilment_work_items")
            .select(
              "id,order_id,departure_id,kind,status,created_at,updated_at",
            )
            .in("status", ["pending", "assigned"])
            .order("created_at", { ascending: true })
            .limit(100),
          this.client.rpc("get_operations_notification_delivery_queue"),
          this.client.from("account_deletion_requests").select("id,status,requested_at,updated_at").in("status",["requested","deferred_active_booking","reviewing"]).order("requested_at",{ascending:true}).limit(100),
          this.client.from('order_cancellation_requests').select('id,order_id,status,reason_code,refund_percent,estimated_refund_amount,requested_at,updated_at').in('status',['requested','reviewing','refund_prepared','refund_processing','manual_refund_required','provider_result_unknown']).order('requested_at',{ascending:true}).limit(100),
          this.client.rpc('get_operations_staff_applications'),
          this.client.rpc('get_operations_staff_leave_requests'),
          this.client
            .from("dispatch_tasks")
            .select(
              "id,status,external_task_id,last_error,created_at,driver_id,fleet_vehicle_id,payload,vehicle_assignments(departure_id,sequence,departures(departs_at,trips(title)))",
            )
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
      if (
        types.error ||
        vehicles.error ||
        drivers.error ||
        departures.error ||
        drafts.error ||
        workItems.error ||
        notificationIssues.error ||
        deletionRequests.error ||
        cancellationRequests.error ||
        staffApplications.error ||
        staffLeaveRequests.error ||
        tasks.error
      )
        return {
          data: null,
          error: "运营数据读取失败，请确认履约队列与运营迁移已执行",
        };
      const dispatchTasks = (
        (tasks.data ?? []) as {
          id: string;
          status: string;
          external_task_id: string | null;
          last_error: string | null;
          created_at: string;
          driver_id: string;
          fleet_vehicle_id: string | null;
          payload: Record<string, unknown>;
          vehicle_assignments: Array<{departure_id:string;sequence:number;departures:Array<{departs_at:string|null;trips:Array<{title:string}>|null}>|null}>|null;
        }[]
      ).map((task) => {
        const assignment=task.vehicle_assignments?.[0];
        const departure=assignment?.departures?.[0];
        const trip=departure?.trips?.[0];
        return ({
        id: task.id,
        status: task.status,
        externalTaskId: task.external_task_id,
        lastError: task.last_error,
        createdAt: task.created_at,
        driverId: task.driver_id,
        fleetVehicleId: task.fleet_vehicle_id,
        payload: task.payload ?? {},
        departureId:assignment?.departure_id??null,
        departureTitle:trip?.title??null,
        departsAt:departure?.departs_at??null,
        vehicleSequence:assignment?.sequence??null,
      });});
      const bookingDrafts = (
        (drafts.data ?? []) as {
          draft_id: string;
          trip_title: string;
          departs_at: string;
          seat_impact: number;
          adults: number;
          children: number;
          infants: number;
          assistance_summary: Record<string, unknown>;
          operational_review_status: string;
          draft_status: string;
          created_at: string;
        }[]
      ).map((row) => ({
        draftId: row.draft_id,
        tripTitle: row.trip_title,
        departsAt: row.departs_at,
        seatImpact: Number(row.seat_impact),
        adults: Number(row.adults),
        children: Number(row.children),
        infants: Number(row.infants),
        assistanceSummary: row.assistance_summary ?? {},
        operationalReviewStatus: row.operational_review_status,
        draftStatus: row.draft_status,
        createdAt: row.created_at,
      }));
      const fulfilmentWorkItems = (
        (workItems.data ?? []) as {
          id: string;
          order_id: string;
          departure_id: string;
          kind: "paid_order_ready" | "payment_review" | "manual_payment_review";
          status: "pending" | "assigned" | "completed" | "cancelled";
          created_at: string;
          updated_at: string;
        }[]
      ).map((row) => ({
        id: row.id,
        orderId: row.order_id,
        departureId: row.departure_id,
        kind: row.kind,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      const notificationDeliveryIssues = ((notificationIssues.data ?? []) as {
        id:string;event_type:string;order_id:string|null;status:"failed"|"submitted";attempts:number;last_error_code:string|null;created_at:string;updated_at:string;
      }[]).map(row=>({id:row.id,eventType:row.event_type,orderId:row.order_id,status:row.status,attempts:Number(row.attempts),lastErrorCode:row.last_error_code,createdAt:row.created_at,updatedAt:row.updated_at}));
      const accountDeletionRequests=((deletionRequests.data??[]) as Array<{id:string;status:"requested"|"deferred_active_booking"|"reviewing";requested_at:string;updated_at:string}>).map(row=>({id:row.id,status:row.status,requestedAt:row.requested_at,updatedAt:row.updated_at}));
      const cancellationQueue=((cancellationRequests.data??[]) as Array<{id:string;order_id:string;status:string;reason_code:string;refund_percent:number;estimated_refund_amount:number;requested_at:string;updated_at:string}>).map(row=>({id:row.id,orderId:row.order_id,status:row.status,reasonCode:row.reason_code,refundPercent:Number(row.refund_percent),estimatedRefundAmount:Number(row.estimated_refund_amount),requestedAt:row.requested_at,updatedAt:row.updated_at}));
      const staffApplicationQueue=((staffApplications.data??[]) as Array<{id:string;account_id:string;email:string;applicant_name:string;requested_role:"driver"|"guide";status:string;review_note:string;created_at:string;updated_at:string}>).map(row=>({id:row.id,accountId:row.account_id,email:row.email,applicantName:row.applicant_name,requestedRole:row.requested_role,status:row.status,reviewNote:row.review_note,createdAt:row.created_at,updatedAt:row.updated_at}));
      const staffLeaveQueue=((staffLeaveRequests.data??[]) as Array<{id:string;account_id:string;email:string;display_name:string;starts_at:string;ends_at:string;reason:string;status:"pending"|"approved"|"rejected"|"cancelled";review_note:string;reviewed_at:string|null;created_at:string;conflicting_tasks:number}>).map(row=>({id:row.id,accountId:row.account_id,email:row.email,displayName:row.display_name,startsAt:row.starts_at,endsAt:row.ends_at,reason:row.reason,status:row.status,reviewNote:row.review_note,reviewedAt:row.reviewed_at,createdAt:row.created_at,conflictingTasks:Number(row.conflicting_tasks)}));
      const operationDepartures = (
        (departures.data ?? []) as OperationsDepartureRow[]
      ).map((row) => ({
        id: row.id,
        tripTitle: row.trip_title,
        departsAt: row.departs_at,
        capacity: row.capacity,
        status: row.status,
        meetingName: row.meeting_name,
        orderCount: Number(row.order_count),
        bookedSeats: Number(row.booked_seats),
        paidSeats: Number(row.booked_seats),
        pendingOrders: Number(row.pending_orders),
        grossAmountJpy: Number(row.gross_amount_jpy),
        loadFactor:
          row.capacity > 0
            ? Math.round((Number(row.booked_seats) / row.capacity) * 1000) / 10
            : 0,
        bookingClosesAt: row.booking_closes_at,
        chatOpensAt: row.chat_opens_at,
        dispatchPlanningStatus: row.dispatch_planning_status,
        requiresManualReview: row.requires_manual_review,
      }));
      return {
        data: {
          vehicleTypes: (types.data ?? []) as OperationsVehicleType[],
          vehicles: (vehicles.data ?? []) as OperationsVehicle[],
          drivers: (drivers.data ?? []) as OperationsDriver[],
          departures: operationDepartures,
          bookingDrafts,
          fulfilmentWorkItems,
          notificationDeliveryIssues,
          accountDeletionRequests,
          cancellationRequests:cancellationQueue,
          staffApplications:staffApplicationQueue,
          staffLeaveRequests:staffLeaveQueue,
          dispatchTasks,
          dispatchDrafts: dispatchTasks.filter(
            (task) => task.status === "draft" || task.status === "confirmed",
          ).length,
          loadedAt: new Date().toISOString(),
        },
        error: null,
      };
    } catch {
      return { data: null, error: "运营数据读取失败" };
    }
  }
  async createVehicle(input: {
    registration: string;
    vehicleType: string;
    externalDispatchId: string;
    publicColor:string;publicPhotoUrl:string;
  }) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("operations_create_vehicle_v2", {
      p_registration: input.registration,
      p_vehicle_type: input.vehicleType,
      p_external_dispatch_id: input.externalDispatchId || null,
      p_public_color:input.publicColor,p_public_photo_url:input.publicPhotoUrl||null,
    });
    return !error;
  }
  async saveRouteCatalog(input: {
    slug: string;
    title?: string;
    summary?: string;
    walkingLevel?: string;
    mealNotes?: string;
    notices?: string[];
    heroImageUrl?: string;
    status?: "draft" | "published";
  }) {
    if (!this.client) return { ok: false, error: "运营数据服务未配置" };
    const {data:current,error:loadError}=await this.client.from('trips').select('catalog_version').eq('slug',input.slug).maybeSingle();
    if(loadError||!current)return {ok:false,error:loadError?.message??'路线不存在'};
    const content=Object.fromEntries(Object.entries({summary:input.summary,walkingLevel:input.walkingLevel,mealNotes:input.mealNotes,notices:input.notices}).filter(([,value])=>value!==undefined));
    const patch=Object.fromEntries(Object.entries({title:input.title,status:input.status,heroImageUrl:input.heroImageUrl,content:Object.keys(content).length?content:undefined}).filter(([,value])=>value!==undefined));
    if(!Object.keys(patch).length)return {ok:false,error:'没有可保存的修改'};
    const { error } = await this.client.rpc("operations_patch_route_catalog", {p_slug:input.slug,p_expected_version:Number(current.catalog_version),p_patch:patch});
    return { ok: !error, error: error?.message ?? null };
  }
  async createDriver(input: {
    displayName: string;
    externalDispatchId: string;
    vehicleTypes: string[];
    languages: string[];
    availableFrom: string;
    availableUntil: string;
    serviceRole:"driver"|"guide"|"driver_guide";publicPhone:string;
  }) {
    if (!this.client) return false;
    const { error } = await this.client.rpc("operations_create_driver_v2", {
      p_display_name: input.displayName,
      p_external_dispatch_id: input.externalDispatchId || null,
      p_vehicle_types: input.vehicleTypes,
      p_languages: input.languages,
      p_available_from: input.availableFrom,
      p_available_until: input.availableUntil,
      p_service_role:input.serviceRole,p_public_phone:input.publicPhone,
    });
    return !error;
  }
  async saveDispatchPlan(departureId: string, tasks: DispatchPlanDraft[]) {
    if (!this.client) return { ok: false, error: "运营数据服务未配置" };
    const { error } = await this.client.rpc("operations_save_dispatch_plan", {
      p_departure: departureId,
      p_tasks: tasks,
    });
    return { ok: !error, error: error?.message ?? null };
  }
  async confirmDispatchTasks(taskIds: string[]) {
    return this.transition("operations_confirm_dispatch_tasks", {
      p_task_ids: taskIds,
    });
  }
  async simulateDispatchSend(taskIds: string[]) {
    return this.transition("operations_simulate_dispatch_send", {
      p_task_ids: taskIds,
    });
  }
  async cancelDispatchTasks(taskIds: string[], reason: string) {
    return this.transition("operations_cancel_dispatch_tasks", {
      p_task_ids: taskIds,
      p_reason: reason,
    });
  }
  async retryPaidFulfilment(orderId: string) {
    return this.transition("operations_retry_paid_fulfilment", {
      p_order: orderId,
    });
  }
  async resolveBankTransfer(input: {
    orderId: string;
    decision: "confirmed" | "rejected";
    reference?: string;
    reason?: string;
    idempotencyKey: string;
  }) {
    if (!this.client) return { ok: false, result: null, error: "运营数据服务未配置" };
    const { data, error } = await this.client.rpc("operations_resolve_bank_transfer", {
      p_order: input.orderId,
      p_decision: input.decision,
      p_reference: input.reference ?? "",
      p_reason: input.reason ?? "",
      p_idempotency_key: input.idempotencyKey,
    });
    return { ok: !error, result: typeof data === "string" ? data : null, error: error?.message ?? null };
  }
  async reviewAccountDeletion(requestId:string,decision:"reviewing"|"rejected",note:string){return this.transition("operations_review_account_deletion",{p_request:requestId,p_decision:decision,p_note:note})}
  async rejectCancellationRequest(requestId:string,reason:string){return this.transition("operations_reject_cancellation_request",{p_request:requestId,p_reason:reason})}
  async retryNotificationDelivery(outboxId:string,reason:string){return this.transition("operations_retry_notification_delivery",{p_outbox:outboxId,p_reason:reason})}
  async reviewStaffApplication(applicationId:string,decision:"approved"|"rejected"|"needs_information"|"suspended",note:string){return this.transition("operations_review_staff_application",{p_application:applicationId,p_decision:decision,p_note:note})}
  async reviewStaffLeave(requestId:string,decision:"approved"|"rejected",note:string){return this.transition("operations_review_staff_leave",{p_request:requestId,p_decision:decision,p_note:note})}
  async loadReferralSummary(){if(!this.client)return null;const {data,error}=await this.client.rpc('get_operations_referral_summary');return error?null:data as OperationsReferralSummary}
  async updateReferralSettings(discountPercent:number,validityDays:number,active:boolean){return this.transition('operations_update_referral_settings',{p_discount_percent:discountPercent,p_validity_days:validityDays,p_active:active})}
  async setReferralCouponStatus(couponId:string,action:'freeze'|'void'|'restore',reason:string){return this.transition('operations_set_referral_coupon_status',{p_coupon:couponId,p_action:action,p_reason:reason})}
  private async transition(name: string, args: Record<string, unknown>) {
    if (!this.client) return { ok: false, error: "运营数据服务未配置" };
    const { error } = await this.client.rpc(name, args);
    return { ok: !error, error: error?.message ?? null };
  }
}
