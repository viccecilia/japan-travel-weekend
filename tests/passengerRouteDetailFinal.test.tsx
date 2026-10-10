import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppShell,RouteDetailV2} from '../src/app/App';
import {AppProvider} from '../src/app/store';
import type {Departure,Trip} from '../src/shared/types';
import type {PassengerLocale} from '../src/shared/i18n/passengerLocale';

afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks()});

const departure=(id:string,day:number,price:number):Departure=>({
  id,tripSlug:'route-final-test',dateLabel:'正式班次',weekend:'本周末',status:'可预订',
  departureTime:`2099-10-${String(day).padStart(2,'0')}T00:00:00Z`,expectedEndTime:`2099-10-${String(day).padStart(2,'0')}T09:00:00Z`,
  meetingPointName:'大阪集合点',meetingAddress:'大阪',meetingCoordinates:null,arrivalInstructions:{transit:null,walking:null,driving:null},
  meetingPhoto:null,meetingPhotoStatus:'已确认',mapStatus:'已连接',price,availableSeats:8,salesCloseAt:'2099-10-31T00:00:00Z',
  currency:'JPY',taxIncluded:true,inventoryStatus:'权威库存',isSeed:false,
});

const localeText:Record<PassengerLocale,{title:string;summary:string;stop:string;intro:string;ordinary:string}>={
  'zh-CN':{title:'中文路线',summary:'中文路线简介',stop:'中文景点',intro:'中文景点简介',ordinary:'自由活动'},
  'zh-TW':{title:'繁中路線',summary:'繁中路線簡介',stop:'繁中景點',intro:'繁中景點簡介',ordinary:'自由活動'},
  ja:{title:'日本語ルート',summary:'日本語の紹介',stop:'日本語スポット',intro:'日本語の案内',ordinary:'自由時間'},
  en:{title:'English route',summary:'English route summary',stop:'English stop',intro:'English stop summary',ordinary:'Free time'},
  ko:{title:'한국어 노선',summary:'한국어 소개',stop:'한국어 명소',intro:'한국어 명소 소개',ordinary:'자유 시간'},
  es:{title:'Ruta española',summary:'Resumen en español',stop:'Lugar español',intro:'Descripción española',ordinary:'Tiempo libre'},
  vi:{title:'Tuyến tiếng Việt',summary:'Giới thiệu tiếng Việt',stop:'Điểm tiếng Việt',intro:'Mô tả tiếng Việt',ordinary:'Thời gian tự do'},
  ne:{title:'नेपाली मार्ग',summary:'नेपाली परिचय',stop:'नेपाली स्थान',intro:'नेपाली स्थान परिचय',ordinary:'स्वतन्त्र समय'},
};

function tripFor(locale:PassengerLocale,{video=true,audio=true}:{video?:boolean;audio?:boolean}={}):Trip{
  const value=localeText[locale];
  const base:Trip={
    id:'route-final-test-id',slug:'route-final-test',title:'中文路线',shortTitle:'中文路线',subtitle:'',summary:'中文路线简介',description:'',
    heroTitle:'中文路线',heroSubtitle:'中文路线简介',departureCity:'大阪出发',region:'大阪',duration:'10小时',walkingLevel:'中等',categories:[],
    heroImage:'/poster.jpg',gallery:[],highlights:[],stops:['中文景点','自由活动'],
    timeline:[
      {id:'spot-1',attractionId:'spot-one',selectedImageIds:['image-1','image-2'],time:'09:00',title:'中文景点',subtitle:'',detail:'中文景点简介',shortDescription:'中文景点简介',location:'京都',stayMinutes:120,gallery:[]},
      {id:'ordinary-1',time:'',title:'自由活动',subtitle:'',detail:'自行游览',shortDescription:'自行游览',location:'京都',stayMinutes:50},
    ],
    meetingPoint:null,departureTime:null,returnTime:null,price:null,priceStatus:'待公布',minimumGuests:null,maximumGuests:null,availableSeats:null,seatStatus:'未开放',
    included:['往返车辆'],excluded:['午餐'],preparation:[],languages:[],mealOptions:'',childPolicy:'儿童规则',luggagePolicy:'行李规则',suitableFor:[],notices:[],
    bookingNotice:'服务时间规则',participantRules:'儿童规则',weatherNotice:'天气规则',baggageNotice:'行李规则',cancellationPolicy:'取消规则',
    packingList:[],clothingAdvice:'',friendlyReminders:[],assistanceStatus:'',weatherPolicy:'',sourceUrl:'',imageCredits:[],status:'标准路线',catalogSource:'published',
    localizedContent:{
      [locale]:{title:value.title,heroTitle:value.title,summary:value.summary,heroSubtitle:value.summary,departureCity:locale==='en'?'Departing Osaka':'大阪出发',included:{one:'Transport'},excluded:{one:'Lunch'},itinerary:{'spot-1':{stop_title:value.stop,shortDescription:value.intro},'ordinary-1':{stop_title:value.ordinary,shortDescription:value.ordinary}}},
    },
  };
  if(video)base.heroVideo={url:'/route.mp4',storagePath:'routes/route.mp4',posterUrl:'/poster.jpg',mimeType:'video/mp4',sizeBytes:100};
  if(!audio)base.bookingNotice='';
  return base;
}

