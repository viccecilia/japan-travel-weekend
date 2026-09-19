import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {AppTrip} from '../src/app/App';
import {AppProvider} from '../src/app/store';
import {travelRepository} from '../src/shared/data/repository';
import type {Departure} from '../src/shared/types';
import {singleSeatQuote} from '../src/shared/services/singleSeatPricing';

afterEach(()=>{cleanup();vi.restoreAllMocks()});
const departure=(id:string,time:string,price:number):Departure=>({
  id,tripSlug:'kyoto-nara-classic',dateLabel:'正式班次',weekend:'本周末',status:'可预订',
  departureTime:time,expectedEndTime:time,meetingPointName:'大阪真实集合点',meetingAddress:'大阪',
  meetingCoordinates:null,arrivalInstructions:{transit:null,walking:null,driving:null},meetingPhoto:null,
  meetingPhotoStatus:'待确认',mapStatus:'未连接',price,availableSeats:4,currency:'JPY',taxIncluded:true,
  inventoryStatus:'权威库存',isSeed:false,
});
function page(query=''){
  const services={loadSellableDepartures:async()=>({data:[
    departure('past','2020-01-01T00:00:00Z',1),
    departure('nearest','2099-01-01T00:00:00Z',8800),
    departure('cheaper-later','2099-01-02T00:00:00Z',8000),
  ],error:null}),currentUser:async()=>null,onAuthStateChange:()=>()=>{}};
  return render(<MemoryRouter initialEntries={['/app/trips/kyoto-nara-classic'+query]}>
    <AppProvider services={services as never}><Routes><Route path="/app/trips/:slug" element={<AppTrip/>}/></Routes></AppProvider>
  </MemoryRouter>);
}
describe('连续路线详情与班次锁定',()=>{
  it('最近班次不是最低价，两个预约入口传递展示报价的同一个 ID',async()=>{
    page();
    await waitFor(()=>expect(screen.getAllByRole('link').filter(link=>link.getAttribute('href')?.includes('departureId=nearest'))).toHaveLength(2));
    expect(document.querySelector('.route-booking-bar')).toHaveTextContent('¥8,800');
    expect(document.querySelector('.route-booking-bar')).not.toHaveTextContent('¥8,000');
    expect(screen.queryByRole('tab')).toBeNull();
    for(const section of ['highlights','schedule','prep'])expect(document.getElementById('route-'+section)).toBeVisible();
  });
  it('明确选中的有效班次优先；外路线或过期 ID 不被传递',async()=>{
    const view=page('?departureId=cheaper-later');
    await waitFor(()=>expect(document.querySelector('.route-booking-bar a')).toHaveAttribute('href','/app/booking/kyoto-nara-classic?departureId=cheaper-later'));
    expect(document.querySelector('.route-booking-bar')).toHaveTextContent('¥8,000');
    view.unmount();page('?departureId=past');
    await waitFor(()=>expect(document.querySelector('.route-booking-bar a')).toHaveAttribute('href','/app/booking/kyoto-nara-classic?departureId=nearest'));
  });
  it('公开内容缺失不生成包含费用或服务语言的承诺',async()=>{
    const original=travelRepository.getTrip('kyoto-nara-classic')!;
    vi.spyOn(travelRepository,'getTrip').mockReturnValue({...original,catalogSource:'published',included:[],excluded:[],languages:[],mealOptions:'',suitableFor:[],packingList:[],clothingAdvice:'',friendlyReminders:[],notices:[],timeline:[],summary:''});
    const view=page();
    await waitFor(()=>expect(view.container.querySelector('.route-selected-departure')).toBeInTheDocument());
    expect(view.container.querySelector('.route-detail-grid')).not.toHaveTextContent('往返交通');
    expect(view.container.querySelector('video')).toBeNull();
  });
  it('普通多人订单仅一席折扣，不叠加周末系数',()=>{
    expect(singleSeatQuote({unitPrice:8000,seats:1})).toMatchObject({amountDue:8000,discountAmount:0});
    expect(singleSeatQuote({unitPrice:8800,seats:1,discountPercent:10})).toMatchObject({amountDue:7920,discountAmount:880});
    expect(singleSeatQuote({unitPrice:8800,seats:10,discountPercent:10})).toMatchObject({amountDue:87120,discountAmount:880});
  });
});
