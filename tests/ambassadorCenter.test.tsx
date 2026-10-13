import {MemoryRouter} from 'react-router-dom';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {AppProvider} from '../src/app/store';
import {AmbassadorCenter} from '../src/app/AmbassadorCenter';

const dashboard={qualification:{active:false,status:'pending',achievedAt:null,source:null,currentValidReferrals:2,currentPaidSeats:6,learningEligible:false,learningStatus:'not_eligible',contentPublished:false},activity:{status:'not_applicable',pendingFirstPaid:0,lastQualifiedAt:null},referralCode:'JTTEST',currentMonth:{registered:4,firstPaid:2,validReferrals:1,paidSeats:3,rewardAmount:1000},previousMonth:{registered:3,firstPaid:1,validReferrals:1,paidSeats:2,rewardAmount:500},lifetime:{registered:6,validReferrals:2,paidSeats:6,completedOrders:2,totalReward:1500,totalPaidOut:0,currentBalance:1500},withdrawal:{threshold:10000,eligibleAmount:1500,requestedThisMonth:false,status:'not_requested'},cashRule:{id:'cash-10-v1',percent:10}};
const services={loadSellableDepartures:vi.fn(async()=>({data:[],error:null})),currentUser:vi.fn(async()=>null),onAuthStateChange:()=>()=>{},loadOwnAmbassadorDashboard:vi.fn(async()=>dashboard),listOwnReferralRecords:vi.fn(async()=>({total:0,records:[]})),listOwnCommissionHistory:vi.fn(async()=>({entries:[],payouts:[]})),requestOwnCommissionPayout:vi.fn(async()=>({ok:true}))};
afterEach(cleanup);
describe('AmbassadorCenter',()=>{
  it('keeps a visible locked path with a real progress count',async()=>{render(<MemoryRouter><AppProvider services={services as never}><AmbassadorCenter/></AppProvider></MemoryRouter>);expect(await screen.findByText(/尚未解锁/)).toBeTruthy();expect(screen.getByText('6 / 10')).toBeTruthy()});
  it('does not auto-unlock at ten paid seats when certification content is pending',async()=>{const pendingServices={...services,loadOwnAmbassadorDashboard:vi.fn(async()=>({...dashboard,qualification:{...dashboard.qualification,currentPaidSeats:10,learningEligible:true,learningStatus:'content_pending'}}))};render(<MemoryRouter><AppProvider services={pendingServices as never}><AmbassadorCenter/></AppProvider></MemoryRouter>);expect(await screen.findByText(/学习认证内容正在准备中/)).toBeTruthy();expect(screen.queryByRole('button',{name:'推广记录'})).toBeNull()});
  it('uses the full center only when the server qualification is active',async()=>{const activeServices={...services,loadOwnAmbassadorDashboard:vi.fn(async()=>({...dashboard,qualification:{...dashboard.qualification,active:true,currentPaidSeats:10}}))};render(<MemoryRouter><AppProvider services={activeServices as never}><AmbassadorCenter/></AppProvider></MemoryRouter>);expect(await screen.findByRole('button',{name:'推广记录'})).toBeTruthy();expect(screen.queryByText(/尚未解锁/)).toBeNull()});
});
