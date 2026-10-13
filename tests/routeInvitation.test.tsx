import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {RouteInvitation} from '../src/app/RouteInvitation';

const services=(valid=true)=>({
  loadSellableDepartures:vi.fn(async()=>({data:[],error:null})),
  currentUser:vi.fn(async()=>null),onAuthStateChange:()=>()=>{},
  resolvePublicReferralInvitation:vi.fn(async(code:string)=>({valid,code:valid?code:''})),
});
afterEach(()=>{cleanup();sessionStorage.clear();document.documentElement.lang='zh-CN'});
describe('route invitation page',()=>{
  it('shows the route before registration and keeps the selected link language',async()=>{render(<MemoryRouter initialEntries={['/r/FRIEND10/kyoto-nara-classic?lang=vi']}><AppProvider services={services() as never}><Routes><Route path="/r/:code/:slug" element={<RouteInvitation/>}/></Routes></AppProvider></MemoryRouter>);expect(await screen.findByText('Đăng ký và nhận phiếu du lịch dành cho khách mới')).toBeVisible();expect(screen.getByRole('link',{name:'Xem chi tiết hành trình'})).toHaveAttribute('href',expect.stringContaining('ref=FRIEND10&lang=vi'));await waitFor(()=>expect(sessionStorage.getItem('jtw-referral-attribution-v1')).toContain('FRIEND10'))});
  it('keeps the public route visible for an invalid code and hides the attributed registration action',async()=>{render(<MemoryRouter initialEntries={['/r/BADCODE/kyoto-nara-classic?lang=zh-CN']}><AppProvider services={services(false) as never}><Routes><Route path="/r/:code/:slug" element={<RouteInvitation/>}/></Routes></AppProvider></MemoryRouter>);expect(await screen.findByText(/邀请来源无法确认/)).toBeVisible();expect(screen.getByRole('link',{name:'查看路线详情'})).toBeVisible();expect(screen.queryByRole('link',{name:'注册并保留这条路线'})).toBeNull()});
  it('localizes an invalid-code warning instead of falling back to English',async()=>{render(<MemoryRouter initialEntries={['/r/BADCODE/kyoto-nara-classic?lang=vi']}><AppProvider services={services(false) as never}><Routes><Route path="/r/:code/:slug" element={<RouteInvitation/>}/></Routes></AppProvider></MemoryRouter>);expect(await screen.findByText(/Không thể xác minh nguồn lời mời/)).toBeVisible();expect(screen.queryByText(/could not be verified/)).toBeNull()});
  it('does not replace an unknown route slug with an unrelated route',()=>{render(<MemoryRouter initialEntries={['/r/FRIEND10/not-a-real-route?lang=en']}><AppProvider services={services() as never}><Routes><Route path="/r/:code/:slug" element={<RouteInvitation/>}/></Routes></AppProvider></MemoryRouter>);expect(screen.getByRole('status')).toHaveTextContent('No current quote');expect(screen.queryByRole('heading',{level:1})).toBeNull()});
  it('uses the published detailed introduction instead of repeating the short summary',()=>{render(<MemoryRouter initialEntries={['/r/FRIEND10/kyoto-nara-classic?lang=zh-CN']}><AppProvider services={services() as never}><Routes><Route path="/r/:code/:slug" element={<RouteInvitation/>}/></Routes></AppProvider></MemoryRouter>);expect(screen.getByText(/从大阪出发，依次走访伏见稻荷大社/)).toHaveClass('route-invitation-description');expect(screen.getAllByText(/从大阪或京都出发，一天游览/)).toHaveLength(1)});
  it('sets both the invitation root and document language without changing account preferences',async()=>{const {unmount}=render(<MemoryRouter initialEntries={['/r/FRIEND10/kyoto-nara-classic?lang=ja']}><AppProvider services={services() as never}><Routes><Route path="/r/:code/:slug" element={<RouteInvitation/>}/></Routes></AppProvider></MemoryRouter>);await waitFor(()=>expect(document.documentElement.lang).toBe('ja'));expect(document.querySelector('main.route-invitation')).toHaveAttribute('lang','ja');unmount();expect(document.documentElement.lang).toBe('zh-CN')});
});
