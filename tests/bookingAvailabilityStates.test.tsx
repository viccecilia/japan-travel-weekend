import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {BookingPage} from '../src/app/App';
import {AppProvider} from '../src/app/store';
import type {Departure} from '../src/shared/types';

afterEach(()=>{cleanup();vi.restoreAllMocks()});

const departure=(id:string,time:string,price=8800):Departure=>({
  id,
  tripSlug:'kyoto-nara-classic',
  dateLabel:'正式班次',
  weekend:'稍后',
  status:'可预订',
  departureTime:time,
  expectedEndTime:null,
  meetingPointName:'大阪日本桥集合',
  meetingAddress:null,
  meetingCoordinates:null,
  arrivalInstructions:{transit:null,walking:null,driving:null},
  meetingPhoto:null,
  meetingPhotoStatus:'待确认',
  mapStatus:'未连接',
  price,
  availableSeats:4,
  currency:'JPY',
  taxIncluded:true,
  inventoryStatus:'权威库存',
  isSeed:false,
});

function page(loadSellableDepartures:()=>Promise<{data:Departure[];error:string|null}>,entry='/app/booking/kyoto-nara-classic'){
  const services={
    loadSellableDepartures,
    currentUser:async()=>null,
    onAuthStateChange:()=>()=>{},
  };
  return render(<MemoryRouter initialEntries={[entry]}><AppProvider services={services as never}><Routes><Route path="/app/booking/:slug" element={<BookingPage/>}/></Routes></AppProvider></MemoryRouter>);
}

describe('预订班次加载与选择状态',()=>{
  it('展示完整远期和跨年库存，并保留同日多个稳定班次 ID',async()=>{
    page(async()=>({data:[
      departure('nov-morning','2026-11-28T00:00:00Z'),
      departure('jan-morning','2027-01-03T00:00:00Z'),
      departure('jan-afternoon','2027-01-03T05:00:00Z',9800),
    ],error:null}),'/app/booking/kyoto-nara-classic?departureId=jan-afternoon');

    await waitFor(()=>expect(document.querySelectorAll('input[name="departure"]')).toHaveLength(3));
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('input[name="departure"]')).map(input=>input.value)).toEqual(['nov-morning','jan-morning','jan-afternoon']);
    expect(document.querySelector<HTMLInputElement>('input[value="jan-afternoon"]')).toBeChecked();
    expect(screen.getByText('2026年11月')).toBeInTheDocument();
    expect(screen.getByText('2027年1月')).toBeInTheDocument();
  });

  it('区分首次加载中、加载失败和重试成功',async()=>{
    let resolveFirst:(value:{data:Departure[];error:string|null})=>void=()=>{};
    const first=new Promise<{data:Departure[];error:string|null}>(resolve=>{resolveFirst=resolve});
    const loader=vi.fn()
      .mockImplementationOnce(()=>first)
      .mockResolvedValueOnce({data:[departure('recovered','2027-02-01T00:00:00Z')],error:null});
    page(loader);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载可报名班次');
    resolveFirst({data:[],error:'network'});
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法加载班次');
    expect(screen.queryByText('该路线暂无开放班次')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'重新加载'}));
    await waitFor(()=>expect(document.querySelector<HTMLInputElement>('input[value="recovered"]')).toBeChecked());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('刷新失败保留上次库存但禁止继续，恢复成功后解除',async()=>{
    const loader=vi.fn()
      .mockResolvedValueOnce({data:[departure('cached','2027-02-02T00:00:00Z')],error:null})
      .mockResolvedValueOnce({data:[],error:'offline'})
      .mockResolvedValueOnce({data:[departure('fresh','2027-02-03T00:00:00Z')],error:null});
    page(loader);
    await waitFor(()=>expect(document.querySelector<HTMLInputElement>('input[value="cached"]')).toBeChecked());

    fireEvent(window,new Event('online'));
    const warning=await screen.findByRole('alert');
    expect(warning).toHaveTextContent('班次刷新失败');
    expect(document.querySelector<HTMLInputElement>('input[value="cached"]')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'继续填写资料'})).toBeDisabled();

    fireEvent.click(screen.getByRole('button',{name:'重新加载'}));
    await waitFor(()=>expect(document.querySelector<HTMLInputElement>('input[value="fresh"]')).toBeChecked());
    expect(screen.getByRole('button',{name:'继续填写资料'})).toBeEnabled();
  });

  it('未知路线不会静默套用第一条路线',()=>{
    page(async()=>({data:[],error:null}),'/app/booking/not-a-real-route');
    expect(screen.getByText('未找到这条路线，请返回路线列表重新选择。')).toBeInTheDocument();
    expect(screen.queryByText('京都・奈良名所巡り日帰りツアー')).not.toBeInTheDocument();
  });
});
