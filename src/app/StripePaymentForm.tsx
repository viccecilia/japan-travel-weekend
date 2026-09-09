import {useState, type FormEvent} from 'react';
import {PaymentElement,useElements,useStripe} from '@stripe/react-stripe-js';
import type {PassengerLocale} from '../shared/i18n/passengerLocale';

const copy:Record<PassengerLocale,{form:string;connection:string;failed:string;incomplete:string;confirming:string;confirm:string;privacy:string}>={
  'zh-CN':{form:'安全支付表单',connection:'支付服务连接失败，请稍后重试。',failed:'支付未完成，请检查付款信息后重试。',incomplete:'支付尚未完成，请勿重复付款。',confirming:'正在安全确认支付…',confirm:'确认支付',privacy:'卡片资料由 Stripe 安全处理，Japan Travel Weekend 不保存完整卡号或安全码。'},
  'zh-TW':{form:'安全付款表單',connection:'付款服務連線失敗，請稍後再試。',failed:'付款未完成，請檢查付款資訊後再試。',incomplete:'付款尚未完成，請勿重複付款。',confirming:'正在安全確認付款…',confirm:'確認付款',privacy:'卡片資料由 Stripe 安全處理，Japan Travel Weekend 不儲存完整卡號或安全碼。'},
  ja:{form:'安全な支払いフォーム',connection:'決済サービスに接続できません。しばらくしてからお試しください。',failed:'支払いが完了しませんでした。入力内容をご確認ください。',incomplete:'支払いは未完了です。重複して支払わないでください。',confirming:'安全に支払いを確認中…',confirm:'支払いを確定',privacy:'カード情報はStripeが安全に処理し、当社は完全なカード番号やセキュリティコードを保存しません。'},
  en:{form:'Secure payment form',connection:'Could not connect to the payment service. Try again later.',failed:'Payment was not completed. Check your payment details and try again.',incomplete:'Payment is not complete. Do not pay again.',confirming:'Securely confirming payment…',confirm:'Confirm payment',privacy:'Card details are securely handled by Stripe. Japan Travel Weekend does not store full card numbers or security codes.'},
  es:{form:'Forma de pago seguro',connection:'No se ha podido conectar con el servicio de pago. Inténtalo de nuevo más tarde.',failed:'El pago no se ha completado. Comprueba tus datos de pago e inténtalo de nuevo.',incomplete:'El pago no está completo. No volver a pagar.',confirming:'Confirmando el pago de forma segura...',confirm:'Confirmar pago',privacy:'Stripe gestiona de forma segura los datos de la tarjeta. Japan Travel Weekend no almacena números de tarjeta completos ni códigos de seguridad.'},
  vi:{form:'Biểu mẫu thanh toán an toàn',connection:'Không thể kết nối dịch vụ thanh toán. Vui lòng thử lại sau.',failed:'Thanh toán chưa hoàn tất. Hãy kiểm tra thông tin và thử lại.',incomplete:'Thanh toán chưa hoàn tất. Không thanh toán lại.',confirming:'Đang xác nhận thanh toán an toàn…',confirm:'Xác nhận thanh toán',privacy:'Thông tin thẻ được Stripe xử lý an toàn. Japan Travel Weekend không lưu toàn bộ số thẻ hoặc mã bảo mật.'},
  ne:{form:'सुरक्षित भुक्तानी फाराम',connection:'भुक्तानी सेवामा जडान भएन। पछि फेरि प्रयास गर्नुहोस्।',failed:'भुक्तानी पूरा भएन। विवरण जाँच गरी फेरि प्रयास गर्नुहोस्।',incomplete:'भुक्तानी पूरा भएको छैन। दोहोर्‍याएर नतिर्नुहोस्।',confirming:'भुक्तानी सुरक्षित रूपमा पुष्टि हुँदैछ…',confirm:'भुक्तानी पुष्टि',privacy:'कार्ड विवरण Stripe ले सुरक्षित रूपमा प्रशोधन गर्छ। Japan Travel Weekend ले पूरा कार्ड नम्बर वा सुरक्षा कोड राख्दैन।'},
  ko:{form:'안전 결제 양식',connection:'결제 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',failed:'결제가 완료되지 않았습니다. 결제 정보를 확인하고 다시 시도해 주세요.',incomplete:'결제가 완료되지 않았습니다. 중복 결제하지 마세요.',confirming:'안전하게 결제를 확인하는 중…',confirm:'결제 확인',privacy:'카드 정보는 Stripe가 안전하게 처리하며 Japan Travel Weekend는 전체 카드 번호나 보안 코드를 저장하지 않습니다.'}
};

export function StripePaymentForm({orderId,onComplete,locale='zh-CN'}:{orderId:string;onComplete:(orderId:string,status:'succeeded'|'processing')=>void;locale?:PassengerLocale}){
  const c=copy[locale];
  const stripe=useStripe();
  const elements=useElements();
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!stripe||!elements||submitting)return;
    setSubmitting(true);setError('');
    let result;
    try{result=await stripe.confirmPayment({elements,confirmParams:{return_url:`${window.location.origin}/app/payment-result?order_id=${encodeURIComponent(orderId)}`},redirect:'if_required'});}catch{setError(c.connection);setSubmitting(false);return}
    if(result.error){setError(result.error.message??c.failed);setSubmitting(false);return}
    const status=result.paymentIntent?.status;
    if(status==='succeeded'||status==='processing'){onComplete(orderId,status);return}
    setError(c.incomplete);setSubmitting(false);
  };
  return <form className="stripe-payment form" onSubmit={submit} aria-label={c.form}>
    <PaymentElement options={{layout:'tabs'}}/>
    {error&&<div className="danger" role="alert">{error}</div>}
    <button className="button full" disabled={!stripe||!elements||submitting}>{submitting?c.confirming:c.confirm}</button>
    <p className="privacy">{c.privacy}</p>
  </form>;
}
