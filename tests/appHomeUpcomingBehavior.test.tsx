import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppHome} from '../src/app/App';
import {AppProvider} from '../src/app/store';
import type {Departure} from '../src/shared/types';

afterEach(cleanup);
const sellable:Departure={id:'home-departure-1',tripSlug:'kyoto-nara-classic',dateLabel:'9月13日',weekend:'本周末',status:'可预订',departureTime:'2099-09-13T00:00:00Z',expectedEndTime:'2099-09-13T10:00:00Z',meetingPointName:'大阪集合点',meetingAddress:'大阪',meetingCoordinates:null,arrivalInstructions:{transit:null,walking:null,driving:null},meetingPhoto:null,meetingPhotoStatus:'待确认',mapStatus:'未连接',price:8123,availableSeats:4,currency:'JPY',taxIncluded:true,inventoryStatus:'权威库存',isSeed:false};

describe('游客首页合并近期出发板块',()=>{
  it('渲染单一整卡链接并把同一班次 ID、价格和库存一起带出',async()=>{
    const services={
      loadSellableDepartures:vi.fn(async()=>({data:[sellable,{...sellable,id:'home-departure-2',departureTime:'2099-09-14T00:00:00Z',price:9999}],error:null})),
      onAuthStateChange:()=>()=>{},
      currentUser:async()=>null,
    };
    render(<MemoryRouter><AppProvider services={services as never}><AppHome/></AppProvider></MemoryRouter>);
    await waitFor(()=>expect(screen.getByText('每席 ¥8,123')).toBeInTheDocument());
    const card=screen.getAllByRole('link').find(link=>link.classList.contains('passenger-upcoming-card'))!;
    expect(card).toHaveAttribute('href','/app/trips/kyoto-nara-classic?departureId=home-departure-1');
    expect(card).toHaveTextContent('余 4');
    expect(document.querySelector('.passenger-route-rail')).toBeNull();
    expect(document.querySelector('.passenger-departure-row')).toBeNull();
  });
});
