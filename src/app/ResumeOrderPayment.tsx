import {useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Elements} from '@stripe/react-stripe-js';
import {useApp} from './store';
import {stripeClient,stripeMode} from '../shared/integrations/stripeClient';
import {StripePaymentForm} from './StripePaymentForm';
import {passengerRound1Copy} from '../shared/i18n/passengerRound1';

export function ResumeOrderPayment({orderId}:{orderId:string}){
 const {services,state}=useApp();
 const locale=state.ui.locale??'zh-CN',c=passengerRound1Copy[locale].resumePayment;
 const navigate=useNavigate();
 const [session,setSession]=useState<{orderId:string;clientSecret:string;amount:number}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 async function resume(){
  if(lock.current||!services||stripeMode!=='test'||!stripeClient)return;
  lock.current=true;setBusy(true);setError('');
  try{
   const result=await services.resumePayment({orderId,idempotencyKey:crypto.randomUUID()});
   if(!result||result.orderId!==orderId||!result.clientSecret)throw Error('unavailable');
   setSession(result);
  }catch{setError(c.failed)}
  finally{lock.current=false;setBusy(false)}
 }
 return <section aria-label={c.action}>
  {!session&&<button className="button" disabled={busy||!stripeClient||stripeMode!=='test'} onClick={()=>void resume()}>{busy?c.loading:c.action}</button>}
  {(!stripeClient||stripeMode!=='test')&&<p role="status">{c.unavailable}</p>}
  {error&&<p role="alert">{error}</p>}
  {session&&stripeClient&&<><p>{c.amount.replace('{amount}',session.amount.toLocaleString(locale))}</p><p>{c.security}</p><Elements stripe={stripeClient} options={{clientSecret:session.clientSecret}}><StripePaymentForm locale={locale} orderId={orderId} onComplete={(id,status)=>navigate('/app/payment-result?order_id='+encodeURIComponent(id)+(status==='processing'?'&processing=1':''))}/></Elements></>}
 </section>;
}
