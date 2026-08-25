import {useState, type FormEvent} from 'react';
import {PaymentElement,useElements,useStripe} from '@stripe/react-stripe-js';

export function StripePaymentForm({orderId,onComplete}:{orderId:string;onComplete:(orderId:string,status:'succeeded'|'processing')=>void}){
  const stripe=useStripe();
  const elements=useElements();
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!stripe||!elements||submitting)return;
    setSubmitting(true);setError('');
    let result;
    try{result=await stripe.confirmPayment({elements,confirmParams:{return_url:`${window.location.origin}/app/payment-result?order_id=${encodeURIComponent(orderId)}`},redirect:'if_required'});}catch{setError('支付服务连接失败，请稍后重试。');setSubmitting(false);return}
    if(result.error){setError(result.error.message??'支付未完成，请检查付款信息后重试。');setSubmitting(false);return}
    const status=result.paymentIntent?.status;
    if(status==='succeeded'||status==='processing'){onComplete(orderId,status);return}
    setError('支付尚未完成，请检查付款信息后重试。');setSubmitting(false);
  };
  return <form className="stripe-payment form" onSubmit={submit} aria-label="安全支付表单">
    <PaymentElement options={{layout:'tabs'}}/>
    {error&&<div className="danger" role="alert">{error}</div>}
    <button className="button full" disabled={!stripe||!elements||submitting}>{submitting?'正在安全确认支付…':'确认支付'}</button>
    <p className="privacy">卡片资料由 Stripe 安全处理，Japan Travel Weekend 不保存完整卡号或安全码。</p>
  </form>;
}
