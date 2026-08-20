/* eslint-disable react-refresh/only-export-components */
import {createContext,useContext,useMemo,useState,type ReactNode} from 'react'; import type {Booking,DemoOrder,DemoState} from '../shared/types';
const KEY='jtw-demo-state-v1';
export const initialState:DemoState={user:null,booking:null,orders:[],completedTrips:1,credits:800,ownReferralCode:'WEEKEND-DEMO',language:'en',ui:{compact:false}};
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)??'') as DemoState}catch{return initialState}};
type Ctx={state:DemoState;setState:(s:DemoState)=>void;updateBooking:(b:Partial<Booking>)=>void;addOrder:(o:DemoOrder)=>void;reset:()=>void};
const Context=createContext<Ctx|null>(null);
export function DemoProvider({children}:{children:ReactNode}){const [state,rawSet]=useState(load);const setState=(s:DemoState)=>{rawSet(s);localStorage.setItem(KEY,JSON.stringify(s))};const value=useMemo(()=>({state,setState,updateBooking:(b:Partial<Booking>)=>setState({...state,booking:{tripSlug:'kyoto-nara-classic',date:'Preview date — TBD',adults:1,children:0,referralCode:'',useCredits:false,...state.booking,...b}}),addOrder:(o:DemoOrder)=>setState({...state,orders:[o,...state.orders]}),reset:()=>{localStorage.removeItem(KEY);rawSet(initialState)}}),[state]);return <Context.Provider value={value}>{children}</Context.Provider>}
export const useDemo=()=>{const c=useContext(Context);if(!c)throw new Error('DemoProvider missing');return c};