const policies={
  global:{templateKey:'global',versionId:'global-v3',version:3,sections:{
    section_02:{title:'Children',body:'Children and fee policy.'},section_07:{title:'Weather',body:'Weather and itinerary adjustment policy.'},
    section_10:{title:'Luggage',body:'Luggage policy.'},section_12:{title:'Belongings',body:'Personal belongings policy.'},
  }},
  service_time:{templateKey:'service',versionId:'service-v3',version:3,sections:{short_product_notice:{title:'Service',body:'Service time and lateness policy.'}}},
  cancellation:{templateKey:'cancel',versionId:'cancel-v3',version:3,sections:{cancellation:{title:'Cancel',body:'Cancellation and refund policy.'}}},
};

function services(locale:PassengerLocale,{audio=true,mediaError=false}:{audio?:boolean;mediaError?:boolean}={}){
  return {
    loadSellableDepartures:async()=>({data:[],error:null}),currentUser:async()=>null,onAuthStateChange:()=>()=>{},
    catalog:{loadRoutePoliciesBySlug:vi.fn(async()=>({status:'available' as const,policies}))},
    loadAttractionGuide:vi.fn(async(_id:string,requestedLocale:string)=>({data:{title:`CMS ${requestedLocale} title`,body:`CMS ${requestedLocale} body. More guide text.`,audioUrl:audio?`/${requestedLocale}.mp3`:null},error:null})),
    loadAttractionMedia:vi.fn(async()=>mediaError?Promise.reject(new Error('media unavailable')):({data:[{id:'image-1',mediaType:'image' as const,url:'/one.jpg'},{id:'image-2',mediaType:'image' as const,url:'/two.jpg'},{id:'video-1',mediaType:'video' as const,url:'/spot.mp4'}],error:null})),
  };
}

function view(locale:PassengerLocale='zh-CN',options:{video?:boolean;audio?:boolean;mediaError?:boolean;departures?:Departure[]}={}){
  const service=services(locale,{audio:options.audio,mediaError:options.mediaError});
  const route=tripFor(locale,{video:options.video,audio:options.audio});
  const departures=options.departures??[departure('first',18,9800),departure('second',21,9900)];
  return {service,...render(<MemoryRouter initialEntries={['/app/trips/route-final-test']}><AppProvider services={service as never}><RouteDetailV2 trip={route} locale={locale} departures={departures}/></AppProvider></MemoryRouter>)};
}

