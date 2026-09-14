import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {VipCharter} from '../src/app/VipCharter';
import {AppProvider} from '../src/app/store';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';

const route={departureId:'dep-1',tripId:'trip-1',tripSlug:'amanohashidate-ine',tripTitle:'海之京都：天桥立与伊根舟屋一日游',departsAt:'2026-09-20T23:40:00.000Z',baseSeatPriceJpy:5500,heroImageUrl:'/images/amanohashidate-ine.jpg',stops:['天桥立','伊根舟屋']};
const services=()=>({
  loadPublishedCatalog:vi.fn().mockResolvedValue({data:[],error:null}),loadSellableDepartures:vi.fn().mockResolvedValue({data:[],error:null}),
  onAuthStateChange:vi.fn().mockReturnValue(()=>{}),currentUser:vi.fn().mockResolvedValue({email:'passenger@example.test'}),
  loadVipCharterRoutePrices:vi.fn().mockResolvedValue({data:[route],error:null}),
  quoteVipCharter:vi.fn(async(_id:string,_pax:number,vehicle:'alphard'|'hiace')=>({data:{departureId:'dep-1',tripId:'trip-1',serviceDate:'2026-09-21',vehicleType:vehicle,baseSeatPriceJpy:5500,pricingFactor:vehicle==='alphard'?6:8,pickupFeeJpy:2000,totalJpy:vehicle==='alphard'?35000:46000},error:null})),
  loadOwnVipCharterRequests:vi.fn().mockResolvedValue({data:[],error:null}),submitVipCharterRequest:vi.fn().mockResolvedValue({data:{requestId:'11111111-1111-1111-1111-111111111111',status:'pending_operations',totalJpy:35000,createdAt:'2026-09-14T00:00:00Z'},error:null}),
}) as unknown as ProductionBrowserServices;

describe('VIP charter quote flow',()=>{
  it('shows server quotes, removes Alphard above four people, and submits the selected snapshot',async()=>{const api=services();render(<MemoryRouter initialEntries={['/app/vip-charter?date=2026-09-21&passengers=1']}><AppProvider services={api}><Routes><Route path="/app/vip-charter" element={<VipCharter/>}/></Routes></AppProvider></MemoryRouter>);expect(await screen.findByText('¥35,000／车')).toBeInTheDocument();expect(screen.getByText('¥46,000／车')).toBeInTheDocument();fireEvent.change(screen.getByLabelText('出行人数'),{target:{value:'5'}});await waitFor(()=>expect(screen.queryByText('阿尔法 1–4人')).not.toBeInTheDocument());expect(screen.getByText('海狮 最多9人')).toBeInTheDocument();fireEvent.change(screen.getByLabelText('出行人数'),{target:{value:'4'}});expect(await screen.findByText('阿尔法 1–4人')).toBeInTheDocument();fireEvent.click(screen.getAllByText('选择此行程')[0]);fireEvent.change(screen.getByLabelText('大阪市内接送地址'),{target:{value:'大阪市北区梅田1-1'}});fireEvent.click(screen.getByRole('button',{name:'提交包车需求'}));await waitFor(()=>expect(api.submitVipCharterRequest).toHaveBeenCalledWith(expect.objectContaining({departureId:'dep-1',passengerCount:4,vehicleType:'alphard',pickupWard:'北区'})));expect(await screen.findByText(/包车需求已提交/)).toBeInTheDocument()});
  it('keeps the corporate group inquiry separate in source routes',()=>{const router=readFileSync('src/router/Router.tsx','utf8');const home=readFileSync('src/app/App.tsx','utf8');expect(router).toContain('path="/app/vip-charter"');expect(router).toContain('path="/app/private-groups"');expect(home).toContain('className="passenger-vip-card" to="/app/vip-charter"');expect(home).toContain('className="passenger-private-card" to="/app/private-groups"')});
});

describe('VIP charter database boundary',()=>{it('centralizes factors and recomputes idempotent submissions without touching ordinary inventory',()=>{const sql=readFileSync('supabase/migrations/202609140146_vip_charter_quote_requests.sql','utf8');for(const clause of ['alphard_factor integer not null default 6','hiace_factor integer not null default 8','pickup_fee_jpy integer not null default 2000','d.seat_price_jpy*factor+c.pickup_fee_jpy','unique(account_id,idempotency_key)','public.quote_vip_charter(p_departure,p_passenger_count,p_vehicle_type)','public.is_operations()'])expect(sql).toContain(clause);expect(sql).not.toMatch(/insert into public\.(orders|inventory_locks|vehicle_groups)/)})});
