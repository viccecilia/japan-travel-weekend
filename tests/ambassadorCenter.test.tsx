import {MemoryRouter} from 'react-router-dom';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {AppProvider} from '../src/app/store';
import {AmbassadorCenter} from '../src/app/AmbassadorCenter';

const dashboard={qualification:{active:false,status:'pending',achievedAt:null,source:null,currentValidReferrals:6},referralCode:'JTTEST',currentMonth:{registered:4,firstPaid:2,validReferrals:1,rewardAmount:1000},previousMonth:{registered:3,firstPaid:1,validReferrals:1,rewardAmount:500},lifetime:{registered:6,validReferrals:6,totalReward:1500,totalPaidOut:0,currentBalance:1500},withdrawal:{threshold:10000,eligibleAmount:1500,requestedThisMonth:false,status:'not_requested'},cashRule:{id:'cash-10-v1',percent:10}};
const services={loadSellableDepartures:vi.fn(async()=>({data:[],error:null})),currentUser:vi.fn(async()=>null),onAuthStateChange:()=>()=>{},loadOwnAmbassadorDashboard:vi.fn(async()=>dashboard),listOwnReferralRecords:vi.fn(async()=>({total:0,records:[]})),listOwnCommissionHistory:vi.fn(async()=>({entries:[],payouts:[]})),requestOwnCommissionPayout:vi.fn(async()=>({ok:true}))};
afterEach(cleanup);
describe('AmbassadorCenter',()=>{
  it('keeps a visible locked path with a real progress count',async()=>{render(<MemoryRouter><AppProvider services={services as never}><AmbassadorCenter/></AppProvider></MemoryRouter>);expect(await screen.findByText(/尚未解锁/)).toBeTruthy();expect(screen.getByText('6 / 10')).toBeTruthy()});
  it('uses the full center only when the server qualification is active',async()=>{const activeServices={...services,loadOwnAmbassadorDashboard:vi.fn(async()=>({...dashboard,qualification:{...dashboard.qualification,active:true,currentValidReferrals:10}}))};render(<MemoryRouter><AppProvider services={activeServices as never}><AmbassadorCenter/></AppProvider></MemoryRouter>);expect(await screen.findByRole('button',{name:'推广记录'})).toBeTruthy();expect(screen.queryByText(/尚未解锁/)).toBeNull()});
});