describe('Passenger Route Detail Final Polish',()=>{
  it('removes the route-detail back arrow and keeps the shared header and route Bottom Nav',()=>{
    const route=tripFor('zh-CN');
    render(<MemoryRouter initialEntries={['/app/trips/route-final-test']}><AppProvider><AppShell nav><RouteDetailV2 trip={route} locale="zh-CN" departures={[]}/></AppShell></AppProvider></MemoryRouter>);
    expect(screen.queryByRole('button',{name:'返回'})).not.toBeInTheDocument();
    expect(screen.getByText('Japan Travel Weekend')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'精选线路'})).toHaveAttribute('aria-current','page');
  });

  it('renders the route Hero video with poster and falls back to the Hero image without a video',()=>{
    const first=view('zh-CN');
    const video=first.container.querySelector('.route-v2-hero>video');
    expect(video).toHaveAttribute('poster','/poster.jpg');expect(video).toHaveAttribute('autoplay');expect(video).toHaveAttribute('loop');
    expect(screen.getByLabelText('播放视频')).toHaveTextContent('路线视频');
    first.unmount();
    const fallback=view('zh-CN',{video:false});
    expect(fallback.container.querySelector('.route-v2-hero>video')).toBeNull();
    expect(fallback.container.querySelector('.route-v2-hero')).toHaveStyle('background-image: url("/poster.jpg")');
  });

  it('has no BOOKING label, selects a departure, updates price, and handles an empty departure feed',()=>{
    const first=view('zh-CN');
    expect(screen.queryByText('BOOKING')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('¥9,900').closest('button')!);
    expect(screen.getByText(/¥9,900/,{selector:'.route-booking-sticky b'})).toBeInTheDocument();
    for(const link of screen.getAllByRole('link',{name:'立即预订'}))expect(link).toHaveAttribute('href','/app/booking/route-final-test?departureId=second');
    first.unmount();
    view('zh-CN',{departures:[]});
    expect(screen.getByText('目前暂无可报名班次')).toBeInTheDocument();
    expect(screen.getByText('新的出发日期准备中')).toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'立即预订'})).not.toBeInTheDocument();
  });

  it('renders the itinerary once, preserves ordinary RouteStops, and removes all old duplicate headings',()=>{
    view('zh-CN');
    expect(screen.getAllByRole('heading',{name:'行程安排'})).toHaveLength(1);
    expect(screen.getByRole('heading',{name:'自由活动'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'自由活动'}).closest('article')?.querySelector('time')).toBeNull();
    for(const old of ['今日路线','今日行程','详细行程'])expect(screen.queryByText(old)).not.toBeInTheDocument();
    expect(document.querySelectorAll('.route-v2-spot')).toHaveLength(1);
  });

  it('handles an unavailable departure without exposing a fake booking CTA',()=>{
    const paused:Departure={...departure('paused',18,9800),price:null,inventoryStatus:'尚未发布'};
    view('zh-CN',{departures:[paused]});
    expect(screen.getByText('目前暂无可报名班次')).toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'立即预订'})).not.toBeInTheDocument();
    expect(document.querySelector('.route-booking-sticky')).toHaveTextContent('请选择出发日期');
  });

  it('uses current-locale Attraction CMS content, 16:9 photos, a real gallery counter, audio, and no spot video',async()=>{
    const rendered=view('en');
    await waitFor(()=>expect(screen.getAllByRole('heading',{name:'CMS en title'})).toHaveLength(2));
    expect(screen.getAllByText(/CMS en body/)).toHaveLength(2);
    expect(rendered.service.loadAttractionGuide).toHaveBeenCalledWith('spot-one','en');
    const card=screen.getAllByRole('heading',{name:'CMS en title'}).find(element=>element.closest('.route-v2-spot'))!.closest('.route-v2-spot')!;
    expect(card.querySelector('.route-v2-spot-media')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('1 / 2')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole('button',{name:'Audio guide'})).toBeInTheDocument();
    expect(card.querySelector('video')).toBeNull();
    expect(within(card as HTMLElement).getByText('SPOT 01')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole('link',{name:'View full attraction guide →'})).toHaveAttribute('href',expect.stringContaining('/app/attractions/spot-one'));
  });

  it('hides the audio module when the current locale has no published audio URL',async()=>{
    view('en',{audio:false});
    await waitFor(()=>expect(screen.getAllByRole('heading',{name:'CMS en title'})).toHaveLength(2));
    expect(screen.queryByRole('button',{name:'Audio guide'})).not.toBeInTheDocument();
  });

  it('keeps current-locale guide text and audio when attraction media loading fails',async()=>{
    view('en',{mediaError:true});
    await waitFor(()=>expect(screen.getAllByRole('heading',{name:'CMS en title'})).toHaveLength(2));
    expect(screen.getAllByText('CMS en body. More guide text.')).toHaveLength(2);
    expect(screen.getByRole('button',{name:'Audio guide'})).toBeInTheDocument();
  });

  it('renders two fee cards, exactly five policy summaries, and one full-policy entry without dumping all 17 rules',async()=>{
    view('en');
    await waitFor(()=>expect(screen.getByRole('heading',{name:'What is included'})).toBeInTheDocument());
    expect(document.querySelectorAll('.route-fees-section .route-v2-info-grid>article')).toHaveLength(2);
    for(const label of ['Service time and lateness','Children and fees','Luggage and belongings','Weather and itinerary changes','Cancellation and refunds'])expect(screen.getByRole('button',{name:label})).toBeInTheDocument();
    expect(document.querySelectorAll('.route-policy-summary .passenger-accordion')).toHaveLength(5);
    expect(screen.getByRole('link',{name:'View all travel rules →'})).toHaveAttribute('href','/legal/travel-conditions');
    expect(document.querySelectorAll('.route-policy-summary .passenger-accordion')).not.toHaveLength(17);
  });

  for(const locale of ['zh-CN','ja','en','es'] as const)it(`localizes route, attraction, audio, booking, and policy labels for ${locale}`,async()=>{
    const rendered=view(locale);
    expect(screen.getByRole('heading',{name:localeText[locale].title})).toBeInTheDocument();
    expect(screen.getByText(localeText[locale].summary)).toBeInTheDocument();
    await waitFor(()=>expect(screen.getAllByRole('heading',{name:`CMS ${locale} title`})).toHaveLength(2));
    expect(screen.getAllByText(`CMS ${locale} body. More guide text.`)).toHaveLength(2);
    expect(rendered.service.loadAttractionGuide).toHaveBeenCalledWith('spot-one',locale);
    expect(document.querySelector('.route-inline-audio')).toBeInTheDocument();
    expect(document.querySelector('.route-booking-sticky a')).toBeInTheDocument();
    expect(document.querySelectorAll('.route-policy-summary .passenger-accordion')).toHaveLength(5);
  });
});
