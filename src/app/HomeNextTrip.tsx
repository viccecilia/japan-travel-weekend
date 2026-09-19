import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useApp} from './store';
import {passengerOrderCopy} from '../shared/i18n/passengerLocale';
import {homeV3Labels} from './homeV3Copy';

type UpcomingOrder={id:string;title:string;departsAt:string;meetingName:string|null};

/** Read the order snapshot, not the sellable catalogue: paid trips may be sold out. */
export function HomeNextTrip(){
  const {state,services}=useApp();
  const locale=state.ui.locale??'zh-CN';
  const c=passengerOrderCopy[locale];
  const [result,setResult]=useState<{next:UpcomingOrder|null;error:boolean;loaded:boolean}>({next:null,error:false,loaded:false});
  useEffect(()=>{
    let active=true;
    if(!services||!state.user)return;
    const load=async()=>{
      try{
        const orders=await services.loadOwnOrders();
        if(orders.error)throw new Error(orders.error);
        const eligible=orders.data.filter(order=>['paid','confirmed'].includes(String(order.status)));
        const snapshots=await Promise.all(eligible.map(async order=>{
          const billing=await services.loadOwnOrderBilling(String(order.id));
          return billing?.departsAt&&billing.title?{id:String(order.id),title:billing.title,departsAt:billing.departsAt,meetingName:billing.meetingName}:null;
        }));
        const next=snapshots.filter((item):item is UpcomingOrder=>Boolean(item)&&new Date(item!.departsAt).getTime()>=Date.now())
          .sort((a,b)=>Date.parse(a.departsAt)-Date.parse(b.departsAt))[0]??null;
        if(active)setResult({next,error:snapshots.some(item=>item===null),loaded:true});
      }catch{if(active)setResult({next:null,error:true,loaded:true})}
    };
    void load();
    window.addEventListener('focus',load);
    return()=>{active=false;window.removeEventListener('focus',load)};
  },[services,state.user]);
  if(!state.user||!services)return null;
  if(!result.loaded)return <p role="status">{c.title} · …</p>;
  if(result.error)return <Link className="home-v3-next" to="/app/orders">{c.title} → <small>{locale==='zh-CN'?'行程摘要暂不可用，请查看订单': '—'}</small></Link>;
  if(!result.next)return null;
  return <Link className="home-v3-next" to={`/app/orders/${encodeURIComponent(result.next.id)}`}>
    <small>{c.trips}</small><b>{result.next.title}</b>
    <time dateTime={result.next.departsAt}>{new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(new Date(result.next.departsAt))}</time>
    {result.next.meetingName&&<span>{result.next.meetingName}</span>}
  </Link>;
}

export function HomeBenefits(){
  const {state,services}=useApp();const locale=state.ui.locale??'zh-CN';
  const [coupons,setCoupons]=useState<number|null>(null);
  useEffect(()=>{
    let active=true;
    if(services&&state.user)void services.loadOwnReferralSummary().then(value=>{
      if(active&&value)setCoupons(value.coupons.filter(c=>c.status==='active'&&Date.parse(c.expiresAt)>Date.now()).length);
    }).catch(()=>{});
    return()=>{active=false};
  },[services,state.user]);
  const copy={
    'zh-CN':['优惠券','推荐记录','等级与旅行金以权益中心已核对记录为准'],
    'zh-TW':['優惠券','推薦記錄','等級及旅行金以權益中心已核對記錄為準'],
    ja:['クーポン','紹介履歴','特典センターで確認済みの情報をご確認ください'],
    en:['Coupons','Referrals','View verified benefits in the benefits centre'],
    es:['Cupones','Referidos','Consulta los beneficios verificados en el centro'],
    vi:['Phiếu giảm giá','Giới thiệu','Xem quyền lợi đã xác nhận tại trung tâm'],
    ne:['कुपन','सिफारिस','लाभ केन्द्रमा प्रमाणित विवरण हेर्नुहोस्'],
    ko:['쿠폰','추천 기록','혜택 센터에서 확인된 내역을 확인하세요'],
  }[locale];
  return <section className="home-v3-benefits"><h2>{homeV3Labels(locale)[3]}</h2>
    <p>{copy[2]}</p><nav><Link to="/app/rewards">{copy[0]}{coupons!==null?` · ${coupons}`:''} →</Link><Link to="/app/referral">{copy[1]} →</Link></nav>
  </section>;
}
