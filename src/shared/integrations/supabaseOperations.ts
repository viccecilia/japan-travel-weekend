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
};
export type OperationsDriver = {
  id: string;
  display_name: string;
  external_dispatch_id: string | null;
  languages: string[];
  status: "available" | "unavailable" | "suspended";
  service_role?:"driver"|"guide"|"driver_guide";public_phone?:string|null;
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
  async loadSnapshot(): Promise<{
    data: OperationsSnapshot | null;
    error: string | null;
  }> {
    if (!this.client) return { data: null, error: "运营数据服务未配置" };
    try {
      const [types, vehicles, drivers, departures, drafts, workItems, notificationIssues, deletionRequests, cancellationRequests, tasks] =
        await Promise.all([
          this.client
            .from("vehicle_type_configs")
            .select("type_key,label,sellable_capacity,cost_units,active")
            .eq("active", true)
            .order("sellable_capacity"),
          this.client
            .from("fleet_vehicles")
            .select(
              "id,registration_identifier,vehicle_type_key,external_dispatch_id,status,public_color,public_photo_url",
            )
            .order("registration_identifier"),
          this.client
            .from("driver_resources")
            .select(
              "id,display_name,external_dispatch_id,languages,status,service_role,public_phone,driver_vehicle_qualifications(vehicle_type_key),driver_availability_windows(starts_at,ends_at)",
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
          this.client.from('order_cancellation_requests').select('id,order_id,status,reason_code,refund_percent,estimated_refund_amount,requested_at,updated_at').in('status',['requested','reviewing','refund_processing']).order('requested_at',{ascending:true}).limit(100),
          this.client
            .from("dispatch_tasks")
            .select(
              "id,status,external_task_id,last_error,created_at,driver_id,fleet_vehicle_id,payload",
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
        }[]
      ).map((task) => ({
        id: task.id,
        status: task.status,
        externalTaskId: task.external_task_id,
        lastError: task.last_error,
        createdAt: task.created_at,
        driverId: task.driver_id,
        fleetVehicleId: task.fleet_vehicle_id,
        payload: task.payload ?? {},
      }));
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
    title: string;
    summary: string;
    walkingLevel: string;
    mealNotes: string;
    notices: string[];
    heroImageUrl: string;
    status: "draft" | "published";
  }) {
    if (!this.client) return { ok: false, error: "运营数据服务未配置" };
    const { error } = await this.client.rpc("operations_update_route_catalog", {
      p_slug: input.slug,
      p_title: input.title,
      p_content: {
        summary: input.summary,
        walkingLevel: input.walkingLevel,
        mealNotes: input.mealNotes,
        notices: input.notices,
      },
      p_hero_image_url: input.heroImageUrl || null,
      p_gallery: input.heroImageUrl ? [input.heroImageUrl] : [],
      p_status: input.status,
    });
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
  async retryNotificationDelivery(outboxId:string,reason:string){return this.transition("operations_retry_notification_delivery",{p_outbox:outboxId,p_reason:reason})}
  private async transition(name: string, args: Record<string, unknown>) {
    if (!this.client) return { ok: false, error: "运营数据服务未配置" };
    const { error } = await this.client.rpc(name, args);
    return { ok: !error, error: error?.message ?? null };
  }
}
