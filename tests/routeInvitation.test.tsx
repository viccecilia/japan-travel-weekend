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
afterEach(()=>{cleanup();sessionStorage.clear()});
describe('route invitation page',()=>{
  it('shows the route before registration and keeps the selected link language',async()=>{render(<MemoryRouter initialEntries={['/r/FRIEND10/kyoto-nara-classic?lang=vi']}><AppProvider services={services() as never}><Routes><Route path="/r/:code/:slug" element={<RouteInvitation/>}/></Routes></AppProvider></MemoryRouter>);expect(await screen.findByText('Đăng ký và nhận phiếu du lịch dành cho khách mới')).toBeVisible();expect(screen.getByRole('link',{name:'Xem chi tiết hành trình'})).toHaveAttribute('href',expect.stringContaining('ref=FRIEND10&lang=vi'));await waitFor(()=>expect(sessionStorage.getItem('jtw-referral-attribution-v1')).toContain('FRIEND10'))});
  it('keeps the public route visible for an invalid code and hides the attributed registration action',async()=>{render(<MemoryRouter initialEntries={['/r/BADCODE/kyoto-nara-classic?lang=zh-CN']}><AppProvider services={services(false) as never}><Routes><Route path="/r/:code/:slug" element={<RouteInvitation/>}/></Routes></AppProvider></MemoryRouter>);expect(await screen.findByText(/邀请来源无法确认/)).toBeVisible();expect(screen.getByRole('link',{name:'查看路线详情'})).toBeVisible();expect(screen.queryByRole('link',{name:'注册并保留这条路线'})).toBeNull()});
  it('localizes an invalid-code warning instead of falling back to English',async()=>{render(<MemoryRouter initialEntries={['/r/BADCODE/kyoto-nara-classic?lang=vi']}><AppProvider services={services(false) as never}><Routes><Route path="/r/:code/:slug" element={<RouteInvitation/>}/></Routes></AppProvider></MemoryRouter>);expect(await screen.findByText(/Không thể xác minh nguồn lời mời/)).toBeVisible();expect(screen.queryByText(/could not be verified/)).toBeNull()});
  it('does not replace an unknown route slug with an unrelated route',()=>{render(<MemoryRouter initialEntries={['/r/FRIEND10/not-a-real-route?lang=en']}><AppProvider services={services() as never}><Routes><Route path="/r/:code/:slug" element={<RouteInvitation/>}/></Routes></AppProvider></MemoryRouter>);expect(screen.getByRole('status')).toHaveTextContent('No current quote');expect(screen.queryByRole('heading',{level:1})).toBeNull()});
});
