import type { SupabaseClient } from "@supabase/supabase-js";
import { TestBackendApi, type CheckoutRequest } from "./testApi";
import {
  SupabaseAuthRepository,
  SupabaseAccountProfileRepository,
  SupabaseDepartureRepository,
  SupabaseCatalogRepository,
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
  readonly catalog;
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
    this.catalog = new SupabaseCatalogRepository(client);
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
  signUp(email: string, password: string, accountType:"passenger"|"driver"|"guide"="passenger",displayName="",referralCode="") {
    return this.auth.signUp(email, password,accountType,displayName,referralCode);
  }
  loadOwnReferralSummary(){return this.auth.loadOwnReferralSummary()}
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
  currentAccessDestination(){return this.auth.currentAccessDestination()}
  loadOwnStaffLeaves(){return this.auth.loadOwnStaffLeaves()}
  submitOwnStaffLeave(startsAt:string,endsAt:string,reason:string){return this.auth.submitOwnStaffLeave(startsAt,endsAt,reason)}
  cancelOwnStaffLeave(requestId:string){return this.auth.cancelOwnStaffLeave(requestId)}
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
  loadOwnDisplayName() {
    return this.accountProfile.loadOwnDisplayName();
  }
  updateOwnDisplayName(displayName: string) {
    return this.accountProfile.updateOwnDisplayName(displayName);
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
  loadOwnCancellationRequest(orderId:string){return this.orders.loadOwnCancellationRequest(orderId)}
  requestOwnCancellation(orderId:string,reasonCode:string,note:string){return this.orders.requestOwnCancellation(orderId,reasonCode,note)}
  loadSellableDepartures() {
    return this.departures.listSellable();
  }
  loadPublishedCatalog(){return this.catalog.listPublished()}
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
  startStaffFreeTime(vehicleGroupId:string,stopName:string,minutes:number){return this.staff.startFreeTime(vehicleGroupId,stopName,minutes)}
  publishStaffLocation(vehicleGroupId:string,sessionId:string,latitude:number,longitude:number,accuracy:number|null,recordedAt?:string,sequence?:number){return this.staff.publishLocation(vehicleGroupId,sessionId,latitude,longitude,accuracy,recordedAt,sequence)}
  stopStaffLocation(vehicleGroupId:string){return this.staff.stopLocation(vehicleGroupId)}
  createCheckout(input: CheckoutRequest) {
    return this.checkout.checkout(input);
  }
  createQuote(input:{departureId:string;seats:number;couponId?:string}){return this.checkout.quote(input)}
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
    targetLanguage: "zh-CN" | "zh-TW" | "ja" | "en" | "vi" | "ne" | "ko";
  }) {
    return this.checkout.translateMessage(input);
  }
  executeOperationsRefund(requestId:string,idempotencyKey:string){return this.checkout.executeRefund({requestId,idempotencyKey})}
}
