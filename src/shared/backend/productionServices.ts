import type { SupabaseClient } from "@supabase/supabase-js";
import { TestBackendApi, type CheckoutRequest } from "./testApi";
import {
  SupabaseAuthRepository,
  SupabaseAccountProfileRepository,
  SupabaseDepartureRepository,
  SupabaseOrderRepository,
  SupabaseStaffRepository,
  SupabaseTripRoomRepository,
} from "../integrations/supabaseProduction";
import { SupabaseRealtimeAdapter } from "../integrations/supabaseClient";
import { SupabaseOperationsRepository } from "../integrations/supabaseOperations";
export class ProductionBrowserServices {
  readonly auth;
  readonly orders;
  readonly departures;
  readonly checkout;
  readonly tripRoom;
  readonly realtime;
  readonly operations;
  readonly staff;
  readonly accountProfile;
  constructor(
    client: SupabaseClient | null,
    apiBaseUrl: string | undefined,
    fetcher?: typeof fetch,
  ) {
    this.auth = new SupabaseAuthRepository(client);
    this.orders = new SupabaseOrderRepository(client);
    this.departures = new SupabaseDepartureRepository(client);
    this.tripRoom = new SupabaseTripRoomRepository(client);
    this.realtime = new SupabaseRealtimeAdapter(client);
    this.operations = new SupabaseOperationsRepository(client);
    this.staff = new SupabaseStaffRepository(client);
    this.accountProfile = new SupabaseAccountProfileRepository(client);
    this.checkout = new TestBackendApi(
      apiBaseUrl,
      async () =>
        client
          ? ((await client.auth.getSession()).data.session?.access_token ??
            null)
          : null,
      fetcher,
    );
  }
  get authAvailable() {
    return this.auth.available;
  }
  get ordersAvailable() {
    return this.orders.available;
  }
  get departuresAvailable() {
    return this.departures.available;
  }
  get checkoutAvailable() {
    return this.checkout.available;
  }
  get tripRoomAvailable() {
    return this.tripRoom.available;
  }
  get realtimeAvailable() {
    return this.realtime.connected;
  }
  signIn(email: string, password: string) {
    return this.auth.signIn(email, password);
  }
  signUp(email: string, password: string) {
    return this.auth.signUp(email, password);
  }
  requestPasswordReset(email: string) {
    return this.auth.requestPasswordReset(email);
  }
  updatePassword(password: string) {
    return this.auth.updatePassword(password);
  }
  onAuthStateChange(
    handler: (event: string, user: { email?: string | null } | null) => void,
  ) {
    return this.auth.onAuthStateChange(handler);
  }
  currentUser() {
    return this.auth.currentUser();
  }
  currentRole() {
    return this.auth.currentRole();
  }
  signOut() {
    return this.auth.signOut();
  }
  listOwnOrders() {
    return this.orders.listOwnOrders();
  }
  loadOwnOrders() {
    return this.orders.loadOwnOrders();
  }
  loadOwnNotifications() {
    return this.orders.loadOwnNotifications();
  }
  loadOwnDrafts() {
    return this.orders.loadOwnDrafts();
  }
  abandonOwnDraft(draftId: string) {
    return this.orders.abandonOwnDraft(draftId);
  }
  loadOwnAccountProfile() {
    return this.accountProfile.loadOwn();
  }
  updateOwnAccountProfile(
    input: Parameters<SupabaseAccountProfileRepository["updateOwn"]>[0],
  ) {
    return this.accountProfile.updateOwn(input);
  }
  loadOwnAccountDeletionRequest() { return this.accountProfile.loadOwnDeletionRequest(); }
  requestOwnAccountDeletion(confirmation:string,reason:string) { return this.accountProfile.requestOwnDeletion(confirmation,reason); }
  cancelOwnAccountDeletion(requestId:string) { return this.accountProfile.cancelOwnDeletion(requestId); }
  saveOwnBookingDraft(
    input: Parameters<SupabaseOrderRepository["saveOwnDraft"]>[0],
  ) {
    return this.orders.saveOwnDraft(input);
  }
  loadOwnOrderFulfilment(orderId: string) {
    return this.orders.ownFulfilment(orderId);
  }
  loadSellableDepartures() {
    return this.departures.listSellable();
  }
  loadStaffTasks() {
    return this.staff.listTasks();
  }
  recordStaffExecution(
    vehicleGroupId: string,
    eventType: Parameters<SupabaseStaffRepository["recordExecution"]>[1],
    detail?: Record<string, unknown>,
  ) {
    return this.staff.recordExecution(vehicleGroupId, eventType, detail);
  }
  loadStaffMeeting(vehicleGroupId: string) {
    return this.staff.loadMeeting(vehicleGroupId);
  }
  updateStaffMeeting(
    input: Parameters<SupabaseStaffRepository["updateMeeting"]>[0],
  ) {
    return this.staff.updateMeeting(input);
  }
  reportStaffDelay(
    vehicleGroupId: string,
    delayMinutes: number,
    reason: string,
  ) {
    return this.staff.reportDelay(vehicleGroupId, delayMinutes, reason);
  }
  advanceStaffJourney(vehicleGroupId:string,action:'stop_arrived'|'trip_completed',stopName:string,reason:string){return this.staff.advanceJourney(vehicleGroupId,action,stopName,reason)}
  advanceStaffToItineraryStop(vehicleGroupId:string,stopId:string,reason:string){return this.staff.advanceToItineraryStop(vehicleGroupId,stopId,reason)}
  publishStaffLocation(vehicleGroupId:string,latitude:number,longitude:number,accuracy:number|null){return this.staff.publishLocation(vehicleGroupId,latitude,longitude,accuracy)}
  stopStaffLocation(vehicleGroupId:string){return this.staff.stopLocation(vehicleGroupId)}
  createCheckout(input: CheckoutRequest) {
    return this.checkout.checkout(input);
  }
  issueBoardingCredential(orderId: string) {
    return this.checkout.issueBoardingCredential(orderId);
  }
  verifyBoardingCredential(input: {
    token: string;
    vehicleGroupId: string;
    idempotencyKey: string;
  }) {
    return this.checkout.verifyBoardingCredential(input);
  }
  translateMessage(input: {
    messageId: string;
    targetLanguage: "zh-CN" | "ja" | "en" | "vi" | "ne";
  }) {
    return this.checkout.translateMessage(input);
  }
}
