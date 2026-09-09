/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppState, Booking, Departure, Order, UiPreferences } from "../shared/types";
import { isSeedEnabled } from "../shared/config/businessRules";
import { createMemoryRepository } from "../shared/data/repository";
import type { ProductionBrowserServices } from "../shared/backend/productionServices";
import {replacePublishedTripCatalog} from '../shared/data/repository';
const UI_KEY = "jtw-ui-preferences-v1";
const loadUi = (): UiPreferences => {
  try {
    return {
      ...{ compact: false, locale: "zh-CN" },
      ...JSON.parse(localStorage.getItem(UI_KEY) ?? "{}"),
    };
  } catch {
    return { compact: false, locale: "zh-CN" };
  }
};
const repo = createMemoryRepository(isSeedEnabled);
export const initialState = (): AppState => ({
  user: null,
  booking: null,
  orders: [],
  completedTrips: 0,
  credits: 0,
  ownReferralCode: "",
  ui: loadUi(),
  tripRoom: isSeedEnabled
    ? repo.getTripRoomForGroup("dep-kyoto-seed-group-1")
    : null,
});
type Ctx = {
  state: AppState;
  setState: (s: AppState) => void;
  services: ProductionBrowserServices | null;
  authResolved: boolean;
  departures: Departure[];
  departuresResolved: boolean;
  departuresError: string | null;
  updateBooking: (b: Partial<Booking>) => void;
  addOrder: (o: Order) => void;
  setUi: (ui: UiPreferences) => void;
  reset: () => void;
};
const Context = createContext<Ctx | null>(null);
export function AppProvider({
  children,
  services = null,
}: {
  children: ReactNode;
  services?: ProductionBrowserServices | null;
}) {
  const [state, setState] = useState(initialState);
  const [authResolved, setAuthResolved] = useState(!services);
  const [departures,setDepartures]=useState<Departure[]>(()=>services?[]:repo.listDepartures());
  const [departuresResolved,setDeparturesResolved]=useState(!services);
  const [departuresError,setDeparturesError]=useState<string|null>(null);
  const [,setCatalogRevision]=useState(0);
  useEffect(()=>{let active=true;if(!services||typeof services.loadPublishedCatalog!=='function')return()=>{active=false};void services.loadPublishedCatalog().then(result=>{if(!active)return;if(!result.error){replacePublishedTripCatalog(result.data);setCatalogRevision(value=>value+1)}});return()=>{active=false}},[services]);
  useEffect(()=>{let active=true;if(!services)return()=>{active=false};void services.loadSellableDepartures().then(result=>{if(!active)return;setDepartures(result.data);setDeparturesError(result.error);setDeparturesResolved(true)});return()=>{active=false}},[services]);
  useEffect(() => {
    let active = true;
    if (!services) return () => { active = false; };
    const unsubscribe=services.onAuthStateChange((event,user)=>{
      if(!active)return;
      if(event==='SIGNED_OUT'||!user?.email)setState((s)=>({...s,user:null}));
      else setState((s)=>({...s,user:{email:user.email!}}));
      setAuthResolved(true);
    });
    void services.currentUser().then((user) => {
      if (!active) return;
      setState((s) => ({ ...s, user: user?.email ? { email: user.email } : null }));
    }).catch(() => {
      if (active) setState((s) => ({ ...s, user: null }));
    }).finally(() => {
      if (active) setAuthResolved(true);
    });
    return () => { active = false;unsubscribe(); };
  }, [services]);
  const setUi = (ui: UiPreferences) => {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
    setState((s) => ({ ...s, ui }));
  };
  const value = useMemo(
    () => ({
      state,
      setState,
      services,
      authResolved,
      departures,
      departuresResolved,
      departuresError,
      updateBooking: (b: Partial<Booking>) =>
        setState((s) => ({
          ...s,
          booking: {
            tripSlug: "kyoto-nara-classic",
            departureId: "",
            adults: 1,
            children: 0,
            infants: 0,
            referralCode: "",
            useCredits: false,
            ...s.booking,
            ...b,
          },
        })),
      addOrder: (o: Order) =>
        setState((s) => ({ ...s, orders: [o, ...s.orders] })),
      setUi,
      reset: () => {
        localStorage.removeItem(UI_KEY);
        setState(initialState());
      },
    }),
    [state, services, authResolved, departures, departuresResolved, departuresError],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useApp = () => {
  const c = useContext(Context);
  if (!c) throw new Error("缺少应用数据上下文");
  return c;
};
export const useOptionalApp = () => useContext(Context);
