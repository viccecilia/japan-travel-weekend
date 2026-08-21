import type { SupabaseClient } from "@supabase/supabase-js";
import { TestBackendApi, type CheckoutRequest } from "./testApi";
import {
  SupabaseAuthRepository,
  SupabaseOrderRepository,
  SupabaseTripRoomRepository,
} from "../integrations/supabaseProduction";
import { SupabaseRealtimeAdapter } from "../integrations/supabaseClient";
export class ProductionBrowserServices {
  readonly auth;
  readonly orders;
  readonly checkout;
  readonly tripRoom;
  readonly realtime;
  constructor(
    client: SupabaseClient | null,
    apiBaseUrl: string | undefined,
    fetcher?: typeof fetch,
  ) {
    this.auth = new SupabaseAuthRepository(client);
    this.orders = new SupabaseOrderRepository(client);
    this.tripRoom = new SupabaseTripRoomRepository(client);
    this.realtime = new SupabaseRealtimeAdapter(client);
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
  get authAvailable() { return this.auth.available; }
  get ordersAvailable() { return this.orders.available; }
  get checkoutAvailable() { return this.checkout.available; }
  get tripRoomAvailable() { return this.tripRoom.available; }
  get realtimeAvailable() { return this.realtime.connected; }
  signIn(email: string, password: string) {
    return this.auth.signIn(email, password);
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
  createCheckout(input: CheckoutRequest) {
    return this.checkout.checkout(input);
  }
}
