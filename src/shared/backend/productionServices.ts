import type { SupabaseClient } from "@supabase/supabase-js";
import { TestBackendApi, type CheckoutRequest } from "./testApi";
import {
  SupabaseAuthRepository,
  SupabaseDepartureRepository,
  SupabaseOrderRepository,
  SupabaseTripRoomRepository,
} from "../integrations/supabaseProduction";
import { SupabaseRealtimeAdapter } from "../integrations/supabaseClient";
export class ProductionBrowserServices {
  readonly auth;
  readonly orders;
  readonly departures;
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
    this.departures = new SupabaseDepartureRepository(client);
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
  get departuresAvailable(){return this.departures.available}
  get checkoutAvailable() { return this.checkout.available; }
  get tripRoomAvailable() { return this.tripRoom.available; }
  get realtimeAvailable() { return this.realtime.connected; }
  signIn(email: string, password: string) {
    return this.auth.signIn(email, password);
  }
  signUp(email:string,password:string){return this.auth.signUp(email,password);}
  requestPasswordReset(email:string){return this.auth.requestPasswordReset(email);}
  updatePassword(password:string){return this.auth.updatePassword(password);}
  onAuthStateChange(handler:(event:string,user:{email?:string|null}|null)=>void){return this.auth.onAuthStateChange(handler);}
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
  loadOwnOrderFulfilment(orderId:string){return this.orders.ownFulfilment(orderId)}
  loadSellableDepartures(){return this.departures.listSellable()}
  createCheckout(input: CheckoutRequest) {
    return this.checkout.checkout(input);
  }
  issueBoardingCredential(orderId:string){return this.checkout.issueBoardingCredential(orderId)}
  verifyBoardingCredential(input:{token:string;vehicleGroupId:string;idempotencyKey:string}){return this.checkout.verifyBoardingCredential(input)}
}
