/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
const stateForIdentity = (ui: UiPreferences, email: string | null): AppState => ({
  user: email ? {email} : null,
  booking: null,
  orders: [],
  completedTrips: 0,
  credits: 0,
  ownReferralCode: "",
  ui,
  tripRoom: null,
});
type Ctx = {
  state: AppState;
  setState: (s: AppState) => void;
  services: ProductionBrowserServices | null;
  authResolved: boolean;
  departures: Departure[];
  departuresResolved: boolean;
  departuresError: string | null;
  catalogRevision: number;
  refreshCatalog: () => Promise<string | null>;
  updateBooking: (b: Partial<Booking>) => void;
  addOrder: (o: Order) => void;
  setUi: (ui: UiPreferences) => void;
  reset: () => void;
  clearIdentity: () => void;
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
  const [catalogRevision,setCatalogRevision]=useState(0);
  const authGeneration=useRef(0);
  const refreshCatalog=useCallback(async()=>{if(!services||typeof services.loadPublishedCatalog!=='function')return null;const result=await services.loadPublishedCatalog();if(!result.error){replacePublishedTripCatalog(result.data);setCatalogRevision(value=>value+1)}return result.error},[services]);
  useEffect(()=>{let active=true;if(!services||typeof services.loadPublishedCatalog!=='function')return()=>{active=false};const load=async()=>{const result=await services.loadPublishedCatalog();if(active&&!result.error){replacePublishedTripCatalog(result.data);setCatalogRevision(value=>value+1)}};void load();const onFocus=()=>void load();const timer=window.setInterval(()=>void load(),30_000);window.addEventListener('focus',onFocus);window.addEventListener('online',onFocus);return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus);window.removeEventListener('online',onFocus)}},[services]);
  useEffect(()=>{let active=true;if(!services)return()=>{active=false};const load=()=>void services.loadSellableDepartures().then(result=>{if(!active)return;setDepartures(result.data);setDeparturesError(result.error);setDeparturesResolved(true)});load();const timer=window.setInterval(load,30_000);window.addEventListener('focus',load);window.addEventListener('online',load);return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('online',load)}},[services]);
  useEffect(() => {
    let active = true;
    if (!services) return () => { active = false; };
    const unsubscribe=services.onAuthStateChange((event,user)=>{
      if(!active)return;
      authGeneration.current+=1;
      const email=event==='SIGNED_OUT'?null:user?.email??null;
      setState((s)=>s.user?.email===email?{...s,user:email?{email}:null}:stateForIdentity(s.ui,email));
      setAuthResolved(true);
    });
    const requestGeneration=authGeneration.current;
    void services.currentUser().then((user) => {
      if (!active||requestGeneration!==authGeneration.current) return;
      const email=user?.email??null;
      setState((s)=>s.user?.email===email?{...s,user:email?{email}:null}:stateForIdentity(s.ui,email));
    }).catch(() => {
      if (active&&requestGeneration===authGeneration.current) setState((s)=>stateForIdentity(s.ui,null));
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
      catalogRevision,
      refreshCatalog,
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
      clearIdentity: () => {
        authGeneration.current+=1;
        setState((current)=>stateForIdentity(current.ui,null));
        window.dispatchEvent(new CustomEvent('jtw:identity-cleared'));
      },
    }),
    [state, services, authResolved, departures, departuresResolved, departuresError, catalogRevision, refreshCatalog],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useApp = () => {
  const c = useContext(Context);
  if (!c) throw new Error("缺少应用数据上下文");
  return c;
};
export const useOptionalApp = () => useContext(Context);
