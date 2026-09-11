import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  Navigate,
  NavLink,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { travelRepository } from "../shared/data/repository";
import { backend } from "../shared/backend";
import { TripCard } from "../shared/components/TripCard";
import { appConfig, nextTier, tierFor } from "../shared/config/businessRules";
import {
  describeAssistance,
  describeChildSeat,
  emptyAssistance,
} from "../shared/services/passengerAssistance";
import type { ChildSeatChoice } from "../shared/types";
import { GoogleMapsAdapter } from "../shared/integrations/googleMaps";
import { useApp, useOptionalApp } from "./store";
import { accessDestinationPath, isPassengerOnlyPath, passengerAccountBoundaryPath, referralCodeFromSearch, safeReturnTo } from "./auth";
import { seatOrderTotal } from "../shared/services/pricing";
import { Elements } from "@stripe/react-stripe-js";
import { stripeClient,stripeMode } from "../shared/integrations/stripeClient";
import { StripePaymentForm } from "./StripePaymentForm";
import {passengerPaymentCopy,paymentState} from '../shared/i18n/passengerPayment';
import { passengerBookingCopy, passengerCheckoutCopy, passengerCoreCopy, passengerFormCopy, passengerHomeCopy, passengerLocales, passengerLoginCopy, passengerOrderCopy, passengerRoutesCopy } from "../shared/i18n/passengerLocale";
import type {PassengerLocale} from '../shared/i18n/passengerLocale';
import { featuredRoutePitch, featuredRouteSpots } from "../shared/i18n/spotContent";
import {expandedRouteSummary} from '../shared/i18n/routeExpansion';
import {RoutePlacePhoto} from '../shared/components/RoutePlacePhoto';
import {routePhotoAt} from '../shared/data/routePhotoCatalog';
import {groupDeparturesByMonth, resolveDepartureSelection} from './bookingDepartureSelection';
import {singleSeatQuote} from '../shared/services/singleSeatPricing';
import type {ServerQuote} from '../shared/backend/testApi';
const trips = travelRepository.listTrips();
const orderStatusLabels:Record<string,Record<string,string>>={
 'zh-CN':{pending_payment:'等待在线支付',pending_manual_review:'等待人工确认到账',paid:'已支付',confirmed:'行程已确认',payment_review:'付款需要人工核对',refunded:'已退款',cancelled:'已取消',expired:'支付时限已过'},
 'zh-TW':{pending_payment:'等待線上付款',pending_manual_review:'等待人工確認到帳',paid:'已付款',confirmed:'行程已確認',payment_review:'付款需要人工核對',refunded:'已退款',cancelled:'已取消',expired:'付款期限已過'},
 ja:{pending_payment:'オンライン決済待ち',pending_manual_review:'入金確認待ち',paid:'支払済み',confirmed:'旅程確定',payment_review:'支払い確認が必要',refunded:'返金済み',cancelled:'取消済み',expired:'支払期限切れ'},
 en:{pending_payment:'Awaiting online payment',pending_manual_review:'Awaiting transfer confirmation',paid:'Paid',confirmed:'Trip confirmed',payment_review:'Payment review required',refunded:'Refunded',cancelled:'Cancelled',expired:'Payment deadline expired'},
 es:{pending_payment:'Pendiente de pago en línea',pending_manual_review:'A la espera de la confirmación de la transferencia',paid:'Pagado',confirmed:'Viaje confirmado',payment_review:'Se requiere revisión del pago',refunded:'Reembolsado',cancelled:'Cancelada',expired:'Fecha límite de pago vencida'},
 vi:{pending_payment:'Chờ thanh toán trực tuyến',pending_manual_review:'Chờ xác nhận chuyển khoản',paid:'Đã thanh toán',confirmed:'Đã xác nhận chuyến',payment_review:'Cần kiểm tra thanh toán',refunded:'Đã hoàn tiền',cancelled:'Đã hủy',expired:'Hết hạn thanh toán'},
 ne:{pending_payment:'अनलाइन भुक्तानी बाँकी',pending_manual_review:'ट्रान्सफर पुष्टिको प्रतीक्षा',paid:'भुक्तानी भयो',confirmed:'यात्रा पुष्टि भयो',payment_review:'भुक्तानी समीक्षा आवश्यक',refunded:'फिर्ता भयो',cancelled:'रद्द भयो',expired:'भुक्तानी समय सकियो'},
 ko:{pending_payment:'온라인 결제 대기',pending_manual_review:'입금 확인 대기',paid:'결제 완료',confirmed:'여행 확정',payment_review:'결제 확인 필요',refunded:'환불 완료',cancelled:'취소됨',expired:'결제 기한 만료'},
};
const localizedOrderStatus=(locale:string,status:string)=>orderStatusLabels[locale]?.[status]??status;
const orderJourneyCopy=(locale:string)=>locale==='ja'?{paid:'お支払い完了',publish:'以降、車両・司導・集合場所とツアーチャットをご確認いただけます。',vehicle:'車両番号',staff:'司導',help:'取消をご希望ですか？取消条件を確認',helpText:'申請前に返金見込みを表示します。24時間以上前は100%、24時間未満は原則0%です。',consult:'まずサポートに相談',change:'日程変更を相談',continueCancel:'取消申請へ進む'}:locale==='en'?{paid:'Payment successful',publish:'Vehicle, guide, meeting details and the trip chat will be available from this time.',vehicle:'Vehicle',staff:'Driver/guide',help:'Need to cancel? View cancellation rules',helpText:'We show the estimated refund before submission: 100% at least 24 hours before departure and normally 0% within 24 hours. A request does not trigger an instant refund.',consult:'Contact support first',change:'Ask to change date',continueCancel:'Continue cancellation request'}:{paid:'付款成功',publish:'起可查看车牌、司导、集合地点并进入旅行群。',vehicle:'车牌号',staff:'司导',help:'需要取消行程？查看取消规则',helpText:'系统会先根据日本时间计算预计退款。距出发24小时以上为100%；不足24小时原则上为0%。提交申请不会立即退款。',consult:'先咨询客服',change:'申请改期',continueCancel:'继续申请取消'};
const reviewStatusLabels:Record<string,Record<string,string>>={
 'zh-CN':{not_requested:'未提出',reviewing:'确认中',manual_contact:'需人工联系',confirmed:'已确认',unavailable:'无法提供'},
 'zh-TW':{not_requested:'未提出',reviewing:'確認中',manual_contact:'需人工聯絡',confirmed:'已確認',unavailable:'無法提供'},
 ja:{not_requested:'申請なし',reviewing:'確認中',manual_contact:'個別連絡が必要',confirmed:'確認済み',unavailable:'提供不可'},
 en:{not_requested:'Not requested',reviewing:'Under review',manual_contact:'Manual contact required',confirmed:'Confirmed',unavailable:'Unavailable'},
 es:{not_requested:'No solicitado',reviewing:'En revisión',manual_contact:'Requiere contacto',confirmed:'Confirmado',unavailable:'No disponible'},
 vi:{not_requested:'Chưa yêu cầu',reviewing:'Đang kiểm tra',manual_contact:'Cần liên hệ trực tiếp',confirmed:'Đã xác nhận',unavailable:'Không thể cung cấp'},
 ne:{not_requested:'अनुरोध गरिएको छैन',reviewing:'जाँच हुँदैछ',manual_contact:'प्रत्यक्ष सम्पर्क आवश्यक',confirmed:'पुष्टि भयो',unavailable:'उपलब्ध छैन'},
 ko:{not_requested:'요청 없음',reviewing:'확인 중',manual_contact:'직접 연락 필요',confirmed:'확인 완료',unavailable:'제공 불가'}
};
const localizedReviewStatus=(locale:string,status:string)=>reviewStatusLabels[locale]?.[status]??status;
const homeExtraCopy={
 'zh-CN':{notice:'查看通知',member:'会员信息',quick:'常用功能',ai:'AI随行',benefits:'会员权益',weekend:['本周末','下周末','稍后'],tier:'探索者',foodTag:'当地餐食',food:'京都与奈良的一日用餐建议',foodTime:'6 分钟阅读',meetTag:'集合指南',meet:'第一次参加巴士一日游怎么准备',meetTime:'4 分钟阅读'},
 'zh-TW':{notice:'查看通知',member:'會員資訊',quick:'常用功能',ai:'AI 隨行',benefits:'會員權益',weekend:['本週末','下週末','稍後'],tier:'探索者',foodTag:'當地餐食',food:'京都與奈良一日用餐建議',foodTime:'閱讀 6 分鐘',meetTag:'集合指南',meet:'第一次參加巴士一日遊如何準備',meetTime:'閱讀 4 分鐘'},
 ja:{notice:'通知を見る',member:'会員情報',quick:'よく使う機能',ai:'AI旅ガイド',benefits:'会員特典',weekend:['今週末','来週末','以降'],tier:'エクスプローラー',foodTag:'現地グルメ',food:'京都・奈良の日帰り食事ガイド',foodTime:'6分で読めます',meetTag:'集合ガイド',meet:'初めてのバス日帰り旅行の準備',meetTime:'4分で読めます'},
 en:{notice:'View notifications',member:'Membership information',quick:'Quick actions',ai:'AI companion',benefits:'Member benefits',weekend:['This weekend','Next weekend','Later'],tier:'Explorer',foodTag:'LOCAL FOOD',food:'Where to eat on a Kyoto and Nara day trip',foodTime:'6 min read',meetTag:'MEETING GUIDE',meet:'How to prepare for your first bus day trip',meetTime:'4 min read'},
 es:{notice:'Ver notificaciones',member:'Información sobre la suscripción',quick:'Acciones rapidas',ai:'Compañero de IA',benefits:'Beneficios para los socios ',weekend:['Este fin de semana','El próximo fin de semana','Más tarde'],tier:'Explorar',foodTag:'Comida local',food:'Dónde comer en una excursión de un día a Kioto y Nara',foodTime:'6 min de lectura',meetTag:'GUÍA DE LA REUNIÓN ',meet:'Cómo prepararte para tu primer viaje de un día en autobús',meetTime:'4 min de lectura'},
 vi:{notice:'Xem thông báo',member:'Thông tin thành viên',quick:'Truy cập nhanh',ai:'Bạn đồng hành AI',benefits:'Quyền lợi thành viên',weekend:['Cuối tuần này','Cuối tuần sau','Sau đó'],tier:'Người khám phá',foodTag:'ẨM THỰC',food:'Gợi ý ăn uống trong ngày ở Kyoto và Nara',foodTime:'Đọc 6 phút',meetTag:'HƯỚNG DẪN TẬP TRUNG',meet:'Chuẩn bị cho chuyến xe buýt trong ngày đầu tiên',meetTime:'Đọc 4 phút'},
 ne:{notice:'सूचना हेर्नुहोस्',member:'सदस्य जानकारी',quick:'छिटो पहुँच',ai:'AI सहयात्री',benefits:'सदस्य सुविधा',weekend:['यो सप्ताहन्त','अर्को सप्ताहन्त','पछि'],tier:'अन्वेषक',foodTag:'स्थानीय खाना',food:'क्योटो र नाराको एकदिने खानपान सुझाव',foodTime:'६ मिनेट पढाइ',meetTag:'भेट्ने निर्देशिका',meet:'पहिलो बस एकदिने यात्राको तयारी',meetTime:'४ मिनेट पढाइ'},
 ko:{notice:'알림 보기',member:'회원 정보',quick:'빠른 메뉴',ai:'AI 동행',benefits:'회원 혜택',weekend:['이번 주말','다음 주말','추후'],tier:'탐험가',foodTag:'현지 음식',food:'교토·나라 당일치기 식사 추천',foodTime:'6분 읽기',meetTag:'집합 안내',meet:'첫 버스 당일치기 여행 준비 방법',meetTime:'4분 읽기'},
} as const;
const tripHomeCopy:Record<string,Record<string,{name:string;region:string;duration:string;stops:string[]}>>={
 en:{'kyoto-nara-classic':{name:'Kyoto & Nara',region:'Kyoto and Nara',duration:'9–10 hours',stops:['Kiyomizu-dera','Fushimi Inari Taisha','Nara Park']},'amanohashidate-ine':{name:'Amanohashidate & Ine',region:'Northern Kyoto',duration:'10–11 hours',stops:['Amanohashidate','Chionji Temple','Ine Funaya']},'biwako-shirahige':{name:'Lake Biwa M Route',region:'Shiga',duration:'10–11 hours',stops:['Shirahige Shrine','Lake Biwa Terrace','La Collina Omihachiman']}},
 es:{'kyoto-nara-classic':{name:'Kioto y Nara',region:'Kioto y Nara',duration:'9–10 horas',stops:['Templo Kiyomizu-dera','Santuario Fushimi Inari Taisha','Parque de Nara']},'amanohashidate-ine':{name:'Amanohashidate e Ine',region:'Norte de Kioto',duration:'10–11 horas',stops:['Amanohashidate','Templo Chionji','Casas flotantes de Ine']},'biwako-shirahige':{name:'Lago Biwa y Shirahige',region:'Shiga',duration:'10–11 horas',stops:['Santuario Shirahige','Mirador del lago Biwa','La Collina Omihachiman']}},
 ja:{'kyoto-nara-classic':{name:'京都・奈良',region:'京都・奈良',duration:'約9～10時間',stops:['清水寺','伏見稲荷大社','奈良公園']},'amanohashidate-ine':{name:'天橋立・伊根',region:'京都北部',duration:'約10～11時間',stops:['天橋立','智恩寺','伊根の舟屋']},'biwako-shirahige':{name:'琵琶湖Mコース',region:'滋賀',duration:'約10～11時間',stops:['白鬚神社','びわ湖テラス','ラ コリーナ近江八幡']}},
 'zh-TW':{'kyoto-nara-classic':{name:'京都與奈良',region:'京都與奈良',duration:'約 9–10 小時',stops:['清水寺','伏見稻荷大社','奈良公園']},'amanohashidate-ine':{name:'天橋立與伊根',region:'京都北部',duration:'約 10–11 小時',stops:['天橋立','智恩寺文殊堂','伊根舟屋']},'biwako-shirahige':{name:'琵琶湖 M 線',region:'滋賀',duration:'約 10–11 小時',stops:['白鬚神社','琵琶湖觀景台','La Collina 近江八幡']}},
 vi:{'kyoto-nara-classic':{name:'Kyoto & Nara',region:'Kyoto và Nara',duration:'9–10 giờ',stops:['Chùa Kiyomizu','Fushimi Inari','Công viên Nara']},'amanohashidate-ine':{name:'Amanohashidate & Ine',region:'Bắc Kyoto',duration:'10–11 giờ',stops:['Amanohashidate','Chùa Chionji','Nhà thuyền Ine']},'biwako-shirahige':{name:'Tuyến M hồ Biwa',region:'Shiga',duration:'10–11 giờ',stops:['Đền Shirahige','Đài ngắm hồ Biwa','La Collina Omihachiman']}},
 ne:{'kyoto-nara-classic':{name:'क्योटो र नारा',region:'क्योटो र नारा',duration:'९–१० घण्टा',stops:['कियोमिजु-डेरा','फुशिमी इनारी','नारा पार्क']},'amanohashidate-ine':{name:'अमानोहाशिदाते र इने',region:'उत्तरी क्योटो',duration:'१०–११ घण्टा',stops:['अमानोहाशिदाते','चिओन्जी मन्दिर','इने फुनाया']},'biwako-shirahige':{name:'बिवा ताल M रुट',region:'शिगा',duration:'१०–११ घण्टा',stops:['शिराहिगे मन्दिर','बिवा ताल दृश्यस्थल','ला कोलिना ओमिहाचिमान']}},
 ko:{'kyoto-nara-classic':{name:'교토 & 나라',region:'교토와 나라',duration:'약 9–10시간',stops:['기요미즈데라','후시미 이나리 신사','나라 공원']},'amanohashidate-ine':{name:'아마노하시다테 & 이네',region:'교토 북부',duration:'약 10–11시간',stops:['아마노하시다테','지온지','이네 후나야']},'biwako-shirahige':{name:'비와호 M 코스',region:'시가',duration:'약 10–11시간',stops:['시라히게 신사','비와호 테라스','라 코리나 오미하치만']}},
};
const tripSupplement:Record<string,Record<string,{name:string;region:string;duration:string;stops:string[]}>>={
 en:{'kobe-arima-rokko':{name:'Kobe, Arima & Mt. Rokko',region:'Hyogo',duration:'10–11 hours',stops:['Arima Onsen','Kitano Ijinkan','Kobe Harbor','Mt. Rokko night view']},'wakayama-family':{name:'Wakayama Family Route',region:'Wakayama',duration:'9–10 hours',stops:['Kishi Station','Toretore Market','Senjojiki','Sandanbeki']}},
 es:{'kobe-arima-rokko':{name:'Kobe, Arima y monte Rokko',region:'Hyogo',duration:'10–11 horas',stops:['Arima Onsen','Kitano Ijinkan','Puerto de Kobe','Vista nocturna del monte Rokko']},'wakayama-family':{name:'Ruta familiar por Wakayama',region:'Wakayama',duration:'9–10 horas',stops:['Estación de Kishi','Mercado Toretore','Senjojiki','Sandanbeki']}},
 vi:{'kobe-arima-rokko':{name:'Kobe, Arima & núi Rokko',region:'Hyogo',duration:'10–11 giờ',stops:['Suối nước nóng Arima','Khu Kitano Ijinkan','Cảng Kobe','Cảnh đêm núi Rokko']},'wakayama-family':{name:'Tuyến gia đình Wakayama',region:'Wakayama',duration:'9–10 giờ',stops:['Ga Kishi','Chợ Toretore','Senjojiki','Sandanbeki']}},
 ja:{'kobe-arima-rokko':{name:'神戸・有馬温泉・六甲山',region:'兵庫',duration:'約10～11時間',stops:['有馬温泉','北野異人館街','神戸港','六甲山夜景']},'wakayama-family':{name:'和歌山ファミリーコース',region:'和歌山',duration:'約9～10時間',stops:['貴志駅','とれとれ市場','千畳敷','三段壁']}},
 ko:{'kobe-arima-rokko':{name:'고베·아리마·롯코산',region:'효고',duration:'약 10–11시간',stops:['아리마 온천','기타노 이진칸','고베항','롯코산 야경']},'wakayama-family':{name:'와카야마 가족 코스',region:'와카야마',duration:'약 9–10시간',stops:['기시역','토레토레 시장','센조지키','산단베키']}},
 'zh-TW':{'kobe-arima-rokko':{name:'神戶、有馬與六甲山',region:'兵庫',duration:'約 10–11 小時',stops:['有馬溫泉','北野異人館街','神戶港','六甲山夜景']},'wakayama-family':{name:'和歌山親子路線',region:'和歌山',duration:'約 9–10 小時',stops:['貴志站','Toretore 市場','千疊敷','三段壁']}},
 ne:{'kobe-arima-rokko':{name:'कोबे, अरिमा र रोक्को पर्वत',region:'ह्योगो',duration:'१०–११ घण्टा',stops:['अरिमा ओन्सेन','कितानो इजिनकान','कोबे बन्दरगाह','रोक्को रात्री दृश्य']},'wakayama-family':{name:'वाकायामा पारिवारिक रुट',region:'वाकायामा',duration:'९–१० घण्टा',stops:['किशी स्टेशन','तोरेतोरे बजार','सेन्जोजिकी','सान्दानबेकी']}},
};
const localizedTripSummary=(locale:PassengerLocale,trip:typeof trips[number])=>{
 const published=trip.localizedContent?.[locale]??trip.localizedContent?.['zh-CN'];
 if(trip.catalogSource==='published')return {name:typeof published?.title==='string'&&published.title.trim()?published.title:trip.shortTitle,region:typeof published?.region==='string'&&published.region.trim()?published.region:trip.region,duration:typeof published?.duration==='string'&&published.duration.trim()?published.duration:trip.duration,summary:typeof published?.summary==='string'&&published.summary.trim()?published.summary:trip.summary,stops:Array.isArray(published?.stops)&&published.stops.some(item=>typeof item==='string'&&item.trim())?published.stops.filter((item):item is string=>typeof item==='string'&&Boolean(item.trim())):trip.stops};
 return tripHomeCopy[locale]?.[trip.slug]??tripSupplement[locale]?.[trip.slug]??expandedRouteSummary(locale,trip.slug)??{name:trip.shortTitle,region:trip.region,duration:trip.duration,stops:trip.stops};
};
const routePlaceQueries:Record<string,string[]>={
 'kyoto-nara-classic':['Kiyomizu-dera Temple Kyoto Japan','Fushimi Inari Taisha Kyoto Japan','Nara Park Japan'],
 'amanohashidate-ine':['Amanohashidate View Land Kyoto Japan','Chionji Temple Amanohashidate Japan','Ine Funaya Kyoto Japan'],
 'biwako-shirahige':['Shirahige Shrine Shiga Japan','Biwako Terrace Shiga Japan','La Collina Omihachiman Japan'],
 'wakayama-family':['Kishi Station Wakayama Japan','Toretore Market Wakayama Japan','Senjojiki Wakayama Japan','Sandanbeki Wakayama Japan'],
 'kobe-arima-rokko':['Arima Onsen Kobe Japan','Kitano Ijinkan Kobe Japan','Kobe Harborland Japan','Mount Rokko Night View Japan'],
 'uji-nara-onsen':['Nara Park Japan','Byodoin Temple Uji Kyoto Japan','The Tale of Genji Museum Uji Japan','Uji Genji no Yu Kyoto Japan'],
 'miyama-katsuoji-arashiyama':['Katsuoji Temple Osaka Japan','Otagi Nenbutsuji Temple Kyoto Japan','Arashiyama Bamboo Forest Kyoto Japan'],
 'arashiyama-train-hozugawa':['Kinkakuji Temple Kyoto Japan','Kiyomizu-dera Temple Kyoto Japan','Sannenzaka Kyoto Japan','Fushimi Inari Taisha Kyoto Japan'],
 'sanzenin-kibune-arashiyama-autumn':['Kifune Shrine Kyoto autumn','Sanzenin Temple Ohara Kyoto autumn','Arashiyama Togetsukyo autumn Kyoto Japan'],
};
const routePhotoQuery=(slug:string,label:string,index:number)=>{
 const named:[string,string][]=[['清水','Kiyomizu-dera Temple Kyoto Japan'],['伏见','Fushimi Inari Taisha Kyoto Japan'],['奈良公园','Nara Park Japan'],['天桥立','Amanohashidate View Land Kyoto Japan'],['伊根','Ine Funaya Kyoto Japan'],['白须','Shirahige Shrine Shiga Japan'],['琵琶湖','Biwako Terrace Shiga Japan'],['近江八幡','La Collina Omihachiman Japan'],['贵志','Kishi Station Wakayama Japan'],['Toretore','Toretore Market Wakayama Japan'],['千叠敷','Senjojiki Wakayama Japan'],['三段壁','Sandanbeki Wakayama Japan'],['有马','Arima Onsen Kobe Japan'],['北野','Kitano Ijinkan Kobe Japan'],['神户港','Kobe Harborland Japan'],['六甲','Mount Rokko Night View Japan']];
 return named.find(([part])=>label.includes(part))?.[1]??routePlaceQueries[slug]?.[index]??null;
};
const bookingSalesCopy={
 'zh-CN':['班次销售信息','价格','含税','税务状态异常','最低成团','报名截止','未发布','人','席'],
 'zh-TW':['班次銷售資訊','價格','含稅','稅務狀態異常','最低成團','報名截止','未發布','人','席'],
 ja:['販売情報','料金','税込','税設定エラー','最少催行人数','申込締切','未公開','名','席'],
 en:['Departure sales information','Price','Tax included','Tax status error','Minimum group','Booking deadline','Not published','people','seats'],
 es:['Información de ventas de salida','Precio','Impuesto incluido','Error de estado','Número mínimo de participantes','Fecha límite de reserva','No publicada','personas','asientos'],
 vi:['Thông tin mở bán','Giá','Đã gồm thuế','Lỗi trạng thái thuế','Số khách tối thiểu','Hạn đặt chỗ','Chưa công bố','người','chỗ'],
 ne:['प्रस्थान बिक्री जानकारी','मूल्य','कर समावेश','कर स्थिति त्रुटि','न्यूनतम समूह','बुकिङ समयसीमा','प्रकाशित छैन','जना','सिट'],
 ko:['판매 정보','가격','세금 포함','세금 상태 오류','최소 출발 인원','예약 마감','미공개','명','석'],
} as const;
const bookingProgressLabel={
 'zh-CN':(step:number)=>`预订进度，第 ${step} 步，共 4 步`,'zh-TW':(step:number)=>`預訂進度，第 ${step} 步，共 4 步`,ja:(step:number)=>`予約の進捗、全4ステップ中${step}ステップ`,en:(step:number)=>`Booking progress, step ${step} of 4`,es:(step:number)=>`Progreso de la reserva, paso ${step} de 4`,vi:(step:number)=>`Tiến trình đặt chỗ, bước ${step}/4`,ne:(step:number)=>`बुकिङ प्रगति, ४ मध्ये चरण ${step}`,ko:(step:number)=>`예약 진행, 4단계 중 ${step}단계`,
} as const;
const localizedMeetingPoint=(locale:string,value:string)=>{
 const known:Record<string,Record<string,string>>={'大阪日本桥2号出口':{'zh-CN':'大阪日本桥2号出口','zh-TW':'大阪日本橋2號出口',ja:'大阪・日本橋2番出口',en:'Osaka Nippombashi Exit 2',es:'Salida 2 de Nippombashi, Osaka',vi:'Lối ra số 2 Nippombashi, Osaka',ne:'ओसाका निप्पोम्बाशी निकास २',ko:'오사카 닛폰바시 2번 출구'}};
 return known[value]?.[locale]??value;
};
const routeDetailExtra={
 'zh-CN':{walking:'中等',languages:'中文、日语、英语、韩语',trust:'预订保障',nav:'路线详情导航',min:'当前最低每席',open:'开放状态',pending:'班次待发布'},
 'zh-TW':{walking:'中等',languages:'中文、日語、英語、韓語',trust:'預訂保障',nav:'路線詳情導覽',min:'目前最低每席',open:'開放狀態',pending:'班次待發布'},
 ja:{walking:'中程度',languages:'中国語・日本語・英語・韓国語',trust:'予約について',nav:'ツアー詳細ナビゲーション',min:'現在の最低料金',open:'販売状況',pending:'便は未公開'},
 en:{walking:'Moderate',languages:'Chinese, Japanese, English, Korean',trust:'Booking assurances',nav:'Trip detail navigation',min:'Lowest price per seat',open:'Availability',pending:'Departures pending'},
 es:{walking:'Moderada',languages:'Chino, japonés, inglés, coreano',trust:'Garantías de reserva',nav:'Navegación por los detalles del viaje',min:'Precio más bajo por asiento',open:'Disponibilidad',pending:'Salidas pendientes'},
 vi:{walking:'Trung bình',languages:'Tiếng Trung, Nhật, Anh, Hàn',trust:'Thông tin đảm bảo',nav:'Điều hướng chi tiết chuyến',min:'Giá thấp nhất mỗi ghế',open:'Tình trạng mở bán',pending:'Chưa công bố chuyến'},
 ne:{walking:'मध्यम',languages:'चिनियाँ, जापानी, अङ्ग्रेजी, कोरियाली',trust:'बुकिङ आश्वासन',nav:'यात्रा विवरण नेभिगेसन',min:'प्रति सिट न्यूनतम मूल्य',open:'उपलब्धता',pending:'प्रस्थान प्रकाशित छैन'},
 ko:{walking:'보통',languages:'중국어, 일본어, 영어, 한국어',trust:'예약 안내',nav:'여행 상세 탐색',min:'현재 최저 1인 요금',open:'판매 상태',pending:'출발편 공개 예정'},
} as const;
const routeContentFallback={
 'zh-CN':{lead:(s:string)=>`从大阪出发，一天依次走访${s}。行程兼顾观光、自由活动与舒适休息。`,reason:(s:string)=>`${s}是本路线的重要一站，可在一天内体验当地代表性景观与文化。`,spot:(s:string)=>`在${s}安排游览和自由活动，具体停留时间以当天交通及运营通知为准。`,time:'时间以班次为准',suitable:'适合人群',suitableText:'希望从大阪轻松参加一日游的游客',meal:'餐食与步行',mealText:'餐食自理；请穿适合步行的鞋履。',included:'包含项目',includedText:'往返交通及行程服务',excluded:'不包含项目',excludedText:'餐食、个人消费及未注明费用',prep:'出发准备',prepTitle:'准备充分，旅途更轻松',prepText:'请在出发前查看天气、集合地点和最新通知。',carry:'建议携带',carryText:'饮用水、充电设备及个人必需品',wear:'穿着建议',wearText:'请按天气穿着，并选择适合步行的鞋履。',reminder:'友情提示',reminderText:'请准时集合并留意当天通知。',notes:'预订前须知'},
 'zh-TW':{lead:(s:string)=>`從大阪出發，一天依序走訪${s}。行程兼顧觀光、自由活動與舒適休息。`,reason:(s:string)=>`${s}是本路線的重要一站，可在一天內體驗當地代表性景觀與文化。`,spot:(s:string)=>`在${s}安排遊覽和自由活動，實際停留時間以當天交通及營運通知為準。`,time:'時間依班次為準',suitable:'適合對象',suitableText:'希望從大阪輕鬆參加一日遊的旅客',meal:'餐食與步行',mealText:'餐食自理；請穿著適合步行的鞋履。',included:'包含項目',includedText:'往返交通及行程服務',excluded:'不包含項目',excludedText:'餐食、個人消費及未註明費用',prep:'出發準備',prepTitle:'準備充分，旅途更輕鬆',prepText:'出發前請查看天氣、集合地點和最新通知。',carry:'建議攜帶',carryText:'飲用水、充電設備及個人必需品',wear:'穿著建議',wearText:'請依天氣穿著，並選擇適合步行的鞋履。',reminder:'溫馨提示',reminderText:'請準時集合並留意當天通知。',notes:'預訂前須知'},
 ja:{lead:(s:string)=>`大阪を出発し、${s}を一日で巡ります。観光、自由時間、休憩をバランスよく組み合わせた旅程です。`,reason:(s:string)=>`${s}では、その土地を代表する景観と文化を一日旅の中で楽しめます。`,spot:(s:string)=>`${s}で観光と自由時間を予定しています。滞在時間は当日の交通・運行状況により調整されます。`,time:'便により異なります',suitable:'おすすめの方',suitableText:'大阪発の日帰り旅行を気軽に楽しみたい方',meal:'食事と歩行',mealText:'食事は各自負担です。歩きやすい靴でご参加ください。',included:'料金に含まれるもの',includedText:'往復交通と旅程サービス',excluded:'料金に含まれないもの',excludedText:'食事、個人費用、記載のない費用',prep:'出発準備',prepTitle:'準備を整えて快適な旅へ',prepText:'出発前に天気、集合場所、最新のお知らせをご確認ください。',carry:'持ち物',carryText:'飲み物、充電器、個人の必需品',wear:'服装',wearText:'天候に合う服装と歩きやすい靴をご用意ください。',reminder:'ご案内',reminderText:'集合時刻を守り、当日のお知らせをご確認ください。',notes:'予約前のご案内'},
 en:{lead:(s:string)=>`Depart from Osaka and visit ${s} in one day, with a balanced mix of sightseeing, free time and comfortable breaks.`,reason:(s:string)=>`${s} is a key stop where you can experience the area’s characteristic scenery and culture.`,spot:(s:string)=>`Sightseeing and free time are planned at ${s}. The stop duration may change with traffic and operations.`,time:'Time depends on departure',suitable:'Who this suits',suitableText:'Travellers looking for an easy day trip from Osaka',meal:'Meals and walking',mealText:'Meals are at your own expense. Wear comfortable walking shoes.',included:'Included',includedText:'Round-trip transport and itinerary service',excluded:'Not included',excludedText:'Meals, personal purchases and unspecified expenses',prep:'Before departure',prepTitle:'Prepare well for a smoother trip',prepText:'Check the weather, meeting point and latest notices before departure.',carry:'What to bring',carryText:'Water, a charger and personal essentials',wear:'What to wear',wearText:'Dress for the weather and wear comfortable walking shoes.',reminder:'Friendly reminder',reminderText:'Arrive on time and check same-day updates.',notes:'Before booking'},
 es:{lead:(s:string)=>`Sal de Osaka y visita ${s} en un día, combinando visitas, tiempo libre y descansos cómodos.`,reason:(s:string)=>`${s} es una parada clave para conocer el paisaje y la cultura representativos de la zona.`,spot:(s:string)=>`Habrá tiempo de visita y tiempo libre en ${s}. La duración puede cambiar según el tráfico y la operación.`,time:'El horario depende de la salida',suitable:'A quién va dirigido',suitableText:'Viajeros que buscan una excursión cómoda desde Osaka',meal:'Comidas y caminata',mealText:'Las comidas corren por cuenta propia. Lleva calzado cómodo.',included:'Incluido',includedText:'Transporte de ida y vuelta y servicio del itinerario',excluded:'No incluido',excludedText:'Comidas, compras personales y gastos no indicados',prep:'Antes de salir',prepTitle:'Prepárate para viajar con comodidad',prepText:'Consulta el clima, el punto de encuentro y los últimos avisos antes de salir.',carry:'Qué llevar',carryText:'Agua, cargador y artículos personales esenciales',wear:'Ropa recomendada',wearText:'Vístete según el clima y lleva calzado cómodo.',reminder:'Recordatorio',reminderText:'Llega puntualmente y consulta los avisos del día.',notes:'Antes de reservar'},
 vi:{lead:(s:string)=>`Khởi hành từ Osaka và tham quan ${s} trong một ngày, kết hợp ngắm cảnh, thời gian tự do và nghỉ ngơi hợp lý.`,reason:(s:string)=>`${s} là điểm dừng tiêu biểu để trải nghiệm cảnh quan và văn hóa địa phương.`,spot:(s:string)=>`Có thời gian tham quan và tự do tại ${s}. Thời lượng có thể đổi theo giao thông và vận hành.`,time:'Tùy chuyến khởi hành',suitable:'Phù hợp với',suitableText:'Du khách muốn đi trong ngày thuận tiện từ Osaka',meal:'Ăn uống và đi bộ',mealText:'Bữa ăn tự túc. Hãy mang giày đi bộ thoải mái.',included:'Bao gồm',includedText:'Phương tiện khứ hồi và dịch vụ hành trình',excluded:'Không bao gồm',excludedText:'Bữa ăn, chi tiêu cá nhân và khoản không nêu',prep:'Chuẩn bị khởi hành',prepTitle:'Chuẩn bị tốt để chuyến đi thoải mái hơn',prepText:'Kiểm tra thời tiết, điểm tập trung và thông báo mới trước khi đi.',carry:'Nên mang theo',carryText:'Nước uống, bộ sạc và đồ dùng cá nhân',wear:'Trang phục',wearText:'Mặc phù hợp thời tiết và đi giày thoải mái.',reminder:'Lưu ý',reminderText:'Đến đúng giờ và theo dõi thông báo trong ngày.',notes:'Lưu ý trước khi đặt'},
 ne:{lead:(s:string)=>`ओसाकाबाट प्रस्थान गरी एकै दिनमा ${s} भ्रमण गर्नुहोस्। दृश्यावलोकन, स्वतन्त्र समय र आरामको सन्तुलित तालिका छ।`,reason:(s:string)=>`${s} यस क्षेत्रको प्रतिनिधि दृश्य र संस्कृति अनुभव गर्न मिल्ने मुख्य बिसौनी हो।`,spot:(s:string)=>`${s} मा भ्रमण र स्वतन्त्र समय राखिएको छ। ट्राफिक र सञ्चालनअनुसार बसाइ अवधि बदलिन सक्छ।`,time:'प्रस्थानअनुसार समय',suitable:'कसका लागि उपयुक्त',suitableText:'ओसाकाबाट सहज एकदिने यात्रा चाहने यात्री',meal:'खाना र हिँडाइ',mealText:'खाना आफ्नै खर्चमा हो। आरामदायी हिँड्ने जुत्ता लगाउनुहोस्।',included:'समावेश',includedText:'आवतजावत यातायात र यात्रा सेवा',excluded:'समावेश छैन',excludedText:'खाना, व्यक्तिगत खरिद र उल्लेख नगरिएका खर्च',prep:'प्रस्थान तयारी',prepTitle:'राम्रो तयारीले यात्रा सहज बनाउँछ',prepText:'प्रस्थानअघि मौसम, भेट्ने ठाउँ र नवीनतम सूचना हेर्नुहोस्।',carry:'के बोक्ने',carryText:'पानी, चार्जर र व्यक्तिगत आवश्यक सामग्री',wear:'के लगाउने',wearText:'मौसमअनुसार लुगा र आरामदायी जुत्ता लगाउनुहोस्।',reminder:'स्मरण',reminderText:'समयमै भेट्ने ठाउँमा आउनुहोस् र सोही दिनको सूचना हेर्नुहोस्।',notes:'बुकिङअघि जानकारी'},
 ko:{lead:(s:string)=>`오사카에서 출발해 ${s}을 하루에 둘러봅니다. 관광, 자유 시간과 편안한 휴식을 균형 있게 구성했습니다.`,reason:(s:string)=>`${s}은 지역을 대표하는 풍경과 문화를 경험할 수 있는 핵심 방문지입니다.`,spot:(s:string)=>`${s}에서 관광과 자유 시간을 가집니다. 체류 시간은 교통 및 운영 상황에 따라 달라질 수 있습니다.`,time:'출발편에 따라 다름',suitable:'추천 대상',suitableText:'오사카에서 편안한 당일 여행을 원하는 분',meal:'식사 및 도보',mealText:'식사는 개별 부담입니다. 편한 보행화를 착용하세요.',included:'포함 사항',includedText:'왕복 교통 및 여행 일정 서비스',excluded:'불포함 사항',excludedText:'식사, 개인 구매 및 명시되지 않은 비용',prep:'출발 준비',prepTitle:'준비하면 여행이 더 편안합니다',prepText:'출발 전 날씨, 집합 장소와 최신 알림을 확인하세요.',carry:'준비물',carryText:'물, 충전기와 개인 필수품',wear:'복장 안내',wearText:'날씨에 맞는 옷과 편한 보행화를 준비하세요.',reminder:'안내 사항',reminderText:'정시에 집합하고 당일 알림을 확인하세요.',notes:'예약 전 안내'},
} as const;
const checkoutExtra={
 'zh-CN':{travellers:'出行人数',legal:'取消以系统成功受理时间为准；依法应退款、解除或补偿的情形不受排除。',pending:'待确认'},
 'zh-TW':{travellers:'出行人數',legal:'取消以系統成功受理時間為準；依法應退款、解除或補償的情形不受排除。',pending:'待確認'},
 ja:{travellers:'参加人数',legal:'取消時刻はシステムが正常に受理した時点を基準とします。法令上必要な返金・解除・補償は除外されません。',pending:'確認中'},
 en:{travellers:'Travellers',legal:'Cancellation time is recorded when the system successfully accepts the request. Refunds, termination rights or compensation required by law are not excluded.',pending:'Pending'},
 es:{travellers:'Viajeros',legal:'El tiempo de cancelación se registra cuando el sistema acepta correctamente la solicitud. No se excluyen los reembolsos, los derechos de rescisión o las compensaciones exigidas por la ley.',pending:'Pendiente'},
 vi:{travellers:'Số người đi',legal:'Thời điểm hủy được tính khi hệ thống tiếp nhận thành công. Các quyền hoàn tiền, chấm dứt hoặc bồi thường theo luật không bị loại trừ.',pending:'Đang xác nhận'},
 ne:{travellers:'यात्री संख्या',legal:'रद्द समय प्रणालीले अनुरोध सफलतापूर्वक स्वीकार गरेको समय हो। कानूनले आवश्यक गरेको फिर्ता, अन्त्य वा क्षतिपूर्ति बहिष्कृत हुँदैन।',pending:'पुष्टि हुन बाँकी'},
 ko:{travellers:'여행 인원',legal:'취소 시각은 시스템이 요청을 정상 접수한 시점을 기준으로 합니다. 법령상 필요한 환불·해제·보상은 제외되지 않습니다.',pending:'확인 중'},
} as const;
const checkoutLegalLinks={
 'zh-CN':{read:'我已阅读并理解',cancel:'取消与退款政策',agree:'我同意',terms:'预订条款',and:'及',privacy:'隐私政策'},
 'zh-TW':{read:'我已閱讀並理解',cancel:'取消與退款政策',agree:'我同意',terms:'預訂條款',and:'及',privacy:'隱私政策'},
 ja:{read:'以下を読み、内容を確認しました：',cancel:'取消・返金ポリシー',agree:'以下に同意します：',terms:'予約規約',and:'および',privacy:'プライバシーポリシー'},
 en:{read:'I have read and understand the',cancel:'Cancellation and Refund Policy',agree:'I agree to the',terms:'Booking Terms',and:'and',privacy:'Privacy Policy'},
 es:{read:'Yo he leido y entiendo los',cancel:'Política de cancelación y reembolso',agree:'Estoy de acuerdo con la ',terms:'Términos y condiciones.',and:'y',privacy:'Política de privacidad'},
 vi:{read:'Tôi đã đọc và hiểu',cancel:'Chính sách hủy và hoàn tiền',agree:'Tôi đồng ý với',terms:'Điều khoản đặt chỗ',and:'và',privacy:'Chính sách quyền riêng tư'},
 ne:{read:'मैले पढेर बुझेको छु:',cancel:'रद्द तथा रकम फिर्ता नीति',agree:'म सहमत छु:',terms:'बुकिङ सर्तहरू',and:'र',privacy:'गोपनीयता नीति'},
 ko:{read:'다음을 읽고 이해했습니다:',cancel:'취소 및 환불 정책',agree:'다음에 동의합니다:',terms:'예약 약관',and:'및',privacy:'개인정보 처리방침'},
} as const;
const supportCopy={
 'zh-CN':{eyebrow:'帮助与客服',title:'需要帮助吗？',text:'先查看常见问题；紧急履约问题会在行程房间提供专用入口。',order:'订单问题',orderText:'查看订单状态',day:'出发当天',dayText:'进入行程房间',faq:'常见问题',mail:'发送邮件咨询',note:'邮件不适合处理出发当天的紧急问题；行程开放后请使用行程房间联系运营。',faqs:[['怎样确认订单是否成立？','以订单页面显示“已确认”为准。仅保存资料或订单草稿不代表已经付款或占位。'],['集合地点什么时候显示？','运营确认集合点、车辆和工作人员后，会同步到订单详情与我的行程。'],['如何申请取消？','请从订单详情发起申请。取消时间按日本时间，以系统成功受理时间为准。']]},
 'zh-TW':{eyebrow:'幫助與客服',title:'需要協助嗎？',text:'請先查看常見問題；緊急履約問題會在行程房間提供專用入口。',order:'訂單問題',orderText:'查看訂單狀態',day:'出發當天',dayText:'進入行程房間',faq:'常見問題',mail:'傳送郵件諮詢',note:'郵件不適合處理出發當天的緊急問題；行程開放後請使用行程房間聯絡營運。',faqs:[['如何確認訂單是否成立？','以訂單頁面顯示「已確認」為準。僅儲存資料或草稿不代表已付款或保留座位。'],['集合地點何時顯示？','營運確認集合點、車輛和工作人員後，會同步至訂單詳情與我的行程。'],['如何申請取消？','請從訂單詳情提出申請。取消時間按日本時間，以系統成功受理時間為準。']]},
 ja:{eyebrow:'ヘルプ・サポート',title:'お困りですか？',text:'まずよくある質問をご確認ください。当日の緊急連絡は旅程ルームから行えます。',order:'予約について',orderText:'予約状況を確認',day:'出発当日',dayText:'旅程ルームを開く',faq:'よくある質問',mail:'メールで問い合わせ',note:'メールは出発当日の緊急連絡には適しません。旅程ルーム公開後は、そちらから運営へご連絡ください。',faqs:[['予約成立はどこで確認できますか？','予約ページに「確定」と表示された時点で成立します。情報保存や下書きだけでは支払い・座席確保は完了していません。'],['集合場所はいつ表示されますか？','運営が集合場所・車両・担当者を確定後、予約詳細と旅程に表示されます。'],['取消の申請方法は？','予約詳細から申請してください。取消時刻は日本時間で、システムが受理した時点を基準とします。']]},
 en:{eyebrow:'Help and support',title:'How can we help?',text:'Check the FAQs first. A dedicated contact option will be available in the trip room for urgent same-day issues.',order:'Order help',orderText:'View order status',day:'Departure day',dayText:'Open the trip room',faq:'Frequently asked questions',mail:'Contact us by email',note:'Email is not suitable for urgent departure-day issues. Once the trip room opens, use it to contact operations.',faqs:[['How do I know my booking is confirmed?','Your booking is final when the order page shows “Confirmed”. Saving details or a draft does not mean payment or a seat is secured.'],['When will the meeting point appear?','It will appear in the order details and My Trip after operations confirms the location, vehicle and staff.'],['How do I request cancellation?','Submit the request from the order details. Japan time applies, based on when the system successfully receives it.']]},
 es:{eyebrow:'Asistencia y apoyo',title:'¿Cómo podemos ayudarte?',text:'Consulta primero las preguntas frecuentes. Una opción de contacto específica estará disponible en la sala de viajes para problemas urgentes el mismo día.',order:'Ayuda con el pedido',orderText:'Ver estado del pedido',day:'Dia de salida',dayText:'Abre la sala de viajes',faq:'Preguntas frecuentes',mail:'Contacto por correo electrónico',note:'El correo electrónico no es adecuado para problemas urgentes del día de salida. Una vez que se abra la sala de viajes, utilízala para contactar con operaciones.',faqs:[['¿Cómo puedo saber si mi reserva se ha confirmado?','Tu reserva es definitiva cuando la página del pedido muestra «Confirmada». Guardar detalles o un giro no significa que el pago o un asiento estén asegurados.'],['¿Cuándo aparecerá el punto de encuentro?','Aparecerá en los detalles del pedido y en Mi viaje después de que las operaciones confirmen la ubicación, el vehículo y el personal.'],['¿Cómo solicito la cancelación?','Envía la solicitud desde los detalles del pedido. Se aplica el tiempo de Japón, en función de cuándo el sistema lo reciba con éxito.']]},
 vi:{eyebrow:'Trợ giúp và hỗ trợ',title:'Bạn cần trợ giúp?',text:'Hãy xem câu hỏi thường gặp trước. Vấn đề khẩn cấp trong ngày đi sẽ có lối liên hệ riêng trong phòng hành trình.',order:'Hỗ trợ đơn',orderText:'Xem trạng thái đơn',day:'Ngày khởi hành',dayText:'Mở phòng hành trình',faq:'Câu hỏi thường gặp',mail:'Liên hệ qua email',note:'Email không phù hợp cho việc khẩn cấp trong ngày đi. Khi phòng hành trình mở, hãy liên hệ vận hành tại đó.',faqs:[['Làm sao biết đặt chỗ đã được xác nhận?','Đặt chỗ hoàn tất khi trang đơn hiển thị “Đã xác nhận”. Lưu thông tin hoặc bản nháp không có nghĩa là đã thanh toán hay giữ chỗ.'],['Khi nào điểm tập trung hiển thị?','Điểm tập trung sẽ xuất hiện trong chi tiết đơn và Chuyến đi của tôi sau khi vận hành xác nhận địa điểm, xe và nhân viên.'],['Làm sao yêu cầu hủy?','Gửi yêu cầu trong chi tiết đơn. Thời gian Nhật Bản được áp dụng tại thời điểm hệ thống tiếp nhận thành công.']]},
 ne:{eyebrow:'सहायता र समर्थन',title:'सहायता चाहिन्छ?',text:'पहिले सामान्य प्रश्न हेर्नुहोस्। यात्राको दिनको आकस्मिक समस्याका लागि यात्रा कक्षमा छुट्टै सम्पर्क हुनेछ।',order:'अर्डर सहायता',orderText:'अर्डर स्थिति हेर्नुहोस्',day:'प्रस्थानको दिन',dayText:'यात्रा कक्ष खोल्नुहोस्',faq:'सामान्य प्रश्नहरू',mail:'इमेलबाट सम्पर्क',note:'प्रस्थानको दिनको आकस्मिक समस्याका लागि इमेल उपयुक्त छैन। यात्रा कक्ष खुलेपछि त्यहीँबाट सञ्चालन टोलीलाई सम्पर्क गर्नुहोस्।',faqs:[['बुकिङ पुष्टि भएको कसरी थाहा पाउने?','अर्डर पृष्ठमा “पुष्टि भयो” देखिएपछि मात्र बुकिङ अन्तिम हुन्छ। विवरण वा ड्राफ्ट बचत गर्नु भुक्तानी वा सिट सुरक्षित हुनु होइन।'],['भेट्ने ठाउँ कहिले देखिन्छ?','सञ्चालन टोलीले स्थान, गाडी र कर्मचारी पुष्टि गरेपछि अर्डर विवरण र मेरो यात्रामा देखिन्छ।'],['रद्द अनुरोध कसरी गर्ने?','अर्डर विवरणबाट अनुरोध गर्नुहोस्। प्रणालीले सफलतापूर्वक स्वीकार गरेको जापान समय लागू हुन्छ।']]},
 ko:{eyebrow:'도움말 및 고객 지원',title:'도움이 필요하신가요?',text:'먼저 자주 묻는 질문을 확인하세요. 출발 당일 긴급 문제는 여행방에서 전용 연락 기능을 제공합니다.',order:'주문 문의',orderText:'주문 상태 확인',day:'출발 당일',dayText:'여행방 열기',faq:'자주 묻는 질문',mail:'이메일 문의',note:'이메일은 출발 당일 긴급 문제에 적합하지 않습니다. 여행방이 열린 뒤에는 그곳에서 운영팀에 연락하세요.',faqs:[['예약 확정은 어떻게 확인하나요?','주문 페이지에 “확정”으로 표시되어야 예약이 성립합니다. 정보 저장이나 초안만으로 결제 또는 좌석이 확보되지 않습니다.'],['집합 장소는 언제 표시되나요?','운영팀이 장소, 차량과 담당자를 확정한 뒤 주문 상세와 내 여행에 표시됩니다.'],['취소는 어떻게 신청하나요?','주문 상세에서 신청하세요. 시스템이 정상 접수한 일본 시간을 기준으로 합니다.']]},
} as const;
const rewardsCopy={
 'zh-CN':{eyebrow:'会员与推荐',tier:'探索者',done:'次有效推荐',more:'再完成 {n} 次升级为旅行者',expert:'可申请达人审核',empty:'暂无奖励记录',emptyText:'被推荐订单进入出发前24小时不可退款期后，推荐奖励才会生效。'},'zh-TW':{eyebrow:'會員與推薦',tier:'探索者',done:'次有效推薦',more:'再完成 {n} 次升級為旅行者',expert:'可申請達人審核',empty:'暫無獎勵記錄',emptyText:'被推薦訂單進入出發前24小時不可退款期後，推薦獎勵才會生效。'},ja:{eyebrow:'会員・紹介',tier:'エクスプローラー',done:'件の有効な紹介',more:'あと {n} 件で次のランクへ',expert:'エキスパート審査を申請できます',empty:'特典履歴はありません',emptyText:'紹介先の予約が出発24時間前の返金不可期間に入ると、紹介特典が有効になります。'},en:{eyebrow:'Membership and referrals',tier:'Explorer',done:'eligible referrals',more:'Complete {n} more referrals to reach the next tier',expert:'You can apply for expert review',empty:'No rewards yet',emptyText:'Referral rewards activate when the referred booking enters the non-refundable period 24 hours before departure.'},es:{eyebrow:'Membresía y recomendaciones',tier:'EXPLORADOR',done:'recomendaciones válidas',more:'Completa {n} recomendaciones más para subir de nivel',expert:'Puedes solicitar la revisión de embajador',empty:'Aún no hay recompensas',emptyText:'La recompensa se activa cuando la reserva recomendada entra en el período no reembolsable, 24 horas antes de la salida.'},vi:{eyebrow:'Thành viên và giới thiệu',tier:'Người khám phá',done:'lượt giới thiệu hợp lệ',more:'Hoàn thành thêm {n} lượt giới thiệu để lên hạng',expert:'Có thể đăng ký xét duyệt chuyên gia',empty:'Chưa có phần thưởng',emptyText:'Phần thưởng có hiệu lực khi đơn được giới thiệu bước vào thời hạn không hoàn tiền, 24 giờ trước khi khởi hành.'},ne:{eyebrow:'सदस्यता र सिफारिस',tier:'अन्वेषक',done:'योग्य सिफारिस',more:'अर्को तहका लागि थप {n} सिफारिस पूरा गर्नुहोस्',expert:'विशेषज्ञ समीक्षाका लागि आवेदन दिन सकिन्छ',empty:'अहिलेसम्म पुरस्कार छैन',emptyText:'सिफारिस गरिएको बुकिङ प्रस्थानको २४ घण्टाअघि फिर्ता नहुने अवधिमा पुगेपछि पुरस्कार सक्रिय हुन्छ।'},ko:{eyebrow:'회원 및 추천',tier:'탐험가',done:'건의 유효 추천',more:'{n}건 더 완료하면 다음 등급',expert:'전문가 심사를 신청할 수 있습니다',empty:'아직 리워드가 없습니다',emptyText:'추천 예약이 출발 24시간 전 환불 불가 기간에 들어가면 추천 리워드가 활성화됩니다.'},
} as const;
const profileCopy={
 'zh-CN':{eyebrow:'账户与偏好',title:'我的',status:'账户状态',signed:'已登录',signedOut:'未登录',email:'电子邮箱',language:'语言',runtime:'运行模式',production:'正式环境',development:'开发环境',demo:'演示环境',center:'账户中心',centerText:'订单和乘车资料统一在订单中查看；车辆群消息仅在已分配的行程中开放。',orders:'订单与乘车资料',messages:'行程消息',details:'本人乘客资料',detailsText:'联系方式和紧急联系人保存在私密资料中，不会显示在公开资料或乘客群中。',name:'显示名',phone:'必要联系电话',emergencyName:'紧急联系人姓名',emergencyPhone:'紧急联系人电话',agree:'同意',terms:'服务条款',privacy:'隐私政策',loading:'正在读取资料…',saving:'正在安全保存…',save:'保存本人资料',compact:'紧凑显示',logout:'退出账户',reset:'重置界面偏好',logoutText:'退出会清除浏览器登录会话；订单和乘客资料不会写入本机存储。',saved:'本人资料已安全保存。'},
 'zh-TW':{eyebrow:'帳戶與偏好',title:'我的',status:'帳戶狀態',signed:'已登入',signedOut:'未登入',email:'電子郵件',language:'語言',runtime:'運行模式',production:'正式環境',development:'開發環境',demo:'示範環境',center:'帳戶中心',centerText:'訂單和乘車資料統一在訂單中查看；車輛群組訊息僅在已分配的行程中開放。',orders:'訂單與乘車資料',messages:'行程訊息',details:'本人乘客資料',detailsText:'聯絡方式和緊急聯絡人保存在私密資料中，不會顯示在公開資料或乘客群組中。',name:'顯示名稱',phone:'必要聯絡電話',emergencyName:'緊急聯絡人姓名',emergencyPhone:'緊急聯絡人電話',agree:'同意',terms:'服務條款',privacy:'隱私政策',loading:'正在讀取資料…',saving:'正在安全儲存…',save:'儲存本人資料',compact:'緊湊顯示',logout:'登出帳戶',reset:'重設介面偏好',logoutText:'登出會清除瀏覽器登入工作階段；訂單和乘客資料不會寫入本機儲存。',saved:'本人資料已安全儲存。'},
 ja:{eyebrow:'アカウントと設定',title:'マイページ',status:'アカウント状態',signed:'ログイン中',signedOut:'未ログイン',email:'メールアドレス',language:'言語',runtime:'運用モード',production:'本番環境',development:'開発環境',demo:'デモ環境',center:'アカウントセンター',centerText:'予約と乗車情報は予約ページで確認できます。車両グループのメッセージは旅程割当後に利用できます。',orders:'予約と乗車情報',messages:'旅程メッセージ',details:'乗客プロフィール',detailsText:'連絡先と緊急連絡先は非公開で保存され、公開プロフィールや乗客グループには表示されません。',name:'表示名',phone:'連絡先電話番号',emergencyName:'緊急連絡先氏名',emergencyPhone:'緊急連絡先電話番号',agree:'同意する：',terms:'利用規約',privacy:'プライバシーポリシー',loading:'プロフィールを読込中…',saving:'安全に保存中…',save:'プロフィールを保存',compact:'コンパクト表示',logout:'ログアウト',reset:'表示設定をリセット',logoutText:'ログアウトするとブラウザのセッションが消去されます。予約と乗客情報は端末に保存されません。',saved:'プロフィールを保存しました。'},
 en:{eyebrow:'Account and preferences',title:'Profile',status:'Account status',signed:'Signed in',signedOut:'Signed out',email:'Email',language:'Language',runtime:'Service mode',production:'Live',development:'Development',demo:'Demo',center:'Account centre',centerText:'View bookings and passenger details in Orders. Vehicle-group messages become available only after a trip is assigned.',orders:'Orders and passenger details',messages:'Trip messages',details:'Passenger profile',detailsText:'Contact and emergency details are stored privately and are not shown in a public profile or passenger group.',name:'Display name',phone:'Contact phone number',emergencyName:'Emergency contact name',emergencyPhone:'Emergency contact phone',agree:'I agree to the',terms:'Terms of Service',privacy:'Privacy Policy',loading:'Loading profile…',saving:'Saving securely…',save:'Save profile',compact:'Compact display',logout:'Sign out',reset:'Reset display preferences',logoutText:'Signing out clears the browser session. Orders and passenger details are not stored on this device.',saved:'Your profile has been saved securely.'},
 es:{eyebrow:'Cuenta y preferencias',title:'Perfil',status:'Estado de mi cuenta',signed:'Sesión iniciada&#x0D;',signedOut:'Se ha cerrado la sesión',email:'Correo electrónico',language:'Lenguaje',runtime:'Modo de mantenimiento',production:'En directo',development:'Desarrollo',demo:'Demo',center:'Centro de cuentas',centerText:'Consulta las reservas y los datos de los pasajeros en Pedidos. Los mensajes del grupo de vehículos solo estarán disponibles después de que se asigne un viaje.',orders:'Pedidos y datos del pasajero',messages:'Mensajes de viaje',details:'Perfil del pasajero',detailsText:'Los datos de contacto y de emergencia se almacenan de forma privada y no se muestran en un perfil público o en un grupo de pasajeros.',name:'Nombre de la pantalla',phone:'Teléfono de contacto',emergencyName:'Contacto de Emergencia',emergencyPhone:'Teléfono del contacto de emergencia',agree:'Estoy de acuerdo con la ',terms:'Términos del servicio',privacy:'Política de privacidad',loading:'Cargando perfil',saving:'Guardando de forma segura...',save:'Guardar perfil',compact:'Pantalla compacta',logout:'Cerrar sesión',reset:'Restablecer preferencias de visualización',logoutText:'Cerrar sesión borra la sesión del navegador. Los pedidos y los datos del pasajero no se almacenan en este dispositivo.',saved:'Tu perfil ha sido guardado.'},
 vi:{eyebrow:'Tài khoản và tùy chọn',title:'Hồ sơ',status:'Trạng thái tài khoản',signed:'Đã đăng nhập',signedOut:'Chưa đăng nhập',email:'Email',language:'Ngôn ngữ',runtime:'Chế độ dịch vụ',production:'Chính thức',development:'Phát triển',demo:'Demo',center:'Trung tâm tài khoản',centerText:'Xem đơn và thông tin hành khách trong mục Đơn hàng. Tin nhắn nhóm xe chỉ mở sau khi chuyến được phân công.',orders:'Đơn và thông tin hành khách',messages:'Tin nhắn chuyến đi',details:'Hồ sơ hành khách',detailsText:'Thông tin liên hệ và liên hệ khẩn cấp được lưu riêng tư, không hiển thị trong hồ sơ công khai hoặc nhóm hành khách.',name:'Tên hiển thị',phone:'Số điện thoại liên hệ',emergencyName:'Tên liên hệ khẩn cấp',emergencyPhone:'Số điện thoại khẩn cấp',agree:'Tôi đồng ý với',terms:'Điều khoản dịch vụ',privacy:'Chính sách quyền riêng tư',loading:'Đang tải hồ sơ…',saving:'Đang lưu an toàn…',save:'Lưu hồ sơ',compact:'Hiển thị gọn',logout:'Đăng xuất',reset:'Đặt lại giao diện',logoutText:'Đăng xuất sẽ xóa phiên trình duyệt. Đơn và thông tin hành khách không được lưu trên thiết bị này.',saved:'Hồ sơ đã được lưu an toàn.'},
 ne:{eyebrow:'खाता र प्राथमिकता',title:'प्रोफाइल',status:'खाता स्थिति',signed:'साइन इन गरिएको',signedOut:'साइन आउट',email:'इमेल',language:'भाषा',runtime:'सेवा मोड',production:'प्रत्यक्ष',development:'विकास',demo:'डेमो',center:'खाता केन्द्र',centerText:'अर्डर र यात्री विवरण अर्डरमा हेर्नुहोस्। यात्रा तोकिएपछि मात्र सवारी समूह सन्देश खुल्छ।',orders:'अर्डर र यात्री विवरण',messages:'यात्रा सन्देश',details:'यात्री प्रोफाइल',detailsText:'सम्पर्क र आकस्मिक सम्पर्क निजी रूपमा राखिन्छ र सार्वजनिक प्रोफाइल वा यात्री समूहमा देखाइँदैन।',name:'देखाइने नाम',phone:'सम्पर्क फोन',emergencyName:'आकस्मिक सम्पर्क नाम',emergencyPhone:'आकस्मिक सम्पर्क फोन',agree:'म सहमत छु:',terms:'सेवा सर्तहरू',privacy:'गोपनीयता नीति',loading:'प्रोफाइल लोड हुँदै…',saving:'सुरक्षित रूपमा बचत हुँदै…',save:'प्रोफाइल बचत गर्नुहोस्',compact:'सङ्क्षिप्त प्रदर्शन',logout:'साइन आउट',reset:'प्रदर्शन प्राथमिकता रिसेट',logoutText:'साइन आउट गर्दा ब्राउजर सत्र हट्छ। अर्डर र यात्री विवरण यस यन्त्रमा भण्डारण हुँदैन।',saved:'प्रोफाइल सुरक्षित रूपमा बचत भयो।'},
 ko:{eyebrow:'계정 및 설정',title:'프로필',status:'계정 상태',signed:'로그인됨',signedOut:'로그아웃됨',email:'이메일',language:'언어',runtime:'서비스 모드',production:'운영 환경',development:'개발 환경',demo:'데모 환경',center:'계정 센터',centerText:'주문 및 탑승 정보는 주문에서 확인하세요. 차량 그룹 메시지는 여행 배정 후에만 열립니다.',orders:'주문 및 탑승 정보',messages:'여행 메시지',details:'승객 프로필',detailsText:'연락처와 비상 연락처는 비공개로 저장되며 공개 프로필이나 승객 그룹에 표시되지 않습니다.',name:'표시 이름',phone:'연락 전화번호',emergencyName:'비상 연락처 이름',emergencyPhone:'비상 연락처 전화번호',agree:'동의:',terms:'서비스 이용약관',privacy:'개인정보 처리방침',loading:'프로필 불러오는 중…',saving:'안전하게 저장 중…',save:'프로필 저장',compact:'간단히 표시',logout:'로그아웃',reset:'화면 설정 초기화',logoutText:'로그아웃하면 브라우저 세션이 삭제됩니다. 주문과 승객 정보는 이 기기에 저장되지 않습니다.',saved:'프로필이 안전하게 저장되었습니다.'},
} as const;
const Empty = ({
  title = "暂无内容",
  text = "当前没有可显示的数据。",
}: {
  title?: string;
  text?: string;
}) => (
  <div className="empty-card">
    <b>{title}</b>
    <p>{text}</p>
  </div>
);
export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const app=useOptionalApp();
  const locale=app?.state.ui.locale ?? "zh-CN";
  const selected=passengerLocales.find(item=>item.code===locale) ?? passengerLocales[0];
  return (
    <label className={`language-select${compact ? " compact" : ""}`}>
      {compact ? <span aria-hidden="true">{selected.short}</span> : passengerCoreCopy[locale].language}
      <select aria-label={passengerCoreCopy[locale].language} value={locale} onChange={(event) => app?.setUi({...app.state.ui,locale:event.target.value as typeof locale})}>
        {passengerLocales.map(item=><option value={item.code} key={item.code}>{compact?item.short:item.label}</option>)}
      </select>
    </label>
  );
}
const compactTripMeta=(...parts:Array<string|undefined|null>)=>parts.map(value=>value?.trim()).filter(Boolean).join(' · ');
export function AppShell({
  children,
  nav = false,
}: {
  children: ReactNode;
  nav?: boolean;
}) {
  const { pathname } = useLocation();
  const app=useOptionalApp();
  const c=passengerCoreCopy[app?.state.ui.locale ?? "zh-CN"];
  const screen = pathname.split("/").filter(Boolean).slice(1, 2)[0] ?? "home";
  return (
    <div className="app-stage">
      <div className={`app-frame passenger-v2 screen-${screen}`}>
        {appConfig.runtimeMode==='demo'&&<div className="test-guest-banner">测试免登录 · 仅使用模拟数据</div>}
        <header className="app-top">
          <Link className="app-brand" to="/app" aria-label={c.backHome}>
            <i>JT</i>
            <span>Japan Travel Weekend</span>
          </Link>
          <LanguageSelect compact />
        </header>
        <main className="app-content passenger-screen">{children}</main>
        {nav && (
          <nav className="bottom-nav" aria-label={app?.state.ui.locale === "ja" ? "アプリナビゲーション" : app?.state.ui.locale === "ko" ? "앱 탐색" : app?.state.ui.locale === "en" ? "App navigation" : app?.state.ui.locale === "es" ? "Navegación de la aplicación" : app?.state.ui.locale === "vi" ? "Điều hướng ứng dụng" : app?.state.ui.locale === "ne" ? "एप नेभिगेसन" : "应用导航"}>
            <NavLink end to="/app">
              ⌂<span>{c.home}</span>
            </NavLink>
            <NavLink to="/app/trips">
              ◇<span>{c.trips}</span>
            </NavLink>
            <NavLink to="/app/orders">
              ▤<span>{c.orders}</span>
            </NavLink>
            <NavLink to="/app/my-trip/room">
              ◉<span>{c.messages}</span>
            </NavLink>
            <NavLink to="/app/profile">
              ○<span>{c.profile}</span>
            </NavLink>
          </nav>
        )}
      </div>
    </div>
  );
}
const AppTitle = ({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) => (
  <div className="app-title">
    <div className="eyebrow">{eyebrow}</div>
    <h1>{title}</h1>
    {text && <p>{text}</p>}
  </div>
);
const BookingSteps = ({ current }: { current: 1 | 2 | 3 | 4 }) => {
  const app=useOptionalApp();
  const locale=app?.state.ui.locale ?? "zh-CN";
  const c=passengerCoreCopy[locale];
  return <ol
    className="booking-steps"
    aria-label={bookingProgressLabel[locale](current)}
  >
    {c.steps.map((label, index) => (
      <li
        className={index + 1 <= current ? "active" : ""}
        aria-current={index + 1 === current ? "step" : undefined}
        key={label}
      >
        <span>{index + 1}</span>
        <b>{label}</b>
      </li>
    ))}
  </ol>;
};
export function Login() {
  const { state, setState, services, authResolved } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const returnTo = safeReturnTo(
    new URLSearchParams(location.search).get("returnTo"),
  );
  const referralCode = referralCodeFromSearch(location.search);
  const [error, setError] = useState("");
  const c=passengerCoreCopy[state.ui.locale ?? "zh-CN"];
  const a=passengerLoginCopy[state.ui.locale ?? "zh-CN"];
  const connected = backend.connected || services?.authAvailable === true;
  const production = appConfig.runtimeMode === "production";
  useEffect(() => {
    let active=true;
    if (authResolved && state.user) {
      if(services) void services.currentAccessDestination().then(destination=>{
        if(!active)return;
        if(destination==='passenger')nav(returnTo,{replace:true});
        else nav(isPassengerOnlyPath(returnTo)?passengerAccountBoundaryPath(returnTo):accessDestinationPath(destination),{replace:true});
      });
      else nav(returnTo,{replace:true});
    }
    return()=>{active=false};
  }, [authResolved, state.user, nav, returnTo,services]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (services) {
        const result = await services.signIn(
          String(f.get("email")),
          String(f.get("password")),
        );
        const user = result?.user ?? (await services.currentUser());
        if (!user?.email) throw new Error(a.failed);
        setState({ ...state, user: { email: user.email } });
      } else {
        const result = await backend.auth.register(
          String(f.get("email")),
          String(f.get("password")),
        );
        setState({ ...state, user: { email: result.account.email } });
      }
      if(!services)nav(returnTo, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : a.serviceError);
    }
  };
  if (!authResolved)
    return (
      <div className="empty-card" role="status">
        <b>{a.restoring}</b>
        <p>{a.restoringText}</p>
      </div>
    );
  return (
    <>
      <AppTitle
        eyebrow={c.welcome}
        title={c.loginTitle}
        text={
          services
            ? production
              ? c.login
              : c.testLogin
            : backend.connected
              ? c.localAccount
              : c.unavailable
        }
      />
      <form className="form" onSubmit={submit}>
        <label>
          {c.email}
          <input
            required
            name="email"
            type="text"
            inputMode="email"
            autoComplete="username"
            placeholder={c.emailPlaceholder}
          />
        </label>
        <label>
          {c.password}
          <input
            required
            name="password"
            type="password"
            autoComplete={services ? "current-password" : "new-password"}
            placeholder={a.passwordRule}
          />
        </label>
        {!services && !production && (
          <label>
            {c.referral} <small>{c.optional}</small>
            <input
              name="referral"
              autoComplete="off"
              defaultValue={referralCode}
              aria-describedby={referralCode ? "referral-link-note" : undefined}
            />
            {referralCode && (
              <small id="referral-link-note">{a.invitationFilled}</small>
            )}
          </label>
        )}
        {error && (
          <div className="danger" role="alert">
            {error}
          </div>
        )}
        <button className="button full" disabled={!connected}>
          {services
            ? production
              ? a.submit
              : a.testSubmit
            : backend.connected
              ? a.localSubmit
              : a.unavailableSubmit}
        </button>
        <p className="privacy">
          {services
            ? production
              ? a.privacy
              : a.testPrivacy
            : production
              ? a.unavailablePrivacy
              : a.localPrivacy}
        </p>
        {production && services?.authAvailable && (
          <div className="auth-links">
            <Link to="/app/create-account">{a.createAccount}</Link>
            <Link to="/app/forgot-password">{a.forgotPassword}</Link>
          </div>
        )}
      </form>
    </>
  );
}
export function AppHome() {
  const {
    state,
    departures: deps,
    departuresResolved,
    departuresError,
  } = useApp();
  const locale=state.ui.locale ?? "zh-CN";
  const h=passengerHomeCopy[locale];
  const x=homeExtraCopy[locale];
  const localTrip=(trip:typeof trips[number])=>localizedTripSummary(locale,trip);
  const featuredTrips = trips.slice(0, 4);
  const visibleDepartures = deps.filter(
    (departure) =>
      !departure.dateLabel.includes("TEST-") &&
      departure.departureTime !== null &&
      departure.meetingPointName !== null &&
      departure.price !== null &&
      departure.availableSeats !== null,
  );
  return (
    <div className="fulfillment-home passenger-home-v2">
      <section className="passenger-yellow-hero">
        <div className="passenger-welcome">
          <div>
            <span>{h.kicker}</span>
            <h1>{h.greeting}</h1>
          </div>
          <Link to="/app/notifications" aria-label={x.notice}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </svg>
            <em aria-hidden="true" />
          </Link>
        </div>
        <div className="next-trip-pass">
          <div>
            <span>JAPAN TRAVEL PASS</span>
            <h2>{h.passTitle}</h2>
            <p>{h.passText}</p>
          </div>
          <Link to="/app/trips">{h.choose} →</Link>
        </div>
      </section>
      <section className="passenger-member-strip" aria-label={x.member}>
        <div>
          <small>{h.credit}</small>
          <b>¥{state.credits}</b>
        </div>
        <div>
          <small>{h.tier}</small>
          <b>{locale==='zh-CN'?tierFor(state.completedTrips).name:x.tier}</b>
        </div>
        <Link to="/app/rewards">{h.benefits} →</Link>
      </section>
       <nav className="passenger-quick-actions" aria-label={x.quick}>
         <Link to="/app/my-trip">
          <i>⌖</i>
          <span>{h.meeting}</span>
        </Link>
        <Link to="/app/guides">
          <i>▤</i>
          <span>{h.guides}</span>
        </Link>
        <Link to="/app/rewards">
          <i>☆</i>
          <span>{x.benefits}</span>
        </Link>
        <Link to="/app/support">
          <i>?</i>
          <span>{h.support}</span>
        </Link>
      </nav>
      <Link className="passenger-alert-ribbon" to="/app/notifications">
        <span>{h.alert}</span>
        <b>{h.alertText}</b>
        <strong>›</strong>
      </Link>
      <div className="passenger-section-heading">
        <div>
          <span>WEEKEND PICKS</span>
          <h2>{h.picks}</h2>
        </div>
        <Link to="/app/trips">{h.allRoutes}</Link>
      </div>
      <div className="passenger-route-rail">
        {featuredTrips.map((trip) => {
          const display=localTrip(trip);
          return (
          <Link to={`/app/trips/${trip.slug}`} key={trip.id}>
            <img src={trip.heroImage} alt={display.name} />
            <div>
              <small>
                {compactTripMeta(display.region,display.duration)}
              </small>
              <h3>{display.name}</h3>
              <p>{display.stops.slice(0, 3).join(" → ")}</p>
            </div>
          </Link>
        )})}
      </div>
      <div className="passenger-section-heading compact">
        <div>
          <span>AVAILABLE</span>
          <h2>{h.available}</h2>
        </div>
        <Link to="/app/trips">{h.all}</Link>
      </div>
      {!departuresResolved ? (
        <Empty title={h.loadingTitle} text={h.loadingText} />
      ) : departuresError ? (
        <Empty title={h.errorTitle} text={h.errorText} />
      ) : visibleDepartures.length ? (
        <div className="passenger-departure-list">
          {visibleDepartures.slice(0, 3).map((departure) => {
            const trip = travelRepository.getTrip(departure.tripSlug);
            if (!trip) return null;
            const display=localTrip(trip);
            const weekendIndex=departure.weekend==='本周末'?0:departure.weekend==='下周末'?1:2;
            const dateLabel=departure.departureTime?new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',month:'short',day:'numeric',weekday:'short'}).format(new Date(departure.departureTime)):departure.dateLabel;
            return (
              <Link
                className="passenger-departure-row"
                key={departure.id}
                to={`/app/booking/${trip.slug}?departureId=${encodeURIComponent(departure.id)}`}
              >
                <time>
                  <b>{x.weekend[weekendIndex]}</b>
                  <small>{dateLabel}</small>
                </time>
                <div>
                  <h3>{display.name}</h3>
                  <p>{display.stops.slice(0, 3).join(" → ")}</p>
                  <span>
                    {departure.price == null
                      ? h.pricePending
                      : `${h.perSeat} ¥${departure.price.toLocaleString(locale)}`}{" "}
                    {departure.availableSeats == null
                      ? ""
                      : ` · ${h.seatsLeft} ${departure.availableSeats}`}
                  </span>
                </div>
                <strong>›</strong>
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty
          title={h.emptyTitle}
          text={h.emptyText}
        />
      )}
      <div className="passenger-section-heading compact">
        <div>
          <span>TRAVEL IDEAS</span>
          <h2>{h.ideas}</h2>
        </div>
        <Link to="/app/guides">{h.all}</Link>
      </div>
      <div className="passenger-guide-grid">
        <Link to="/app/guides#food">
          <span>{x.foodTag}</span>
          <b>{x.food}</b>
          <small>{x.foodTime}</small>
        </Link>
        <Link to="/app/guides#meeting">
          <span>{x.meetTag}</span>
          <b>{x.meet}</b>
          <small>{x.meetTime}</small>
        </Link>
      </div>
      <Link className="passenger-private-card" to="/app/private-groups">
        <div>
          <span>PRIVATE GROUPS</span>
          <b>{h.privateTitle}</b>
          <p>{h.privateText}</p>
        </div>
        <strong>{h.inquire} →</strong>
      </Link>
    </div>
  );
}

const notificationCopy:Record<string,any>={
  'zh-CN':{eyebrow:'消息中心',title:'通知',intro:'只保留与订单、出发和账户安全有关的重要信息。',filters:{all:'全部',order:'订单',trip:'旅行团',system:'系统'},icons:{order:'单',trip:'旅',system:'系'},loading:'正在读取通知',loadingText:'正在核对本人订单的必要通知。',unavailable:'通知暂时不可用',empty:'暂无通知',emptyText:'付款、集合、车辆和登车状态发生变化后会显示在这里。',footer:'司机、司导的工作通知不会混入游客通知；营销内容默认不推送。',delivery:{delivered:'已送达',submitted:'已提交发送，等待渠道确认送达',failed:'发送失败',suppressed:'已静默',pending:'平台已生成，等待外部渠道送达'},labels:{order:'订单通知',refund:'退款通知',trip:'旅行团通知',system:'系统通知'},events:{'order-confirmed':['订单已确认','付款已受理并进入履约准备，请继续关注集合与车辆资料。'],'refund-completed':['退款已原路发起','退款处理已完成，实际到账时间以银行或发卡机构为准。'],'bank-transfer-pending':['银行转账待核对','平台已收到核对请求；银行到账与订单确认是两个不同状态。'],'meeting-updated':['集合信息已变更','请进入行程房间查看最新时间、地点和步行导航，并确认已知晓。'],'trip-room-opened':['行程群已开放','司机、司导和本车乘客可在群内查看当日履约信息。'],'departure-reminder':['即将出发','请核对集合时间、地点、车辆信息和建议携带物品。'],'departure-delayed':['行程预计延误','请进入行程房间查看司导发布的延误原因和后续安排。'],'boarding-completed':['登车已确认','本次登车状态已由工作人员确认。'],fallback:['服务状态更新','请进入订单或行程页面查看最新状态。']},preview:[['order','订单资料已保存','可继续核对乘客资料与取消规则；当前尚未扣款。','刚刚'],['trip','出发前一天将开放集合提醒','集合地点、车辆和司导信息确认后会显示在“我的行程”。','今天'],['system','多语言翻译功能准备中','行程群消息将支持按手机语言查看译文，原文始终保留。','8月30日']]},
  'zh-TW':{eyebrow:'訊息中心',title:'通知',intro:'只保留與訂單、出發和帳戶安全有關的重要資訊。',filters:{all:'全部',order:'訂單',trip:'旅行團',system:'系統'},icons:{order:'單',trip:'旅',system:'系'},loading:'正在讀取通知',loadingText:'正在核對本人訂單的必要通知。',unavailable:'通知暫時無法使用',empty:'暫無通知',emptyText:'付款、集合、車輛和登車狀態變更後會顯示在這裡。',footer:'司機、司導的工作通知不會混入旅客通知；預設不推送行銷內容。',delivery:{delivered:'已送達',submitted:'已提交，等待管道確認送達',failed:'傳送失敗',suppressed:'已靜默',pending:'平台已建立，等待外部管道送達'},labels:{order:'訂單通知',refund:'退款通知',trip:'旅行團通知',system:'系統通知'},events:{'order-confirmed':['訂單已確認','付款已受理並進入履約準備，請繼續留意集合與車輛資訊。'],'refund-completed':['退款已退回原付款方式','退款處理已完成，實際入帳時間以銀行或發卡機構為準。'],'bank-transfer-pending':['銀行轉帳待核對','平台已收到核對請求；銀行入帳與訂單確認是兩個不同狀態。'],'meeting-updated':['集合資訊已變更','請進入行程頁面查看最新時間、地點和步行導航。'],'trip-room-opened':['行程群組已開放','司機、司導和本車旅客可查看當日履約資訊。'],'departure-reminder':['即將出發','請核對集合時間、地點、車輛資訊和建議攜帶物品。'],'departure-delayed':['行程預計延誤','請進入行程頁面查看延誤原因和後續安排。'],'boarding-completed':['登車已確認','工作人員已確認本次登車狀態。'],fallback:['服務狀態更新','請進入訂單或行程頁面查看最新狀態。']},preview:[['order','訂單資料已儲存','可繼續核對旅客資料與取消規則；目前尚未扣款。','剛剛'],['trip','出發前一天將開放集合提醒','集合地點、車輛和司導資訊確認後會顯示在「我的行程」。','今天'],['system','多語言翻譯功能準備中','行程群組訊息將支援依手機語言查看譯文，並保留原文。','8月30日']]},
  ja:{eyebrow:'メッセージセンター',title:'お知らせ',intro:'予約、出発、アカウントの安全に関する重要なお知らせのみ表示します。',filters:{all:'すべて',order:'予約',trip:'ツアー',system:'システム'},icons:{order:'予',trip:'旅',system:'系'},loading:'お知らせを読み込み中',loadingText:'予約に関する必要なお知らせを確認しています。',unavailable:'お知らせを利用できません',empty:'お知らせはありません',emptyText:'支払い、集合、車両、乗車状況に変更があると、ここに表示されます。',footer:'乗務員向けの業務連絡や広告は、旅行者のお知らせには表示されません。',delivery:{delivered:'配信済み',submitted:'送信済み・配信確認待ち',failed:'送信失敗',suppressed:'通知なし',pending:'作成済み・外部配信待ち'},labels:{order:'予約のお知らせ',refund:'返金のお知らせ',trip:'ツアーのお知らせ',system:'システムのお知らせ'},events:{'order-confirmed':['予約が確定しました','支払いを受け付け、運行準備に入りました。集合・車両情報をご確認ください。'],'refund-completed':['返金手続きを完了しました','元のお支払い方法へ返金しました。入金日は銀行またはカード会社により異なります。'],'bank-transfer-pending':['銀行振込を確認中','確認依頼を受け付けました。入金と予約確定は別の状態です。'],'meeting-updated':['集合情報が変更されました','旅程ページで最新の時間、場所、徒歩ルートをご確認ください。'],'trip-room-opened':['旅程チャットを開設しました','乗務員と同じ車両の旅行者が当日の情報を確認できます。'],'departure-reminder':['まもなく出発です','集合時間、場所、車両情報、持ち物をご確認ください。'],'departure-delayed':['遅延が見込まれます','旅程ページで遅延理由と今後の予定をご確認ください。'],'boarding-completed':['乗車確認済み','スタッフが乗車状況を確認しました。'],fallback:['サービス状況の更新','予約または旅程ページで最新状況をご確認ください。']},preview:[['order','予約情報を保存しました','旅行者情報とキャンセル規定を確認できます。まだ決済されていません。','たった今'],['trip','出発前日に集合通知を開始します','集合場所、車両、乗務員情報の確定後に「マイ旅程」に表示します。','今日'],['system','多言語翻訳を準備中です','旅程チャットでは原文を残したまま端末言語の訳文を表示します。','8月30日']]},
  en:{eyebrow:'Message centre',title:'Notifications',intro:'Only important updates about orders, departures and account security are shown here.',filters:{all:'All',order:'Orders',trip:'Trips',system:'System'},icons:{order:'O',trip:'T',system:'S'},loading:'Loading notifications',loadingText:'Checking essential updates for your orders.',unavailable:'Notifications unavailable',empty:'No notifications',emptyText:'Payment, meeting, vehicle and boarding updates will appear here.',footer:'Staff-only notices and marketing are not included in passenger notifications.',delivery:{delivered:'Delivered',submitted:'Sent; awaiting delivery confirmation',failed:'Delivery failed',suppressed:'Suppressed',pending:'Created; awaiting external delivery'},labels:{order:'Order update',refund:'Refund update',trip:'Trip update',system:'System update'},events:{'order-confirmed':['Order confirmed','Payment has been accepted and fulfilment preparation has started. Watch for meeting and vehicle details.'],'refund-completed':['Refund sent to original payment method','Refund processing is complete. Arrival time depends on your bank or card issuer.'],'bank-transfer-pending':['Bank transfer under review','We received the review request. Bank receipt and order confirmation are separate statuses.'],'meeting-updated':['Meeting details changed','Open your trip to see the latest time, location and walking directions.'],'trip-room-opened':['Trip room is open','The driver, guide and passengers in this vehicle can view service information for the day.'],'departure-reminder':['Departure approaching','Check the meeting time, location, vehicle information and suggested items.'],'departure-delayed':['Trip delay expected','Open your trip to see the reason and updated arrangements.'],'boarding-completed':['Boarding confirmed','Staff have confirmed your boarding status.'],fallback:['Service status updated','Open your order or trip to view the latest status.']},preview:[['order','Order details saved','You can review passenger details and cancellation rules. No payment has been taken.','Just now'],['trip','Meeting reminders open one day before departure','Confirmed meeting, vehicle and staff information will appear in My Trips.','Today'],['system','Multilingual translation is being prepared','Trip messages will show a translation in your phone language while preserving the original.','Aug 30']]},
  es:{eyebrow:'Centro de mensajes',title:'Notificaciones',intro:'Aquí solo se muestran avisos importantes sobre pedidos, salidas y seguridad de la cuenta.',filters:{all:'Todas',order:'Pedidos',trip:'Viajes',system:'Sistema'},icons:{order:'P',trip:'V',system:'S'},loading:'Cargando notificaciones',loadingText:'Comprobando los avisos esenciales de tus pedidos.',unavailable:'Notificaciones no disponibles',empty:'No hay notificaciones',emptyText:'Los cambios de pago, encuentro, vehículo y embarque aparecerán aquí.',footer:'Los avisos internos del personal y la publicidad no se incluyen en las notificaciones de los viajeros.',delivery:{delivered:'Entregada',submitted:'Enviada; esperando confirmación de entrega',failed:'Error de envío',suppressed:'Silenciada',pending:'Creada; esperando entrega externa'},labels:{order:'Aviso del pedido',refund:'Aviso de reembolso',trip:'Aviso del viaje',system:'Aviso del sistema'},events:{'order-confirmed':['Pedido confirmado','El pago ha sido aceptado y ha comenzado la preparación. Consulta los datos del punto de encuentro y del vehículo.'],'refund-completed':['Reembolso enviado al método de pago original','El reembolso se ha procesado. El plazo de abono depende del banco o emisor de la tarjeta.'],'bank-transfer-pending':['Transferencia bancaria en revisión','Hemos recibido la solicitud. La recepción bancaria y la confirmación del pedido son estados distintos.'],'meeting-updated':['Datos del encuentro actualizados','Abre tu viaje para consultar la hora, el lugar y la ruta a pie más recientes.'],'trip-room-opened':['La sala del viaje está abierta','El conductor, el guía y los pasajeros del vehículo pueden consultar la información del día.'],'departure-reminder':['La salida se acerca','Comprueba la hora, el lugar, el vehículo y los artículos recomendados.'],'departure-delayed':['Se prevé un retraso','Abre tu viaje para consultar el motivo y los nuevos horarios.'],'boarding-completed':['Embarque confirmado','El personal ha confirmado tu estado de embarque.'],fallback:['Estado del servicio actualizado','Abre el pedido o el viaje para consultar el estado más reciente.']},preview:[['order','Datos del pedido guardados','Puedes revisar los datos del pasajero y las reglas de cancelación. Aún no se ha cobrado.','Ahora'],['trip','Los recordatorios se activan un día antes','Los datos confirmados del encuentro, vehículo y personal aparecerán en Mis viajes.','Hoy'],['system','La traducción multilingüe está en preparación','Los mensajes mostrarán una traducción en el idioma del teléfono y conservarán el original.','30 ago.']]},
  vi:{eyebrow:'Trung tâm tin nhắn',title:'Thông báo',intro:'Chỉ hiển thị thông tin quan trọng về đơn hàng, khởi hành và bảo mật tài khoản.',filters:{all:'Tất cả',order:'Đơn hàng',trip:'Chuyến đi',system:'Hệ thống'},icons:{order:'Đ',trip:'Đi',system:'H'},loading:'Đang tải thông báo',loadingText:'Đang kiểm tra thông báo cần thiết cho đơn hàng.',unavailable:'Tạm thời không thể xem thông báo',empty:'Chưa có thông báo',emptyText:'Cập nhật thanh toán, điểm hẹn, xe và lên xe sẽ hiển thị tại đây.',footer:'Thông báo nội bộ cho nhân viên và nội dung quảng cáo không hiển thị cho hành khách.',delivery:{delivered:'Đã gửi',submitted:'Đã gửi, đang chờ xác nhận',failed:'Gửi thất bại',suppressed:'Đã tắt',pending:'Đã tạo, đang chờ kênh ngoài'},labels:{order:'Thông báo đơn hàng',refund:'Thông báo hoàn tiền',trip:'Thông báo chuyến đi',system:'Thông báo hệ thống'},events:{'order-confirmed':['Đơn hàng đã xác nhận','Thanh toán đã được tiếp nhận và chuyến đi đang được chuẩn bị. Hãy theo dõi thông tin điểm hẹn và xe.'],'refund-completed':['Đã hoàn tiền về phương thức ban đầu','Xử lý hoàn tiền đã hoàn tất. Thời gian nhận tùy ngân hàng hoặc đơn vị phát hành thẻ.'],'bank-transfer-pending':['Đang kiểm tra chuyển khoản','Đã nhận yêu cầu kiểm tra. Ngân hàng nhận tiền và xác nhận đơn là hai trạng thái khác nhau.'],'meeting-updated':['Thông tin điểm hẹn đã thay đổi','Mở chuyến đi để xem thời gian, địa điểm và đường đi bộ mới nhất.'],'trip-room-opened':['Phòng chuyến đi đã mở','Tài xế, hướng dẫn viên và hành khách cùng xe có thể xem thông tin trong ngày.'],'departure-reminder':['Sắp khởi hành','Kiểm tra thời gian, địa điểm, thông tin xe và đồ dùng được khuyến nghị.'],'departure-delayed':['Chuyến đi dự kiến trễ','Mở chuyến đi để xem lý do và lịch trình cập nhật.'],'boarding-completed':['Đã xác nhận lên xe','Nhân viên đã xác nhận trạng thái lên xe.'],fallback:['Trạng thái dịch vụ đã cập nhật','Mở đơn hàng hoặc chuyến đi để xem trạng thái mới nhất.']},preview:[['order','Đã lưu thông tin đơn hàng','Bạn có thể kiểm tra thông tin hành khách và quy định hủy. Chưa có khoản tiền nào bị trừ.','Vừa xong'],['trip','Nhắc điểm hẹn mở trước một ngày','Thông tin điểm hẹn, xe và nhân viên sẽ hiển thị trong Chuyến đi của tôi sau khi xác nhận.','Hôm nay'],['system','Đang chuẩn bị dịch đa ngôn ngữ','Tin nhắn chuyến đi sẽ hiển thị bản dịch theo ngôn ngữ điện thoại và giữ nguyên bản gốc.','30 thg 8']]},
  ne:{eyebrow:'सन्देश केन्द्र',title:'सूचनाहरू',intro:'अर्डर, प्रस्थान र खाता सुरक्षासम्बन्धी महत्त्वपूर्ण जानकारी मात्र यहाँ देखाइन्छ।',filters:{all:'सबै',order:'अर्डर',trip:'यात्रा',system:'प्रणाली'},icons:{order:'अ',trip:'या',system:'प्र'},loading:'सूचनाहरू लोड हुँदैछन्',loadingText:'तपाईंका अर्डरका आवश्यक सूचनाहरू जाँचिँदैछन्।',unavailable:'सूचना अहिले उपलब्ध छैन',empty:'कुनै सूचना छैन',emptyText:'भुक्तानी, भेट्ने स्थान, सवारी र चढ्ने स्थितिका परिवर्तन यहाँ देखिनेछन्।',footer:'चालक र गाइडका आन्तरिक सूचना तथा प्रचार सामग्री यात्रीको सूचनामा देखाइँदैनन्।',delivery:{delivered:'पुग्यो',submitted:'पठाइयो; प्राप्ति पुष्टि पर्खँदै',failed:'पठाउन असफल',suppressed:'मौन राखियो',pending:'तयार भयो; बाह्य माध्यमबाट पठाउन बाँकी'},labels:{order:'अर्डर सूचना',refund:'रकम फिर्ता सूचना',trip:'यात्रा सूचना',system:'प्रणाली सूचना'},events:{'order-confirmed':['अर्डर पुष्टि भयो','भुक्तानी स्वीकार गरी यात्राको तयारी सुरु भएको छ। भेट्ने स्थान र सवारी जानकारी हेर्नुहोस्।'],'refund-completed':['मूल भुक्तानी माध्यममा रकम फिर्ता पठाइयो','रकम फिर्ता प्रक्रिया पूरा भयो। खातामा आउने समय बैंक वा कार्ड जारीकर्तामा निर्भर हुन्छ।'],'bank-transfer-pending':['बैंक ट्रान्सफर जाँच हुँदैछ','जाँच अनुरोध प्राप्त भयो। बैंकमा रकम प्राप्त हुनु र अर्डर पुष्टि हुनु फरक स्थिति हुन्।'],'meeting-updated':['भेट्ने जानकारी परिवर्तन भयो','नयाँ समय, स्थान र पैदल मार्ग हेर्न आफ्नो यात्रा खोल्नुहोस्।'],'trip-room-opened':['यात्रा कोठा खुल्यो','चालक, गाइड र यस सवारीका यात्रीले आजको सेवा जानकारी हेर्न सक्छन्।'],'departure-reminder':['प्रस्थान नजिकिँदैछ','भेट्ने समय, स्थान, सवारी जानकारी र आवश्यक सामान जाँच्नुहोस्।'],'departure-delayed':['यात्रा ढिलो हुने अनुमान छ','कारण र नयाँ व्यवस्था हेर्न आफ्नो यात्रा खोल्नुहोस्।'],'boarding-completed':['सवारी चढेको पुष्टि भयो','कर्मचारीले तपाईंको चढ्ने स्थिति पुष्टि गरेका छन्।'],fallback:['सेवा स्थिति अद्यावधिक भयो','नयाँ स्थिति हेर्न अर्डर वा यात्रा पृष्ठ खोल्नुहोस्।']},preview:[['order','अर्डर विवरण सुरक्षित भयो','यात्री विवरण र रद्द नियम जाँच्न सक्नुहुन्छ। अहिलेसम्म रकम काटिएको छैन।','भर्खरै'],['trip','प्रस्थानको एक दिनअघि भेट्ने सूचना खुल्छ','पुष्टि भएको भेट्ने स्थान, सवारी र कर्मचारी जानकारी मेरा यात्रामा देखिनेछ।','आज'],['system','बहुभाषिक अनुवाद तयार हुँदैछ','यात्रा सन्देशले मूल पाठ राखेर फोनको भाषामा अनुवाद देखाउनेछ।','अगस्ट ३०']]},
  ko:{eyebrow:'메시지 센터',title:'알림',intro:'예약, 출발 및 계정 보안과 관련된 중요한 정보만 표시합니다.',filters:{all:'전체',order:'예약',trip:'여행',system:'시스템'},icons:{order:'예',trip:'여',system:'계'},loading:'알림 불러오는 중',loadingText:'예약에 필요한 알림을 확인하고 있습니다.',unavailable:'알림을 이용할 수 없습니다',empty:'알림 없음',emptyText:'결제, 집합, 차량 및 탑승 상태가 변경되면 여기에 표시됩니다.',footer:'기사와 가이드의 내부 업무 알림 및 광고는 승객 알림에 표시되지 않습니다.',delivery:{delivered:'전달 완료',submitted:'전송됨·전달 확인 대기',failed:'전송 실패',suppressed:'알림 없음',pending:'생성됨·외부 전달 대기'},labels:{order:'예약 알림',refund:'환불 알림',trip:'여행 알림',system:'시스템 알림'},events:{'order-confirmed':['예약이 확정되었습니다','결제가 접수되어 여행 준비를 시작했습니다. 집합 및 차량 정보를 확인하세요.'],'refund-completed':['원래 결제 수단으로 환불했습니다','환불 처리가 완료되었습니다. 실제 입금 시점은 은행 또는 카드사에 따라 다릅니다.'],'bank-transfer-pending':['계좌이체 확인 중','확인 요청을 받았습니다. 은행 입금과 예약 확정은 서로 다른 상태입니다.'],'meeting-updated':['집합 정보가 변경되었습니다','여행 페이지에서 최신 시간, 장소 및 도보 길찾기를 확인하세요.'],'trip-room-opened':['여행방이 열렸습니다','기사, 가이드 및 같은 차량의 승객이 당일 운행 정보를 확인할 수 있습니다.'],'departure-reminder':['곧 출발합니다','집합 시간, 장소, 차량 정보 및 준비물을 확인하세요.'],'departure-delayed':['지연이 예상됩니다','여행 페이지에서 지연 사유와 변경된 일정을 확인하세요.'],'boarding-completed':['탑승 확인 완료','직원이 탑승 상태를 확인했습니다.'],fallback:['서비스 상태 업데이트','예약 또는 여행 페이지에서 최신 상태를 확인하세요.']},preview:[['order','예약 정보를 저장했습니다','승객 정보와 취소 규정을 확인할 수 있습니다. 아직 결제되지 않았습니다.','방금'],['trip','출발 하루 전에 집합 알림이 열립니다','확정된 집합 장소, 차량 및 직원 정보가 내 여행에 표시됩니다.','오늘'],['system','다국어 번역 준비 중','여행 메시지는 원문을 유지하면서 휴대전화 언어의 번역을 표시합니다.','8월 30일']]}
};

export function AppNotifications() {
  const { services,state } = useApp();
  const locale=state.ui.locale??'zh-CN';
  const n=notificationCopy[locale]??notificationCopy['zh-CN'];
  const [filter, setFilter] = useState<"all" | "order" | "trip" | "system">(
    "all",
  );
  const previewItems = n.preview.map(([type,title,text,time]:string[])=>({type,label:n.labels[type],title,text,time}));
  const [items, setItems] = useState(previewItems);
  const [loading, setLoading] = useState(Boolean(services));
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!services) {
      setItems(previewItems);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    void services.loadOwnNotifications().then((result) => {
      if (!active) return;
      if (result.error) {
        setError(result.error);
        setItems([]);
        setLoading(false);
        return;
      }
      const copy: Record<
        string,
        {
          type: "order" | "trip" | "system";
          label: string;
          title: string;
          text: string;
        }
      > = {
        "order-confirmed": {
          type: "order",
          label: "订单通知",
          title: "订单已确认",
          text: "付款已受理并进入履约准备，请继续关注集合与车辆资料。",
        },
        "refund-completed": {
          type: "order",
          label: "退款通知",
          title: "退款已原路发起",
          text: "退款处理已完成，实际到账时间以银行或发卡机构为准。",
        },
        "bank-transfer-pending": {
          type: "order",
          label: "订单通知",
          title: "银行转账待核对",
          text: "平台已收到核对请求；银行到账与订单确认是两个不同状态。",
        },
        "meeting-updated": {
          type: "trip",
          label: "旅行团通知",
          title: "集合信息已变更",
          text: "请进入行程房间查看最新时间、地点和步行导航，并确认已知晓。",
        },
        "trip-room-opened": {
          type: "trip",
          label: "旅行团通知",
          title: "行程群已开放",
          text: "司机、司导和本车乘客可在群内查看当日履约信息。",
        },
        "departure-reminder": {
          type: "trip",
          label: "旅行团通知",
          title: "即将出发",
          text: "请核对集合时间、地点、车辆信息和建议携带物品。",
        },
        "departure-delayed": {
          type: "trip",
          label: "旅行团通知",
          title: "行程预计延误",
          text: "请进入行程房间查看司导发布的延误原因和后续安排。",
        },
        "boarding-completed": {
          type: "trip",
          label: "旅行团通知",
          title: "登车已确认",
          text: "本次登车状态已由工作人员确认。",
        },
      };
      void copy;
      setItems(
        result.data.map((row: {
          event_type: string;
          created_at: string;
          status: string;
        }) => {
          const event=n.events[row.event_type]??n.events.fallback;
          const type=(row.event_type==='order-confirmed'||row.event_type==='refund-completed'||row.event_type==='bank-transfer-pending'?'order':row.event_type==='meeting-updated'||row.event_type==='trip-room-opened'||row.event_type==='departure-reminder'||row.event_type==='departure-delayed'||row.event_type==='boarding-completed'?'trip':'system') as 'order'|'trip'|'system';
          const template = {type,label:row.event_type==='refund-completed'?n.labels.refund:n.labels[type],title:event[0],text:event[1]};
          return {
            ...template,
            time: new Intl.DateTimeFormat(locale, {
              timeZone: "Asia/Tokyo",
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(row.created_at)),
            deliveryStatus: row.status,
          };
        }),
      );
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [services,locale]);
  return (
    <div className="passenger-page">
      <AppTitle
        eyebrow={n.eyebrow}
        title={n.title}
        text={n.intro}
      />
      <div className="notification-filters">
        {(
          [
            ["all", n.filters.all],
            ["order", n.filters.order],
            ["trip", n.filters.trip],
            ["system", n.filters.system],
          ] as const
        ).map(([key, label]) => (
          <button
            className={filter === key ? "active" : ""}
            onClick={() => setFilter(key)}
            key={key}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <Empty title={n.loading} text={n.loadingText} />
      ) : error ? (
        <Empty title={n.unavailable} text={error} />
      ) : items.length === 0 ? (
        <Empty
          title={n.empty}
          text={n.emptyText}
        />
      ) : (
        <div className="notification-list">
          {items
            .filter((item:any) => filter === "all" || item.type === filter)
            .map((item:any, index:number) => (
              <article key={`${item.title}-${item.time}-${index}`}>
                <i>
                  {n.icons[item.type]}
                </i>
                <div>
                  <span>
                    {item.label} · {item.time}
                  </span>
                  <h2>{item.title}</h2>
                  <p>{item.text}</p>
                  {"deliveryStatus" in item && (
                    <small>
                      {n.delivery[item.deliveryStatus]??n.delivery.pending}
                    </small>
                  )}
                </div>
              </article>
            ))}
        </div>
      )}
      <p className="passenger-page-note">
        {n.footer}
      </p>
    </div>
  );
}

export function AppGuides() {
  const steps = [
    ["01", "选择路线", "先查看景点、步行强度、餐食和费用包含项目。"],
    ["02", "选择日期", "日历显示当日价格、余位和出发时间；选择前请再次核对。"],
    ["03", "填写乘客", "填写联系人、参加者和儿童座椅或无障碍等特殊需求。"],
    ["04", "确认订单", "核对日期、人数、金额、取消规则和旅行条件后提交。"],
    [
      "05",
      "完成付款",
      "付款成功后等待运营确认；已付款不等于车辆和集合信息已全部确定。",
    ],
    [
      "06",
      "准备出发",
      "订单确认后查看集合地图；出发前留意车辆、司导和天气通知。",
    ],
  ];
  return (
    <div className="passenger-page">
      <AppTitle
        eyebrow="第一次参加"
        title="从选择路线到顺利出发"
        text="把预约状态、集合方式和出发准备一次说明清楚。"
      />
      <div className="guide-feature">
        <img src="/images/kyoto-nara.jpg" alt="京都古街" />
        <div>
          <span>预约指南</span>
          <h2>六步完成一日游预约</h2>
          <p>
            每一步都可以返回核对；只有订单显示“已确认”，才代表预约最终成立。
          </p>
          <Link to="/app/trips">开始选择路线 →</Link>
        </div>
      </div>
      <section className="booking-flow-guide">
        <header>
          <span>BOOKING FLOW</span>
          <h2>预约到出发</h2>
        </header>
        {steps.map(([number, title, text]) => (
          <article key={number}>
            <i>{number}</i>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="booking-status-guide">
        <span>订单状态怎么看</span>
        <h2>四个状态，不要混淆</h2>
        <div>
          <p>
            <b>资料已保存</b>尚未付款，也不代表占位成功。
          </p>
          <p>
            <b>待付款</b>请在订单显示的期限内完成付款。
          </p>
          <p>
            <b>已付款</b>款项已受理，等待运营完成最终确认。
          </p>
          <p>
            <b>已确认</b>预约成立；集合与车辆资料会按确认进度更新。
          </p>
        </div>
      </section>
      <div className="guide-list" id="food">
        <article>
          <span>餐食推荐</span>
          <h2>京都与奈良的一日用餐建议</h2>
          <p>了解午餐自理、过敏信息申报和行程中的用餐时间安排。</p>
        </article>
        <article id="meeting">
          <span>集合指南</span>
          <h2>如何快速找到集合车辆</h2>
          <p>
            分别确认集合时间和出发时间，提前查看地标、车站出口、实景照片及步行路线。
          </p>
        </article>
        <article>
          <span>旅行礼仪</span>
          <h2>神社、温泉与观光巴士礼仪</h2>
          <p>用简单的准备，让自己和同团旅客都更舒适。</p>
        </article>
      </div>
    </div>
  );
}

export function AppSupport() {
  const {state}=useApp();
  const s=supportCopy[state.ui.locale??'zh-CN'];
  const [open, setOpen] = useState("");
  const faqs = s.faqs.map((item,index)=>[String(index),...item] as const);
  return (
    <div className="passenger-page">
      <AppTitle
        eyebrow={s.eyebrow}
        title={s.title}
        text={s.text}
      />
      <div className="support-actions">
        <Link to="/app/orders">
          <i>№</i>
          <b>{s.order}</b>
          <span>{s.orderText}</span>
        </Link>
        <Link to="/app/my-trip/room">
          <i>→</i>
          <b>{s.day}</b>
          <span>{s.dayText}</span>
        </Link>
      </div>
      <div className="support-faq">
        <h2>{s.faq}</h2>
        {faqs.map(([key, title, text]) => (
          <article key={key}>
            <button
              onClick={() => setOpen(open === key ? "" : key)}
              aria-expanded={open === key}
            >
              <b>{title}</b>
              <span>{open === key ? "−" : "＋"}</span>
            </button>
            {open === key && <p>{text}</p>}
          </article>
        ))}
      </div>
      <a
        className="button full"
        href="mailto:alerts@japan-travel.info?subject=Japan%20Travel%20Weekend%20Support"
      >
        {s.mail}
      </a>
      <p className="passenger-page-note">
        {s.note}
      </p>
    </div>
  );
}
export function AppTrips() {
  const {state}=useApp();
  const r=passengerRoutesCopy[state.ui.locale ?? 'zh-CN'];
  return (
    <div className="route-catalog">
      <AppTitle
        eyebrow={r.eyebrow}
        title={r.title}
        text={r.text}
      />
      <div className="catalog-intro">
        <b>{trips.length} {r.selected}</b>
        <span>{r.catalogMeta}</span>
      </div>
      <div className="app-list route-card-list">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} app locale={state.ui.locale ?? 'zh-CN'} />
        ))}
      </div>
    </div>
  );
}
export function AppTrip() {
  const t = travelRepository.getTrip(useParams().slug || "");
  const { departures,state } = useApp();
  const locale=state.ui.locale ?? 'zh-CN';
  const r=passengerRoutesCopy[locale];
  const [activeDetailTab, setActiveDetailTab] = useState<
    "highlights" | "schedule" | "prep"
  >("highlights");
  if (!t) return <Empty title={r.notFound} />;
  const routeDepartures = departures.filter((item) => item.tripSlug === t.slug);
  const sellable = routeDepartures.filter(
    (item) => item.price != null && item.availableSeats !== 0,
  );
  const richSpots=featuredRouteSpots[t.slug]?.[locale]??null;
  const routePitch=t.catalogSource==='published'?null:featuredRoutePitch[t.slug]?.[locale]??null;
  const displayTrip=localizedTripSummary(locale,t);
  const detail=routeDetailExtra[locale];
  const routeText=routeContentFallback[locale];
  const expandedSummary=t.catalogSource==='published'?null:expandedRouteSummary(locale,t.slug);
  const fallbackSpots=displayTrip.stops.map((name,index)=>({name,location:displayTrip.region,intro:routeText.spot(name),history:'',highlights:[] as string[],tip:'',time:t.timeline[index]?.time,imageUrl:t.timeline[index]?.imageUrl,stayMinutes:t.timeline[index]?.stayMinutes}));
  const publishedSpots=t.timeline.map(item=>({name:item.title,location:item.location||displayTrip.region,intro:item.detail,history:'',highlights:item.highlights??[],tip:item.tip??'',time:item.time,imageUrl:item.imageUrl,stayMinutes:item.stayMinutes}));
  const displayedSpots=t.catalogSource==='published'?(publishedSpots.length?publishedSpots:fallbackSpots):richSpots??fallbackSpots;
  return (
    <div className="route-detail-page">
      <section className="route-detail-hero">
        <img src={t.heroImage} alt={displayTrip.name} />
        <div className="route-detail-overlay">
          <span>
            {compactTripMeta(displayTrip.region,displayTrip.duration)}
          </span>
          <h1>{displayTrip.name}</h1>
          <p>{displayTrip.stops.join(' · ')}</p>
        </div>
      </section>
      <div className="route-facts">
        <span>
          <small>{r.duration}</small>
          <b>{displayTrip.duration}</b>
        </span>
        <span>
          <small>{r.walking}</small>
          <b>{t.walkingLevel||detail.walking}</b>
        </span>
        <span>
          <small>{r.service}</small>
          <b>{t.languages.length?t.languages.join(' · '):detail.languages}</b>
        </span>
      </div>
      <p className="route-lead">{routePitch?.lead ?? expandedSummary?.summary ?? (t.catalogSource==='published'&&t.summary?t.summary:routeText.lead(displayTrip.stops.join('、')))}</p>
      {routePitch&&<div className="route-fit-tags" aria-label="适合人群">{routePitch.fit.map(item=><span key={item}>{item}</span>)}</div>}
      <section className="route-trust-strip" aria-label={detail.trust}>
        <span>
          <b>{r.roundTrip}</b>
          <small>{r.roundTripText}</small>
        </span>
        <span>
          <b>{r.transparent}</b>
          <small>{r.transparentText}</small>
        </span>
        <span>
          <b>{r.notices}</b>
          <small>{r.noticesText}</small>
        </span>
      </section>
      <section className="route-detail-window">
        <nav
          className="route-section-nav"
          aria-label={detail.nav}
          role="tablist"
        >
          {(
            [
              ["highlights", r.highlights],
              ["schedule", r.schedule],
              ["prep", r.prep],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeDetailTab === key}
              className={activeDetailTab === key ? "active" : ""}
              onClick={() => setActiveDetailTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="route-tab-panel" role="tabpanel">
          {activeDetailTab === "highlights" && (
            <>
              <section className="route-reasons">
                <header>
                  <span>WHY THIS TRIP</span>
                  <h2>{r.why}</h2>
                </header>
                <div>
                  {displayedSpots.slice(0,3).map((item, index) => (
                    <article key={item.name}>
                      <i>{String(index + 1).padStart(2, "0")}</i>
                      <h3>{item.name}</h3>
                      <p>{richSpots?item.intro:routeText.reason(item.name)}</p>
                    </article>
                  ))}
                </div>
              </section>
              <section className="route-spot-preview">
                <header>
                  <span>SPOT PREVIEW</span>
                  <h2>{r.spots}</h2>
                </header>
                <div>
                  {displayedSpots
                    .map((item, index) => (
                      <article key={item.name}>
                        <b>{String(index + 1).padStart(2, "0")}</b>
                        <div>
                          <span>{item.location}</span>
                          <h3>{item.name}</h3>
                          <RoutePlacePhoto id={`${t.slug}-spot-${index}`} name={item.name} query={routePlaceQueries[t.slug]?.[index]??`${item.name} Japan`} fallbackUrl={t.heroImage} {...routePhotoAt(t.slug,index)} url={item.imageUrl??routePhotoAt(t.slug,index)?.url} locale={locale}/>
                          <>
                            <p>{item.intro}</p>
                            {item.history&&<p>{item.history}</p>}
                            {item.highlights.length>0&&<ul className="check-list">{item.highlights.map(point=><li key={point}>{point}</li>)}</ul>}
                            {item.stayMinutes&&<p className="privacy">预计停留约 {item.stayMinutes} 分钟</p>}
                            {item.tip&&<p className="notice">{item.tip}</p>}
                          </>
                        </div>
                      </article>
                    ))}
                </div>
              </section>
            </>
          )}
          {activeDetailTab === "schedule" && (
            <>
              <div className="route-panel-heading">
                <span>DAY SCHEDULE</span>
                <h2>{r.daySchedule}</h2>
                <p>{r.scheduleNote}</p>
              </div>
              <div className="route-timeline">
                {(locale==='zh-CN'?t.timeline:fallbackSpots).map((item, index) => (
                  <article key={`${('title' in item?item.title:item.name)}-${index}`}>
                    <span>{item.time ?? routeText.time}</span>
                    <div>
                      <h3>{'title' in item?item.title:item.name}</h3>
                      <b>{item.location}</b>
                      {routePhotoQuery(t.slug,'title' in item?item.title:item.name,index)&&<RoutePlacePhoto id={`${t.slug}-schedule-${index}`} name={'title' in item?item.title:item.name} query={routePhotoQuery(t.slug,'title' in item?item.title:item.name,index)!} fallbackUrl={t.heroImage} locale={locale}/>}
                      <p>{'detail' in item?item.detail:item.intro}</p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="route-detail-grid">
                <section>
                  <h2>{routeText.suitable}</h2><ul className="check-list"><li>{routeText.suitableText}</li></ul>
                </section>
                <section>
                  <h2>{routeText.meal}</h2><p>{routeText.mealText}</p>
                </section>
                <section>
                  <h2>{routeText.included}</h2><ul><li>{routeText.includedText}</li></ul>
                </section>
                <section>
                  <h2>{routeText.excluded}</h2><ul><li>{routeText.excludedText}</li></ul>
                </section>
              </div>
            </>
          )}
          {activeDetailTab === "prep" && (
            <>
              <section className="travel-prep-section">
                <header>
                  <span>{routeText.prep}</span><h2>{routeText.prepTitle}</h2><p>{routeText.prepText}</p>
                </header>
                <div className="travel-prep-grid">
                  <details open>
                    <summary>
                      <i>包</i>
                      <span>
                        <b>{routeText.carry}</b><small>{routeText.carryText}</small>
                      </span>
                    </summary>
                    <ul>
                      <li>{routeText.carryText}</li>
                    </ul>
                  </details>
                  <details>
                    <summary>
                      <i>衣</i>
                      <span>
                        <b>{routeText.wear}</b><small>{routeText.wearText}</small>
                      </span>
                    </summary>
                    <p>{routeText.wearText}</p>
                  </details>
                  <details>
                    <summary>
                      <i>心</i>
                      <span>
                        <b>{routeText.reminder}</b><small>{routeText.reminderText}</small>
                      </span>
                    </summary>
                    <ul>
                      <li>{routeText.reminderText}</li>
                    </ul>
                  </details>
                </div>
              </section>
              <section className="route-booking-notices">
                <span>BOOKING NOTES</span>
                  <h2>{routeText.notes}</h2>
                <ul className="check-list"><li>{routeText.prepText}</li><li>{routeText.reminderText}</li></ul>
              </section>
            </>
          )}
        </div>
      </section>
      <div className="route-booking-bar">
        <div>
          <small>{sellable.length ? detail.min : detail.open}</small>
          <b>
            {sellable.length
              ? `¥${Math.min(...sellable.map((item) => item.price as number)).toLocaleString("ja-JP")}`
              : detail.pending}
          </b>
        </div>
        <Link className="button" to={`/app/booking/${t.slug}`}>
          {sellable.length ? r.book : r.availability}
        </Link>
      </div>
    </div>
  );
}
export function BookingPage() {
  const t = travelRepository.getTrip(useParams().slug || "") ?? trips[0];
  const { state, updateBooking, departures, departuresResolved } = useApp();
  const locale=state.ui.locale ?? 'zh-CN';
  const b=passengerBookingCopy[locale];
  const sales=bookingSalesCopy[locale];
  const displayTrip=localizedTripSummary(locale,t);
  const deps = departures.filter((d) => d.tripSlug === t.slug);
  const nav = useNavigate();
  const location=useLocation();
  const requestedDepartureId=new URLSearchParams(location.search).get('departureId');
  const sellable = deps.filter(
    (departure) => departure.price != null && departure.availableSeats !== 0,
  );
  const sortedDatedDepartures = deps
    .filter((departure) => departure.departureTime)
    .sort(
      (a, b) =>
        new Date(a.departureTime!).getTime() -
        new Date(b.departureTime!).getTime(),
    );
  const firstDepartureTime=sortedDatedDepartures[0]?.departureTime?new Date(sortedDatedDepartures[0].departureTime!).getTime():null;
  const datedDepartures=firstDepartureTime==null?sortedDatedDepartures:sortedDatedDepartures.filter(item=>new Date(item.departureTime!).getTime()<firstDepartureTime+30*24*60*60*1000);
  const displayedDepartures = datedDepartures.length ? datedDepartures : deps;
  const firstDisplayedSellable = displayedDepartures.find(
    (item) => item.price != null && item.availableSeats !== 0,
  );
  const calendarWeekdays = Array.from({length:7},(_,index)=>new Intl.DateTimeFormat(locale,{weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date(Date.UTC(2024,0,index+1))));
  const initialDeparture =
    requestedDepartureId
      ? (displayedDepartures.some(item=>item.id===requestedDepartureId)?requestedDepartureId:'')
      : state.booking?.tripSlug === t.slug &&
    displayedDepartures.some((item) => item.id === state.booking?.departureId)
      ? state.booking.departureId
      : (firstDisplayedSellable?.id ?? "");
  const [selectedDeparture, setSelectedDeparture] = useState(initialDeparture);
  const [adults, setAdults] = useState(
    state.booking?.tripSlug === t.slug ? (state.booking?.adults ?? 1) : 1,
  );
  const selection=resolveDepartureSelection({requestedId:requestedDepartureId,selectedId:selectedDeparture,departures:displayedDepartures,resolved:departuresResolved});
  const invalidRequestedDeparture=selection.invalidRequested;
  const effectiveDepartureId=selection.selectedId;
  useEffect(()=>{
    if(departuresResolved&&selection.selectedId!==selectedDeparture)setSelectedDeparture(selection.selectedId);
  },[departuresResolved,selectedDeparture,selection.selectedId]);
  const departureMonths=groupDeparturesByMonth(displayedDepartures,locale);
  const chosen = sellable.find((item) => item.id === effectiveDepartureId);
  const bookingTotal = seatOrderTotal(
    chosen?.price,
    adults,
  );
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const departureId = String(f.get("departure"));
    if (!sellable.some((departure) => departure.id === departureId)) return;
    updateBooking({
      tripSlug: t.slug,
      departureId,
      adults: Number(f.get("adults")),
      children: 0,
      infants: 0,
    });
    nav("/app/passengers");
  };
  return (
    <>
      <BookingSteps current={1} />
      <section className="booking-route-summary">
        <img src={t.heroImage} alt="" />
        <div>
          <span>
            {compactTripMeta(displayTrip.region,displayTrip.duration)}
          </span>
          <h1>{displayTrip.name}</h1>
          <p>{displayTrip.stops.join(" → ")}</p>
        </div>
      </section>
      {deps.length ? (
        <form className="form" onSubmit={submit}>
          {invalidRequestedDeparture&&<p className="booking-note" role="alert">该班次已失效、已停售或不属于当前路线，请重新选择日期；系统不会自动替换为其他班次。</p>}
          <fieldset className="departure-calendar">
            <legend>
              {b.selectDate} <small>{b.next30}</small>
            </legend>
            {departureMonths.map(month=>{
              const firstDay=month.days[0]?.key;
              const firstWeekday=firstDay?new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',weekday:'short'}).format(new Date(`${firstDay}T12:00:00+09:00`)):calendarWeekdays[0];
              const leading=Math.max(0,calendarWeekdays.indexOf(firstWeekday));
              return <section className="departure-calendar-month" key={month.key}>
                <h3>{month.label}</h3>
                <div className="departure-calendar-weekdays" aria-hidden="true">{calendarWeekdays.map(day=><span className={day===calendarWeekdays[5]||day===calendarWeekdays[6]?'weekend':''} key={day}>{day}</span>)}</div>
                <div className="departure-calendar-grid">
                  {Array.from({length:leading},(_,index)=><span className="calendar-blank" aria-hidden="true" key={`blank-${month.key}-${index}`}/>)}
                  {month.days.map(day=>{
                    const date=new Date(`${day.key}T12:00:00+09:00`);
                    const weekday=new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',weekday:'short'}).format(date);
                    const weekend=weekday===calendarWeekdays[5]||weekday===calendarWeekdays[6];
                    return <div className={`departure-calendar-day${weekend?' weekend':''}`} key={day.key}>
                      <b>{new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',day:'numeric'}).format(date)}</b>
                      {day.departures.map(d=><label className={effectiveDepartureId===d.id?'selected':''} key={d.id}>
                        <input required type="radio" name="departure" value={d.id} checked={effectiveDepartureId===d.id} disabled={d.price==null||d.availableSeats===0} onChange={()=>{setSelectedDeparture(d.id);if(requestedDepartureId)nav(location.pathname,{replace:true})}}/>
                        <span>{d.departureTime?new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(new Date(d.departureTime)):''}</span>
                        <small>{d.price==null?b.pending:`¥${d.price.toLocaleString(locale)}`}</small>
                      </label>)}
                    </div>;
                  })}
                </div>
              </section>;
            })}
          </fieldset>
          {chosen && (
            <>
              <div className="selected-departure-summary">
                <div>
                  <span>{b.selectedDate}</span>
                  <b>{chosen.departureTime ? new Intl.DateTimeFormat(locale,{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",weekday:"short"}).format(new Date(chosen.departureTime)) : chosen.dateLabel}</b>
                </div>
                <div>
                  <span>{b.departureTime}</span>
                  <b>
                    {chosen.departureTime
                      ? new Intl.DateTimeFormat(locale, {
                          timeZone: "Asia/Tokyo",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        }).format(new Date(chosen.departureTime))
                      : b.pending}
                  </b>
                </div>
                <div>
                  <span>{b.seatPrice}</span>
                  <b>
                    {chosen.price == null
                      ? b.pending
                      : `¥${chosen.price.toLocaleString(locale)}`}
                  </b>
                </div>
                <div>
                  <span>{b.remaining}</span>
                  <b>
                    {chosen.availableSeats == null
                      ? b.pending
                      : `${chosen.availableSeats} ${sales[8]}`}
                  </b>
                </div>
              </div>
              <p className="booking-calendar-note">
                {chosen.expectedEndTime
                  ? `${b.expectedReturn} ${new Intl.DateTimeFormat(locale, { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(chosen.expectedEndTime))}`
                  : `${b.expectedReturn}: ${b.pending}`}{" "}
                ·{" "}
                {chosen.meetingPointName
                  ? `${b.meeting}: ${localizedMeetingPoint(locale,chosen.meetingPointName)}`
                  : `${b.meeting}: ${b.pending}`}{" "}
                · {b.japanTime}
              </p>
            </>
          )}
          {chosen && !chosen.isSeed && (
            <div className="booking-product-facts" aria-label={sales[0]}>
              <span>
                <small>{sales[1]}</small>
                <b>
                  {chosen.taxIncluded ? sales[2] : sales[3]} ·{" "}
                  {chosen.currency ?? "JPY"}
                </b>
              </span>
              <span>
                <small>{sales[4]}</small>
                <b>
                  {chosen.minimumGuests == null
                    ? sales[6]
                    : `${chosen.minimumGuests} ${sales[7]}`}
                </b>
              </span>
              <span>
                <small>{sales[5]}</small>
                <b>
                  {chosen.salesCloseAt
                    ? new Intl.DateTimeFormat(locale, {
                        timeZone: "Asia/Tokyo",
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(new Date(chosen.salesCloseAt))
                    : sales[6]}
                </b>
              </span>
            </div>
          )}
          <h2 className="booking-subtitle">{b.people}</h2>
          <div className="form-row booking-party-grid">
            <label>
              {b.people}
              <input
                min="1"
                max="6"
                name="adults"
                type="number"
                value={adults}
                onChange={(event) => setAdults(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="booking-note">
            <b>{b.seatNote}</b>
            <p>{b.seatText}</p>
          </div>
          {!sellable.length && (
            <p className="notice" role="status">
              {b.noDeparturesText}
            </p>
          )}
          <div className="booking-submit">
            <span>
              <small>{b.total}</small>
              <b>
                {bookingTotal == null
                  ? "待确认"
                  : `¥${bookingTotal.toLocaleString("ja-JP")}`}
              </b>
            </span>
            <button
              className="button"
              disabled={!chosen || adults < 1}
            >
              {b.continue}
            </button>
          </div>
        </form>
      ) : (
        <Empty
          title={b.noDepartures}
          text={b.noDeparturesText}
        />
      )}
    </>
  );
}
export function Passengers() {
  const { state, updateBooking, departures } = useApp();
  const locale=state.ui.locale ?? 'zh-CN';
  const p=passengerFormCopy[locale];
  const nav = useNavigate();
  const childCount = 0;
  const [seatChoice, setSeatChoice] = useState<ChildSeatChoice | "">("");
  const [hasStroller, setHasStroller] = useState(false);
  const selectedDeparture = departures.find(
    (departure) => departure.id === state.booking?.departureId,
  );
  const selectedTrip = travelRepository.getTrip(state.booking?.tripSlug ?? "");
  const displayTrip=selectedTrip?localizedTripSummary(locale,selectedTrip):null;
  const partySize =
    (state.booking?.adults ?? 0);
  const bookingReady = Boolean(
    selectedDeparture &&
    selectedDeparture.price != null &&
    selectedDeparture.availableSeats !== 0,
  );
  if (!bookingReady)
    return (
      <Navigate
        replace
        to={`/app/booking/${state.booking?.tripSlug ?? "kyoto-nara-classic"}?reason=select-departure`}
      />
    );
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const assistance = emptyAssistance();
    updateBooking({
      passenger: {
        name: String(f.get("name")),
        nationality: String(f.get("nationality")),
        language: String(f.get("language")),
        phone: String(f.get("phone")),
        emergency: String(f.get("emergency")),
        dietary: String(f.get("dietary")),
        notes: String(f.get("notes")),
      },
      assistance,
    });
    nav("/app/checkout");
  };
  return (
    <>
      <BookingSteps current={2} />
      <AppTitle
        eyebrow={p.step}
        title={p.title}
        text={p.text}
      />
      <div className="passenger-trip-summary">
        <span>{selectedDeparture?.departureTime ? new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(selectedDeparture.departureTime)) : selectedDeparture?.dateLabel}</span>
        <b>{displayTrip?.name}</b>
        <small>
          {partySize} {passengerOrderCopy[locale].seats}
        </small>
      </div>
      <form className="form" onSubmit={submit}>
        <section className="form-section">
          <header>
            <span>01</span>
            <div>
              <h2>{p.contact}</h2>
              <p>{p.contactText}</p>
            </div>
          </header>
          <label>
            {p.name} <span aria-hidden="true">*</span>
            <input
              required
              name="name"
              autoComplete="name"
              placeholder={p.namePlaceholder}
            />
          </label>
          <label>
            {p.nationality} <span aria-hidden="true">*</span>
            <input
              required
              name="nationality"
              autoComplete="country-name"
              placeholder={p.nationalityPlaceholder}
            />
          </label>
          <label>
            {p.language} <span aria-hidden="true">*</span>
            <select required name="language">
              <option>简体中文</option>
              <option>繁體中文</option>
              <option>日本語</option>
              <option>English</option>
              <option>Tiếng Việt</option>
              <option>नेपाली</option>
              <option>한국어</option>
            </select>
          </label>
          <label>
            {p.phone} <span aria-hidden="true">*</span>
            <input
              required
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder={p.phonePlaceholder}
            />
          </label>
          <label>
            {p.emergency} <span aria-hidden="true">*</span>
            <input required name="emergency" placeholder={p.emergencyPlaceholder} />
          </label>
        </section>
        {false && <><div className="form-section-heading">
          <span>02</span>
          <div>
            <h2>{p.assistance}</h2>
            <p>{p.assistanceText}</p>
          </div>
        </div>
        {childCount > 0 && (
          <fieldset className="assistance-module">
            <legend>{p.childNeeds}</legend>
            <p>
              本订单包含 {childCount}{" "}
              名儿童。年龄用于运营判断乘车需求；身高和体重字段已在结构中预留，本轮不收集。
            </p>
            {Array.from({ length: childCount }, (_, index) => (
              <label key={index}>
                儿童 {index + 1} 年龄
                <input
                  required
                  name={`childAge${index}`}
                  type="number"
                  min="0"
                  max="17"
                  step="1"
                  inputMode="numeric"
                />
              </label>
            ))}
            <label>
              是否需要提供儿童安全座椅
              <select
                required
                name="childSeatChoice"
                value={seatChoice}
                onChange={(event) =>
                  setSeatChoice(event.target.value as ChildSeatChoice | "")
                }
              >
                <option value="" disabled>
                  请选择
                </option>
                <option value="platform">需要平台提供</option>
                <option value="own">自带儿童安全座椅</option>
                <option value="none">不需要</option>
                <option value="contact">暂不确定，需要工作人员联系确认</option>
              </select>
            </label>
            {seatChoice === "platform" && (
              <>
                <label>
                  需要平台提供的数量
                  <input
                    required
                    name="childSeatQuantity"
                    type="number"
                    min="1"
                    max={childCount}
                    step="1"
                    defaultValue="1"
                  />
                </label>
                <p className="notice">
                  需求已提交，设备类型、车辆适配及可能费用需由运营确认，不代表已经租赁成功。
                </p>
              </>
            )}
            <label>
              是否携带婴儿车
              <select
                name="hasStroller"
                value={hasStroller ? "yes" : "no"}
                onChange={(event) =>
                  setHasStroller(event.target.value === "yes")
                }
              >
                <option value="no">不携带</option>
                <option value="yes">携带</option>
              </select>
            </label>
            {hasStroller && (
              <div className="form-row">
                <label>
                  婴儿车数量
                  <input
                    required
                    name="strollerQuantity"
                    type="number"
                    min="1"
                    max={childCount}
                    defaultValue="1"
                  />
                </label>
                <label>
                  是否可折叠
                  <select required name="strollerFoldable">
                    <option value="yes">可折叠</option>
                    <option value="no">不可折叠</option>
                  </select>
                </label>
                <label>
                  是否为大型婴儿车
                  <select required name="strollerOversized">
                    <option value="no">否</option>
                    <option value="yes">是</option>
                  </select>
                </label>
              </div>
            )}
          </fieldset>
        )}
        <fieldset className="assistance-module">
          <legend>{p.otherNeeds}</legend>
          <label>
            大件行李数量
            <input
              name="largeLuggage"
              type="number"
              min="0"
              max="20"
              defaultValue="0"
            />
          </label>
          <label className="check">
            <input name="walker" type="checkbox" /> 携带助行器
          </label>
          <label>
            其他折叠设备
            <input name="foldingEquipment" placeholder="选填，例如折叠推车" />
          </label>
          <label className="check">
            <input name="serviceDog" type="checkbox" /> 携带服务犬（需运营确认）
          </label>
          <label className="check">
            <input name="reducedWalkingMeeting" type="checkbox" />{" "}
            需要减少步行的集合方式
          </label>
          <label>
            其他特殊说明
            <textarea
              name="otherNeeds"
              placeholder="选填；不要填写无关健康诊断"
            />
          </label>
        </fieldset></>}
        <section className="form-section optional-notes">
          <header>
            <span>02</span>
            <div>
              <h2>{p.extra}</h2>
              <p>{p.extraText}</p>
            </div>
          </header>
          <label>
            {p.dietary}
            <textarea name="dietary" placeholder={p.optional} />
          </label>
          <label>
            {p.notes}
            <textarea name="notes" placeholder={p.optional} />
          </label>
        </section>
        <button className="button full">{p.review}</button>
        <p className="privacy">{p.privacy}</p>
      </form>
    </>
  );
}
export function Checkout() {
  const { state, updateBooking, departures } = useApp();
  const locale=state.ui.locale ?? 'zh-CN';
  const x=passengerCheckoutCopy[locale];
  const nav = useNavigate();
  const dep = departures.find((item) => item.id === state.booking?.departureId);
  const guests =
    (state.booking?.adults ?? 0);
  const total = seatOrderTotal(dep?.price, guests);
  const trip = travelRepository.getTrip(state.booking?.tripSlug || "");
  const displayTrip=trip?localizedTripSummary(locale,trip):null;
  const checkout=checkoutExtra[locale];
  const legalLinks=checkoutLegalLinks[locale];
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateBooking({ acceptedCancellation: true, acceptedTerms: true });
    nav("/app/payment");
  };
  if (!state.booking?.passenger || !dep || total == null || guests < 1)
    return (
      <>
        <AppTitle
          eyebrow={x.incomplete}
          title={x.selectValid}
          text={x.selectValidText}
        />
        <Link
          className="button full"
          to={`/app/booking/${state.booking?.tripSlug ?? "kyoto-nara-classic"}`}
        >
          {x.back}
        </Link>
      </>
    );
  return (
    <>
      <BookingSteps current={3} />
      <AppTitle
        eyebrow={x.step}
        title={x.title}
        text={x.text}
      />
      <section className="checkout-hero">
        <img src={trip?.heroImage} alt="" />
        <div>
          <span>{dep.departureTime ? new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(dep.departureTime)) : dep.dateLabel}</span>
          <h2>{displayTrip?.name ?? checkout.pending}</h2>
          <p>
            {guests} {passengerOrderCopy[locale].seats} · {displayTrip?.duration}
          </p>
        </div>
      </section>
      <div className="checkout-section-title">
        <h2>{x.tripCost}</h2>
        <Link to={`/app/booking/${state.booking.tripSlug}`}>{x.edit}</Link>
      </div>
      <div className="receipt checkout-receipt">
        <div>
          <span>{x.trip}</span>
          <b>
            {displayTrip?.name ?? checkout.pending}
          </b>
        </div>
        <div>
          <span>{x.departure}</span>
          <b>{dep.departureTime ? new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(dep.departureTime)) : dep.dateLabel}</b>
        </div>
        <div>
          <span>{checkout.travellers}</span>
          <b>
            {state.booking?.adults ?? 0} {passengerOrderCopy[locale].seats}
          </b>
        </div>
        <div>
          <span>{x.seatPrice}</span>
          <b>{dep?.price == null ? passengerBookingCopy[locale].pending : `¥${dep.price.toLocaleString(locale)}`}</b>
        </div>
        <div>
          <span>{x.total}</span>
          <b className="checkout-total">
            {total == null ? passengerBookingCopy[locale].pending : `¥${total.toLocaleString(locale)}`}
          </b>
        </div>
      </div>
      <div className="checkout-section-title">
        <h2>{x.contact}</h2>
        <Link to="/app/passengers">{x.edit}</Link>
      </div>
      <div className="receipt checkout-contact">
        <div>
          <span>{x.name}</span>
          <b>{state.booking.passenger.name}</b>
        </div>
        <div>
          <span>{x.phone}</span>
          <b>{state.booking.passenger.phone}</b>
        </div>
        <div>
          <span>{x.language}</span>
          <b>{state.booking.passenger.language}</b>
        </div>
      </div>
      <section className="cancellation-summary">
        <header>
          <span>{x.cancel}</span>
          <b>{x.japanTime}</b>
        </header>
        <div>
          <span>
            <b>{x.fullRefund}</b>
          </span>
          <span>
            <b>{x.noRefund}</b>
          </span>
        </div>
        <p>
          {checkout.legal}
        </p>
      </section>
      <form className="form checkout-consent" onSubmit={submit}>
        <label className="check">
          <input required type="checkbox" />{" "}
          <span>{legalLinks.read} <Link target="_blank" rel="noreferrer" to="/legal/cancellation">{legalLinks.cancel}</Link></span>
        </label>
        <label className="check">
          <input required type="checkbox" />{" "}
          <span>{legalLinks.agree} <Link target="_blank" rel="noreferrer" to="/legal/terms">{legalLinks.terms}</Link> {legalLinks.and} <Link target="_blank" rel="noreferrer" to="/legal/privacy">{legalLinks.privacy}</Link></span>
        </label>
        <button className="button full">{x.submit}</button>
      </form>
    </>
  );
}
export function Payment() {
  const { state, services, departures, updateBooking } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftKey] = useState(() => crypto.randomUUID());
  const [checkoutKeys,setCheckoutKeys] = useState(()=>({card:crypto.randomUUID(),bank_transfer:crypto.randomUUID()}));
  const [checkoutError,setCheckoutError]=useState("");
  const [cardSession,setCardSession]=useState<{orderId:string;clientSecret:string}|null>(null);
  const [couponSummary,setCouponSummary]=useState<Awaited<ReturnType<NonNullable<typeof services>['loadOwnReferralSummary']>>>(null);
  const [couponId,setCouponId]=useState('');
  const [serverQuote,setServerQuote]=useState<ServerQuote|null>(null);
  const [quoteStatus,setQuoteStatus]=useState('');
  const [quoteRefresh,setQuoteRefresh]=useState(0);
  const [quoteNeedsConfirmation,setQuoteNeedsConfirmation]=useState(false);
  const production = appConfig.runtimeMode === "production";
  const selectedDeparture = departures.find(
    (item) => item.id === state.booking?.departureId,
  );
  const seatImpact =
    (state.booking?.adults ?? 0) +
    (state.booking?.children ?? 0) +
    (state.booking?.infants ?? 0);
  const payableTotal = seatOrderTotal(selectedDeparture?.price, seatImpact);
  const usableCoupons=couponSummary?.coupons.filter(item=>item.status==='active'&&new Date(item.expiresAt).getTime()>Date.now())??[];
  const selectedCoupon=usableCoupons.find(item=>item.id===couponId);
  const localPrice=selectedDeparture?.price!=null&&selectedCoupon?singleSeatQuote({unitPrice:selectedDeparture.price,seats:seatImpact,discountPercent:selectedCoupon.discountPercent}):null;
  const discountAmount=serverQuote?.discountAmount??localPrice?.discountAmount??0;
  const discountedTotal=serverQuote?.amountDue??(services?.checkoutAvailable?null:(payableTotal==null?null:payableTotal-discountAmount));
  const nav = useNavigate();
  const paymentReady = Boolean(
    state.booking?.passenger &&
    selectedDeparture &&
    payableTotal != null &&
    state.booking?.acceptedCancellation &&
    state.booking?.acceptedTerms,
  );
  const checkoutReady=Boolean(services?.checkoutAvailable&&state.booking?.draftId&&selectedDeparture&&seatImpact>0&&serverQuote&&!quoteNeedsConfirmation);
  useEffect(()=>{let active=true;void services?.loadOwnReferralSummary().then(value=>{if(active)setCouponSummary(value)});return()=>{active=false}},[services]);
  useEffect(()=>{
    let active=true;
    setServerQuote(null);
    if(!services?.checkoutAvailable||!selectedDeparture||seatImpact<1)return()=>{active=false};
    setQuoteStatus('正在向服务器确认班次、价格和优惠…');
    void services.createQuote({departureId:selectedDeparture.id,seats:seatImpact,couponId:couponId||undefined}).then(result=>{
      if(!active)return;
      if(!result||'status' in result){
        setQuoteStatus(result&&result.error==='quote_unavailable'?'当前班次或优惠已变化，请重新选择。':'暂时无法确认最终价格，请稍后重试。');
        return;
      }
      setServerQuote(result);
      setQuoteStatus(`价格已由服务器确认，有效至 ${new Date(result.expiresAt).toLocaleTimeString(state.ui.locale??'zh-CN',{hour:'2-digit',minute:'2-digit'})}`);
    });
    return()=>{active=false};
  },[services,selectedDeparture?.id,seatImpact,couponId,state.ui.locale,quoteRefresh]);
  const saveDraft = async () => {
    if (
      !services ||
      !state.booking?.passenger ||
      !state.booking.assistance ||
      !selectedDeparture ||
      !state.booking.acceptedCancellation ||
      !state.booking.acceptedTerms
    )
      return;
    setSubmitting(true);
    setDraftStatus("正在安全保存订单草稿…");
    const result = await services.saveOwnBookingDraft({
      departureId: selectedDeparture.id,
      adults: state.booking.adults,
      children: state.booking.children,
      infants: state.booking.infants,
      passengerPrivate: state.booking.passenger as unknown as Record<
        string,
        unknown
      >,
      assistancePrivate: state.booking.assistance as unknown as Record<
        string,
        unknown
      >,
      reviewStatus: state.booking.assistance.operationalReviewStatus,
      acceptedCancellation: true,
      acceptedTerms: true,
      idempotencyKey: draftKey,
    });
    setSubmitting(false);
    if (result.id) {
      updateBooking({ draftId: result.id });
      setDraftStatus(
        `订单草稿已保存：${result.id}。尚未发起支付，也未占用正式库存。`,
      );
    } else setDraftStatus(result.error ?? "订单草稿保存失败");
  };
  const startCheckout=async(paymentMethod:'card'|'bank_transfer')=>{
    if(!checkoutReady||!services||!state.booking?.draftId||!selectedDeparture)return;
    if(paymentMethod==='card'&&discountedTotal!==0&&!stripeClient){setCheckoutError('银行卡支付服务暂不可用；可选择银行转账，零元订单仍可直接确认。');return}
    setSubmitting(true);setCheckoutError("");
    const result=await services.createCheckout({draftId:state.booking.draftId,departureId:selectedDeparture.id,seats:seatImpact,idempotencyKey:checkoutKeys[paymentMethod],paymentMethod,couponId:couponId||undefined,quoteId:serverQuote?.quoteId});
    setSubmitting(false);
    if(!result||result.status==='failed'){
      if(result?.status==='failed'&&result.error==='quote_changed'){
        setServerQuote(null);setQuoteNeedsConfirmation(true);setCheckoutKeys({card:crypto.randomUUID(),bank_transfer:crypto.randomUUID()});setQuoteStatus('价格、班次或优惠已发生变化。请获取新报价并再次确认。');setCheckoutError('最终价格已变化，本次没有扣款。');
      }else setCheckoutError(result?.status==='failed'?result.error:'测试支付服务不可用');
      return;
    }
    if(result.status==='confirmed_no_payment'){nav(`/app/payment-result?order_id=${encodeURIComponent(result.orderId)}&free=1`);return}
    if(result.status==='pending_manual_review'){nav(`/app/payment-result?order_id=${encodeURIComponent(result.orderId)}&manual=1&due_at=${encodeURIComponent(result.paymentDueAt)}`);return}
    setCardSession({orderId:result.orderId,clientSecret:result.clientSecret});
  };
  return (
    <>
      <BookingSteps current={4} />
      <AppTitle
        eyebrow="第 4 步，共 4 步"
        title="支付前确认"
        text={checkoutReady?(stripeMode==='test'?"测试模式会先锁定库存，再由 Stripe 测试支付确认；不会产生真实扣款。":"系统会先锁定库存，再由 Stripe 安全确认付款。增值税和最终金额以本页为准。") : "本阶段停在支付前：先保存可恢复的订单草稿，不会发起扣款。"}
      />
      {!paymentReady && (
        <div className="notice" role="alert">
          订单的班次、价格、乘客资料或条款确认不完整。请返回重新核对，系统不会创建付款。
        </div>
      )}
      <div className="receipt" aria-label="费用明细">
        <h2>费用明细</h2>
        <div>
          <span>{travelRepository.getTrip(selectedDeparture?.tripSlug??state.booking?.tripSlug??'')?.shortTitle??'行程'}座位费</span>
          <b>{serverQuote?`${serverQuote.seatCount}席 × ¥${serverQuote.unitPrice.toLocaleString('ja-JP')}　¥${serverQuote.baseFare.toLocaleString('ja-JP')}`:'等待服务器报价'}</b>
        </div>
        {usableCoupons.length>0&&<div><span>选择优惠券（每单限1张）</span><select aria-label="选择优惠券" value={couponId} onChange={event=>setCouponId(event.target.value)} disabled={submitting||Boolean(cardSession)}><option value="">不使用优惠券</option>{usableCoupons.map(item=><option value={item.id} key={item.id}>{item.discountPercent}% OFF · 仅优惠1席 · {new Date(item.expiresAt).toLocaleDateString(state.ui.locale??'zh-CN')}</option>)}</select></div>}
        {selectedCoupon&&<><div><span>{selectedCoupon.discountPercent}%优惠券（仅1席）</span><b>-¥{discountAmount.toLocaleString('ja-JP')}</b></div><p className="privacy">本券仅优惠1个席位，其余{Math.max(0,seatImpact-1)}个席位按原价计算，不与其他优惠叠加。</p></>}
        <div><span>应付合计（日元）</span><b>{discountedTotal==null?'待确认':`¥${discountedTotal.toLocaleString('ja-JP')}`}</b></div>
        {quoteStatus&&<p className="privacy" role="status">{quoteStatus}</p>}
        {quoteNeedsConfirmation&&<button type="button" className="button secondary full" onClick={()=>{setQuoteNeedsConfirmation(false);setQuoteRefresh(value=>value+1)}}>获取新报价并重新确认</button>}
      </div>
      <div className="notice">
        {checkoutReady
          ? stripeMode==='test'?"已连接 Stripe 测试模式。测试卡不会产生真实扣款；订单仍会经过真实库存锁与 Webhook 状态流程。":"已连接 Stripe 正式支付。付款成功后订单才会进入司机履约名单。"
          : production
          ? "支付功能尚未开放。本页只安全保存订单草稿；在线支付不会创建付款请求，银行转账也不会生成收款指示。"
          : "支付功能尚未开放。本页只把草稿保存到隔离测试数据库；Stripe 不会创建 Payment Intent，银行转账也不会生成收款指示。"}
      </div>
      <button
        className="button full"
        disabled={
          !services?.ordersAvailable ||
          !paymentReady ||
          submitting ||
          Boolean(state.booking?.draftId)
        }
        onClick={() => void saveDraft()}
      >
        {state.booking?.draftId
          ? "订单草稿已保存"
          : submitting
            ? "正在保存…"
            : "保存订单草稿（不扣款）"}
      </button>
      {draftStatus && (
        <p className="notice" role="status">
          {draftStatus}
        </p>
      )}
      {state.booking?.draftId && (
        checkoutReady ? <section className="payment-methods" aria-label={stripeMode==='test'?"测试支付方式":"支付方式"}>
          {!cardSession&&<>{discountedTotal===0?<button type="button" disabled={submitting} onClick={()=>void startCheckout('card')}><b>确认免费预订</b><small>优惠券抵扣，无需付款；不连接 Stripe</small></button>:<><button type="button" disabled={submitting||!stripeClient} onClick={()=>void startCheckout('card')}><b>{`${stripeMode==='test'?'确认并测试支付':'确认并支付'} ¥${discountedTotal?.toLocaleString('ja-JP')}`}</b><small>{stripeClient?(stripeMode==='test'?'仅接受 Stripe 测试卡':'由 Stripe 安全处理'):'银行卡支付暂不可用'}</small></button><button type="button" disabled={submitting} onClick={()=>void startCheckout('bank_transfer')}><b>{stripeMode==='test'?'银行转账测试流程':'银行转账'}</b><small>进入人工到账确认状态</small></button></>}</>}
          {checkoutError&&<div className="danger" role="alert">{checkoutError}</div>}
          {cardSession&&stripeClient&&<Elements stripe={stripeClient} options={{clientSecret:cardSession.clientSecret}}><StripePaymentForm locale={state.ui.locale ?? 'zh-CN'} orderId={cardSession.orderId} onComplete={(orderId,status)=>nav(`/app/payment-result?order_id=${encodeURIComponent(orderId)}${status==='processing'?'&processing=1':''}`)}/></Elements>}
        </section> : <Link className="button secondary full" to="/app/orders">查看账户中的订单草稿</Link>
      )}
      <button className="text-link" onClick={() => nav(-1)}>
        返回修改
      </button>
    </>
  );
}
export function PaymentResult() {
  const location = useLocation();
  const nav = useNavigate();
  const { state, services } = useApp();
  const paymentCopy=passengerPaymentCopy[state.ui.locale ?? 'zh-CN'];
  const query = new URLSearchParams(location.search);
  const id =
    (location.state as null | { id?: string })?.id ??
    query.get("order_id") ??
    undefined;
  const order = state.orders.find((item) => item.id === id);
  const [seconds, setSeconds] = useState(3);
  const [remoteOrder, setRemoteOrder] = useState<{
    id: string;
    status: string;
    manual_payment_due_at?: string | null;
  } | null>(null);
  const manual = query.get("manual") === "1";
  const manualPaymentDueAt = remoteOrder?.manual_payment_due_at ?? query.get("due_at");
  useEffect(() => {
    if (!services || !id) return;
    let active = true;
    let attempts = 0;
    const check = async () => {
      const result = await services.loadOwnOrders();
      const found =
        (result.data as Array<{ id: string; status: string; manual_payment_due_at?:string|null }>).find(
          (item) => item.id === id,
        ) ?? null;
      if (active) setRemoteOrder(found);
      attempts += 1;
      if (
        active &&
        found &&
        !["paid", "payment_review", "refunded", "cancelled"].includes(
          found.status,
        ) &&
        attempts < 10
      )
        window.setTimeout(check, 1000);
    };
    void check();
    return () => {
      active = false;
    };
  }, [services, id]);
  useEffect(() => {
    if (!id || services) return;
    const redirect = window.setTimeout(
      () => nav(`/app/orders/${id}`, { replace: true }),
      3000,
    );
    const tick = window.setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => {
      window.clearTimeout(redirect);
      window.clearInterval(tick);
    };
  }, [id, nav, services]);
  if (id && services) {
    const status=remoteOrder?.status;
    const paid = status === "paid" || status === "confirmed";
    const refunded=status==='refunded';
    const cancelled=status==='cancelled'||status==='expired';
    const stateKey=paymentState(status,manual);const stateText=paymentCopy.states[stateKey];
    return (
      <div className="result">
        <div className="result-icon" aria-hidden="true">
          {paid ? "✓" : refunded ? "↩" : cancelled ? "!" : "…"}
        </div>
        <AppTitle
          eyebrow={paymentCopy.eyebrow}
          title={stateText.title}
          text={stateText.description}
        />
        <div className="receipt">
          <div>
            <span>{paymentCopy.orderNumber}</span>
            <b>{id}</b>
          </div>
          <div>
            <span>{paymentCopy.orderStatus}</span>
            <b>{stateText.label}</b>
          </div>
          {manual&&manualPaymentDueAt&&<div><span>{paymentCopy.due}</span><b>{new Date(manualPaymentDueAt).toLocaleString(state.ui.locale ?? "zh-CN",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})}</b></div>}
        </div>
        <Link className="button full" to={`/app/orders/${id}`}>
          {paymentCopy.viewOrder}
        </Link>
      </div>
    );
  }
  return id ? (
    <div className="result">
      <div className="result-icon" aria-hidden="true">
        ✓
      </div>
      <AppTitle
        eyebrow="开发模拟订购状态"
        title="订购成功"
        text="订单已加入“我的账户／我的行程”。未发生真实扣款。"
      />
      <div className="receipt">
        <div>
          <span>订单编号</span>
          <b>{id}</b>
        </div>
        <div>
          <span>订单状态</span>
          <b>已确认（开发模拟）</b>
        </div>
        <div>
          <span>特殊乘车需求</span>
          <b>{order?.assistance.operationalReviewStatus ?? "未提出"}</b>
        </div>
      </div>
      {order?.assistance.operationalReviewStatus !== "未提出" && (
        <p className="notice">
          需求已随订单提交，确认结果将在订单详情中更新；当前不代表设备或服务已提供。
        </p>
      )}
      <p className="countdown" aria-live="polite">
        将在 {seconds} 秒后自动前往本订单详情
      </p>
      <Link className="button full" to={`/app/orders/${id}`}>
        立即查看我的行程
      </Link>
    </div>
  ) : (
    <>
      <AppTitle
        eyebrow="支付状态"
        title="暂时无法确认支付"
        text="支付服务尚未连接，未创建订单，也未扣款。"
      />
      <Link className="button full" to="/app/orders">
        返回我的账户
      </Link>
    </>
  );
}
export function Orders() {
  const { state, services } = useApp();
  const locale=state.ui.locale ?? "zh-CN";
  const c=passengerOrderCopy[locale];
  const [remote, setRemote] = useState<{
    loading: boolean;
    error: string | null;
    rows: Array<{
      id: string;
      departure_id: string;
      seat_count: number;
      status: string;
      manual_payment_due_at?: string | null;
    }>;
  }>({ loading: Boolean(services), error: null, rows: [] });
  const [drafts, setDrafts] = useState<
    Array<{
      id: string;
      departure_id: string;
      adults: number;
      children: number;
      infants: number;
      seat_impact: number;
      operational_review_status: string;
      status: string;
      converted_order_id: string | null;
      converted_at: string | null;
      created_at: string;
      updated_at: string;
      expires_at: string;
    }>
  >([]);
  const [draftNotice, setDraftNotice] = useState("");
  useEffect(() => {
    if (services)
      void Promise.all([
        services.loadOwnOrders(),
        services.loadOwnDrafts(),
      ]).then(([result, draftResult]) => {
        setDrafts(draftResult.data as typeof drafts);
        setRemote({
          loading: false,
          error: result.error ?? draftResult.error,
          rows: result.data as Array<{
            id: string;
            departure_id: string;
            seat_count: number;
            status: string;
            manual_payment_due_at?: string | null;
          }>,
        });
      });
  }, [services]);
  return (
    <>
      <AppTitle eyebrow={c.trips} title={c.title} />
      {state.tripRoom && (
        <Link className="my-trip-banner" to="/app/my-trip">
          <span>{c.seed}</span>
          <b>京都与奈良</b>
          <small>{c.openRoom}</small>
        </Link>
      )}
      <h2>{passengerCoreCopy[locale].orders}</h2>
      {services && drafts.length > 0 && (
        <section className="draft-list">
          <h2>{c.drafts}</h2>
          {drafts.map((draft) => (
            <article className="order-card" key={draft.id}>
              <b>
                {draft.status === "expired"
                  ? c.draftExpired
                  : draft.status === "cancelled"
                    ? c.draftAbandoned
                    : draft.status === "converted"
                      ? c.draftConverted
                    : c.draftUnpaid}
              </b>
              <span>
                {draft.adults} {c.adults}／{draft.children} {c.children}／{draft.infants} {c.infants}
                · {c.vehicleCount} {draft.seat_impact}
              </span>
              <small>
                {c.updated}：{new Date(draft.updated_at).toLocaleString(locale)} ·
                {c.assistanceReview}：{localizedReviewStatus(locale,draft.operational_review_status)}
              </small>
              {draft.status === "payment_not_started" ||
              draft.status === "pending_manual_review" ? (
                <div className="inline-actions">
                  <Link className="text-link" to="/app/checkout">
                    {c.continue}
                  </Link>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void services.abandonOwnDraft(draft.id).then((result) => {
                        setDraftNotice(
                          result.error ?? c.abandoned,
                        );
                        if (result.ok)
                          setDrafts((rows) =>
                            rows.map((row) =>
                              row.id === draft.id
                                ? { ...row, status: "cancelled" }
                                : row,
                            ),
                          );
                      })
                    }
                  >
                    {c.abandon}
                  </button>
                </div>
              ) : draft.status==='converted'&&draft.converted_order_id ? <Link className="text-link" to={`/app/orders/${draft.converted_order_id}`}>{c.viewOrder}</Link> : null}
            </article>
          ))}
        </section>
      )}
      {draftNotice && (
        <p className="notice" role="status">
          {draftNotice}
        </p>
      )}
      {services ? (
        remote.loading ? (
          <Empty title={c.loading} text={c.wait} />
        ) : remote.error ? (
          <Empty title={c.unavailable} text={remote.error} />
        ) : remote.rows.length ? (
          remote.rows.map((o) => (
            <Link className="order-card" key={o.id} to={`/app/orders/${o.id}`}>
              <b>{c.ownOrder}</b>
              <span>
                {o.id} · {o.seat_count} {c.seats}
              </span>
              <small>{localizedOrderStatus(locale,o.status)}</small>
              {o.status==='pending_manual_review'&&o.manual_payment_due_at&&<small>{c.paymentDue}: {new Date(o.manual_payment_due_at).toLocaleString(locale,{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})}</small>}
            </Link>
          ))
        ) : (
          <Empty title={c.empty} text={c.emptyText} />
        )
      ) : appConfig.runtimeMode === "production" ? (
        <Empty
          title={c.serviceUnavailable}
          text={c.serviceUnavailableText}
        />
      ) : state.orders.length ? (
        state.orders.map((o) => (
          <Link className="order-card" key={o.id} to={`/app/orders/${o.id}`}>
            <b>{travelRepository.getTrip(o.tripSlug)?.shortTitle}</b>
            <span>
              {o.id} · {o.guests} 个座位
            </span>
            <small>{o.status}</small>
          </Link>
        ))
      ) : (
        <Empty title="暂无订单" text="完成真实支付后，订单会显示在这里。" />
      )}
    </>
  );
}
export function OrderDetail() {
  const { state, services, departures } = useApp();
  const locale=state.ui.locale ?? "zh-CN";
  const c=passengerOrderCopy[locale];
  const journeyCopy=orderJourneyCopy(locale);
  const { id } = useParams();
  const [remoteOrder, setRemoteOrder] = useState<{
    id: string;
    departure_id: string;
    seat_count: number;
    status: string;
    amount: number | null;
    currency: string;
    manual_payment_due_at?: string | null;
  } | null>(null);
  const [remoteFulfilment, setRemoteFulfilment] = useState<{
    departs_at: string | null;
    meeting_name: string | null;
    meeting_address: string | null;
    map_lat: number | string | null;
    map_lng: number | string | null;
    vehicle_group_id: string | null;
    trip_room_id: string | null;
    boarding_ready: boolean;
    details_publish_at: string | null;
    details_published: boolean;
    vehicle_label: string | null;
    staff_name: string | null;
  } | null>(null);
  const [remoteDraft,setRemoteDraft]=useState<{operational_review_status:string;assistance_summary:Record<string,unknown>}|null>(null);
  const [cancellation,setCancellation]=useState<{id:string;status:string;refund_percent:number;estimated_refund_amount:number}|null>(null);
  const [cancellationNotice,setCancellationNotice]=useState('');
  const [cancellationBusy,setCancellationBusy]=useState(false);
  const [cancellationFormOpen,setCancellationFormOpen]=useState(false);
  const [remoteResolved, setRemoteResolved] = useState(!services);
  const [billing,setBilling]=useState<Awaited<ReturnType<NonNullable<typeof services>['loadOwnOrderBilling']>>>(null);
  useEffect(() => {
    if (!services || !id) return;
    let active = true;
    void Promise.all([
      services.loadOwnOrders(),
      services.loadOwnOrderFulfilment(id),
      services.loadOwnDrafts(),
      services.loadOwnCancellationRequest(id),
      services.loadOwnOrderBilling(id),
    ]).then(([result, fulfilment,draftResult,cancellationResult,billingResult]) => {
      if (!active) return;
      setRemoteOrder(
        (
          result.data as Array<{
            id: string;
            departure_id: string;
            seat_count: number;
            status: string;
            amount: number | null;
            currency: string;
            manual_payment_due_at?: string | null;
          }>
        ).find((item) => item.id === id) ?? null,
      );
      setRemoteFulfilment(fulfilment as typeof remoteFulfilment);
      const linked=(draftResult.data as Array<{converted_order_id?:string|null;operational_review_status:string;assistance_summary:Record<string,unknown>}>).find(item=>item.converted_order_id===id)??null;
      setRemoteDraft(linked);
      setCancellation(cancellationResult as typeof cancellation);
      setBilling(billingResult);
      setRemoteResolved(true);
    });
    return () => {
      active = false;
    };
  }, [services, id]);
  const submitCancellation=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!services||!id)return;
    const form=new FormData(event.currentTarget);setCancellationBusy(true);
    const result=await services.requestOwnCancellation(id,String(form.get('reason')),String(form.get('note')??''));
    setCancellationBusy(false);setCancellationNotice(result.error??c.cancelSubmitted);
    if(result.ok)setCancellation(await services.loadOwnCancellationRequest(id) as typeof cancellation);
  };
  if (services) {
    if (!remoteResolved)
      return (
        <Empty title={c.loading} text={c.wait} />
      );
    if (!remoteOrder)
      return (
        <Empty title={c.notFound} text={c.notFoundText} />
      );
    const dep = departures.find((item) => item.id === remoteOrder.departure_id);
    const trip = travelRepository.getTrip(dep?.tripSlug ?? "");
    const departureLabel = remoteFulfilment?.departs_at
      ? new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Tokyo",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(remoteFulfilment.departs_at))
      : (dep?.dateLabel ?? c.pending);
    const lat =
      remoteFulfilment?.map_lat == null
        ? null
        : Number(remoteFulfilment.map_lat);
    const lng =
      remoteFulfilment?.map_lng == null
        ? null
        : Number(remoteFulfilment.map_lng);
    const navigationUrl =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? new GoogleMapsAdapter(undefined).navigationUrl({
            lat: lat!,
            lng: lng!,
          })
        : null;
    const orderStatusLabel=localizedOrderStatus(locale,remoteOrder.status);
    const publishLabel=remoteFulfilment?.details_publish_at?new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(remoteFulfilment.details_publish_at)):null;
    const boardingEligible=['paid','confirmed'].includes(remoteOrder.status)&&remoteFulfilment?.boarding_ready===true;
    const reviewLabel=remoteDraft?localizedReviewStatus(locale,remoteDraft.operational_review_status):c.noneDeclared;
    const assistanceSummary=remoteDraft?.assistance_summary??{};
    const assistanceItems=[Number(assistanceSummary.childSeatCount)>0?`儿童座椅 ${Number(assistanceSummary.childSeatCount)} 个`:null,assistanceSummary.wheelchair?'轮椅／行动协助':null,assistanceSummary.accessibleVehicle?'需要无障碍车辆':null,assistanceSummary.lift?'需要升降设备':null,assistanceSummary.staffAssistance?'需要工作人员协助':null,Number(assistanceSummary.largeLuggage)>0?`大件行李 ${Number(assistanceSummary.largeLuggage)} 件`:null,assistanceSummary.serviceDog?'服务犬同行':null].filter(Boolean);
    return (
      <>
        <AppTitle
          eyebrow={c.account}
          title={trip?.shortTitle ?? c.tripOrder}
        />
        <div className="status">{c.status}：{orderStatusLabel}</div>
        {['paid','confirmed'].includes(remoteOrder.status)&&<section className="order-publication-notice"><b>{journeyCopy.paid}</b><p>{publishLabel?`${publishLabel}${journeyCopy.publish}`:c.wait}</p></section>}
        <div className="receipt">
          <div>
            <span>{c.orderId}</span>
            <b>{remoteOrder.id}</b>
          </div>
          <div>
            <span>{c.departureTime}</span>
            <b>{departureLabel}</b>
          </div>
          <div>
            <span>{c.meetingPoint}</span>
            <b>{remoteFulfilment?.meeting_name ?? c.pending}</b>
          </div>
          <div>
            <span>{c.meetingAddress}</span>
            <b>{remoteFulfilment?.meeting_address ?? c.pending}</b>
          </div>
          <div>
            <span>{c.seatCount}</span>
            <b>{remoteOrder.seat_count} {c.seats}</b>
          </div>
          <div>
            <span>{c.amount}</span>
            <b>
              {remoteOrder.amount == null ? c.pending : `¥${remoteOrder.amount}`}
            </b>
          </div>
          {remoteOrder.status==='pending_manual_review'&&remoteOrder.manual_payment_due_at&&<div><span>{c.transferDeadline}</span><b>{new Date(remoteOrder.manual_payment_due_at).toLocaleString(locale,{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})}</b></div>}
          <div><span>{c.assistanceReview}</span><b>{reviewLabel}</b></div>
          <div><span>{c.fulfilmentNeeds}</span><b>{assistanceItems.length?assistanceItems.join(' · '):c.noneDeclared}</b></div>
          {remoteFulfilment?.details_published&&<><div><span>{journeyCopy.vehicle}</span><b>{remoteFulfilment.vehicle_label??c.pending}</b></div><div><span>{journeyCopy.staff}</span><b>{remoteFulfilment.staff_name??c.pending}</b></div></>}
        </div>
        {billing&&<section className="receipt" aria-label="不可变订单账单"><h2>订单费用明细</h2>{billing.lineItems.map((item,index)=><div key={`${item.kind}-${index}`}><span>{item.label}{item.quantity>0?` · ${item.quantity}项`:''}</span><b>{item.amountJpy<0?'-':''}¥{Math.abs(item.amountJpy).toLocaleString('ja-JP')}</b></div>)}<div><span>订单原价</span><b>¥{billing.grossAmountJpy.toLocaleString('ja-JP')}</b></div>{billing.discountAmountJpy>0&&<div><span>优惠券抵扣（仅优惠一席）</span><b>-¥{billing.discountAmountJpy.toLocaleString('ja-JP')}</b></div>}<div><span>实际应付</span><b>¥{billing.amountPaidJpy.toLocaleString('ja-JP')}</b></div><div><span>付款方式</span><b>{billing.paymentKind==='coupon_covered'?'优惠券抵扣，无需付款':billing.paymentKind==='bank_transfer'?'银行转账':billing.paymentKind==='stripe'?'银行卡支付':'待确认'}</b></div>{billing.userConfirmedAt&&<div><span>确认费用时间</span><b>{new Date(billing.userConfirmedAt).toLocaleString(locale,{timeZone:'Asia/Tokyo'})}</b></div>}{billing.refunds.length>0&&<details><summary>退款流水（{billing.refunds.length}）</summary>{billing.refunds.map((refund,index)=><div key={index}><span>{refund.channel} · {refund.status}</span><b>{refund.amountJpy==null?'金额核对中':`¥${refund.amountJpy.toLocaleString('ja-JP')}`}</b></div>)}</details>}{!billing.snapshotAvailable&&<p className="notice">这是旧订单，部分历史合同字段当时尚未建立；系统不会使用当前价格补写旧账单。</p>}</section>}
        {['paid','confirmed'].includes(remoteOrder.status)&&(cancellation?<section className="empty-card" aria-live="polite"><b>{c.cancellationProcessing}</b><p>{c.currentStatus}：{cancellation.status} · {c.estimatedRefund} {cancellation.refund_percent}%（¥{cancellation.estimated_refund_amount}）。{c.refundDisclaimer}</p></section>:<details className="order-help-panel"><summary>{journeyCopy.help}</summary><p>{journeyCopy.helpText}</p><div className="order-help-actions"><Link className="button full" to="/app/support">{journeyCopy.consult}</Link><Link className="button secondary full" to="/app/support?topic=change-date">{journeyCopy.change}</Link><button type="button" className="text-action" onClick={()=>setCancellationFormOpen(true)}>{journeyCopy.continueCancel}</button></div>{cancellationFormOpen&&<form className="form cancellation-request-form" onSubmit={submitCancellation}><label>{c.cancelReason}<select name="reason" required defaultValue="plans_changed"><option value="plans_changed">{c.plansChanged}</option><option value="health">{c.health}</option><option value="transport">{c.transport}</option><option value="duplicate">{c.duplicate}</option><option value="other">{c.other}</option></select></label><label>{c.note}<textarea name="note" maxLength={500}/></label><button className="button secondary full" disabled={cancellationBusy}>{cancellationBusy?c.submitting:c.requestCancel}</button></form>}</details>)}
        {cancellationNotice&&<p className="notice" role="status">{cancellationNotice}</p>}
        {navigationUrl ? (
          <a
            className="button full"
            href={navigationUrl}
            target="_blank"
            rel="noreferrer"
          >
            {c.openNavigation}
          </a>
        ) : (
          <p className="notice">{c.navigationPending}</p>
        )}
        {boardingEligible?<Link className="button full" to={`/app/boarding-pass/${remoteOrder.id}`}>{c.boardingPass}</Link>:<p className="notice">{c.boardingPending}</p>}
        {remoteDraft&&remoteDraft.operational_review_status!=='not_requested'&&remoteDraft.operational_review_status!=='confirmed'?<p className="notice">{c.assistancePending}</p>:null}
        <Link className="button secondary full" to="/app/orders">
          {c.back}
        </Link>
      </>
    );
  }
  const o = state.orders.find((x) => x.id === id);
  if (!o)
    return <Empty title="未找到订单" text="该订单不存在或未保存在当前会话。" />;
  const trip = travelRepository.getTrip(o.tripSlug);
  const dep = departures.find((item) => item.id === o.departureId);
  const pending = "待确认；确认后将在本订单详情和行程房间更新";
  const assistance = describeAssistance(o.assistance);
  const navigationUrl = new GoogleMapsAdapter(undefined).navigationUrl(
    dep?.meetingCoordinates ?? null,
  );
  return (
    <>
      <AppTitle
        eyebrow="我的账户／我的行程"
        title={trip?.shortTitle ?? "行程"}
      />
      <div className="status">订单状态：{o.status}</div>
      <div className="receipt">
        <div>
          <span>路线／产品</span>
          <b>{trip?.title ?? "待确认"}</b>
        </div>
        <div>
          <span>订单编号</span>
          <b>{o.id}</b>
        </div>
        <div>
          <span>Departure 日期</span>
          <b>{dep?.dateLabel ?? pending}</b>
        </div>
        <div>
          <span>出发时间</span>
          <b>{dep?.departureTime ?? pending}</b>
        </div>
        <div>
          <span>集合地点</span>
          <b>{dep?.meetingPointName ?? pending}</b>
        </div>
        <div>
          <span>完整地址</span>
          <b>{dep?.meetingAddress ?? pending}</b>
        </div>
        <div>
          <span>公共交通到达</span>
          <b>{dep?.arrivalInstructions.transit ?? pending}</b>
        </div>
        <div>
          <span>步行到达</span>
          <b>{dep?.arrivalInstructions.walking ?? pending}</b>
        </div>
        <div>
          <span>驾车到达</span>
          <b>{dep?.arrivalInstructions.driving ?? pending}</b>
        </div>
        <div>
          <span>已购席数</span>
          <b>{o.guests} 席</b>
        </div>
        <div>
          <span>乘客摘要</span>
          <b>{o.passengerSummary}</b>
        </div>
        <div>
          <span>儿童年龄</span>
          <b>
            {o.assistance.childSeat.children.length
              ? o.assistance.childSeat.children
                  .map((child, index) => `儿童 ${index + 1}：${child.age} 岁`)
                  .join("；")
              : "无儿童资料"}
          </b>
        </div>
        <div>
          <span>儿童安全座椅状态</span>
          <b>{describeChildSeat(o.assistance.childSeat)}</b>
        </div>
        <div>
          <span>特殊乘车需求</span>
          <b>
            {assistance.map((item) => (
              <span className="summary-line" key={item}>
                {item}
              </span>
            ))}
          </b>
        </div>
        <div>
          <span>运营审核状态</span>
          <b>{o.assistance.operationalReviewStatus}</b>
        </div>
        <div>
          <span>支付状态</span>
          <b>{o.paymentStatus}；真实支付未连接</b>
        </div>
        <div>
          <span>金额状态</span>
          <b>
            {o.amount == null
              ? "待确认；正式价格开放后在此更新"
              : `¥${o.amount}`}
          </b>
        </div>
        <div>
          <span>车辆</span>
          <b>{pending}</b>
        </div>
        <div>
          <span>司机／司导</span>
          <b>{pending}</b>
        </div>
        <div>
          <span>Boarding Pass</span>
          <b>尚未生成；订单进入待登车状态后开放</b>
        </div>
      </div>
      {o.assistance.operationalReviewStatus !== "未提出" && (
        <p className="notice">
          确认中或需人工联系的需求尚未承诺提供；运营结果和可能费用会在本订单中更新。
        </p>
      )}
      <section className="meeting-reference">
        <h2>集合地点参考</h2>
        {dep?.meetingPhoto ? (
          <>
            <img src={dep.meetingPhoto} alt="集合地点开发占位参考图" />
            <p className="notice">
              开发占位图，不是实际集合地点照片。正式照片确认后将在此更新。
            </p>
          </>
        ) : (
          <p>{pending}</p>
        )}
        <div className="demo-map" role="img" aria-label="集合地点导航状态">
          <span className="map-label">
            {navigationUrl
              ? "集合点坐标已确认，可使用外部步行导航"
              : "集合点坐标待确认；不显示虚构地图"}
          </span>
        </div>
        {navigationUrl ? (
          <a
            className="button secondary full"
            href={navigationUrl}
            target="_blank"
            rel="noreferrer"
          >
            打开 Google Maps 步行导航
          </a>
        ) : (
          <button className="button secondary full" disabled>
            步行导航待集合点确认
          </button>
        )}
      </section>
      {state.tripRoom ? (
        <Link className="button full room-link" to="/app/my-trip/room">
          查看 Trip Room／Vehicle Group 只读预览
        </Link>
      ) : (
        <p className="notice">车辆群组待分配，分配后将在此提供行程房间入口。</p>
      )}
    </>
  );
}
export function BoardingPass() {
  const { state, services } = useApp();
  const { id } = useParams();
  const [credential, setCredential] = useState<{
    token: string;
    expiresAt: string;
    vehicleGroupId: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  if (services && id) {
    const issue = async () => {
      setLoading(true);
      const result = await services.issueBoardingCredential(id);
      setLoading(false);
      if (!result) {
        setNotice(
          "登车凭证尚不可签发：请确认订单已支付、本车已分配且行程房间已开放。",
        );
        return;
      }
      setCredential(result);
      setNotice("新凭证已签发；此前未使用的凭证已经撤销。");
    };
    return (
      <div className="pass">
        <h1>安全登车凭证</h1>
        {credential ? (
          <>
            <div className="boarding-code" role="img" aria-label="安全登车代码">
              <b>JT BOARDING</b>
              <code>{credential.token}</code>
            </div>
            <p>
              有效至：
              {new Date(credential.expiresAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Tokyo",
              })}
            </p>
            <p className="privacy">
              该不透明凭证不包含订单号、邮箱、电话或乘客资料。只向本车工作人员出示，不要发送到公开群组。
            </p>
          </>
        ) : (
          <p>行程房间开放后，可生成一次性安全凭证供本车工作人员核验。</p>
        )}
        <button
          className="button full"
          type="button"
          disabled={loading}
          onClick={() => void issue()}
        >
          {loading
            ? "正在安全签发…"
            : credential
              ? "重新签发并撤销旧凭证"
              : "生成登车凭证"}
        </button>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </div>
    );
  }
  const o = state.orders.find((x) => x.id === id);
  return o ? (
    <div className="pass">
      <h1>登车凭证</h1>
      <p>状态：{o.status}</p>
      <p>
        {appConfig.runtimeMode === "production"
          ? "安全登车凭证尚未由服务端签发。"
          : "当前为本地测试订单，不生成可用于正式登车的二维码。"}
      </p>
      <p className="privacy">
        正式二维码仅包含可撤销的不透明令牌，不包含订单号、邮箱、电话或乘客资料。
      </p>
    </div>
  ) : (
    <Empty
      title="暂无登车凭证"
      text="只有已确认且待登车的订单才会生成有效凭证。"
    />
  );
}
export function AppRewards() {
  const { state } = useApp();
  const locale=state.ui.locale??'zh-CN';
  const w=rewardsCopy[locale];
  const next = nextTier(state.completedTrips);
  return (
    <>
      <AppTitle
        eyebrow={w.eyebrow}
        title={locale==='zh-CN'?tierFor(state.completedTrips).name:w.tier}
      />
      <div className="progress">
        <b>{state.completedTrips} {w.done}</b>
        <span>
          {next
            ? w.more.replace('{n}',String(next.trips-state.completedTrips))
            : w.expert}
        </span>
      </div>
      <ReferralPanel/>
    </>
  );
}
export function Referral() {
  return (
    <>
      <AppTitle
        eyebrow="仅限直接推荐"
        title="邀请朋友"
        text="不设置下级层级，旅行金不可提现。"
      />
      <ReferralPanel/>
    </>
  );
}
const referralPanelCopy={
  'zh-CN':{title:'邀请好友，双方同享优惠',intro:'好友首单可享 {percent}% 优惠；好友订单进入开团前24小时不可退款期后，你的奖励券生效。优惠不可叠加。',copy:'复制邀请链接',share:'分享给好友',copied:'邀请链接已复制',invites:'成功邀请',coupons:'我的优惠券',none:'暂无优惠券',valid:'有效至',pending:'等待好友订单进入不可退款期',tripStarts:'好友开团时间',available:'预计可使用',invalid:'已失效（订单已取消或退款）',loading:'正在读取邀请权益…'},
  'zh-TW':{title:'邀請好友，雙方同享優惠',intro:'好友首單可享 {percent}% 優惠；好友訂單進入開團前24小時不可退款期後，你的獎勵券生效。優惠不可疊加。',copy:'複製邀請連結',share:'分享給好友',copied:'邀請連結已複製',invites:'成功邀請',coupons:'我的優惠券',none:'暫無優惠券',valid:'有效至',pending:'等待好友訂單進入不可退款期',tripStarts:'好友開團時間',available:'預計可使用',invalid:'已失效（訂單已取消或退款）',loading:'正在讀取邀請權益…'},
  ja:{title:'友達を招待して双方に特典',intro:'友達は初回旅行が {percent}% 割引。出発24時間前の返金不可期間に入ると紹介者クーポンが有効になり、他の割引とは併用できません。',copy:'紹介リンクをコピー',share:'友達に共有',copied:'リンクをコピーしました',invites:'紹介成立',coupons:'クーポン',none:'クーポンはありません',valid:'有効期限',pending:'返金不可期間まで待機中',tripStarts:'友達のツアー開始',available:'利用予定日時',invalid:'無効（予約取消・返金）',loading:'紹介特典を読込中…'},
  en:{title:'Invite a friend—both save',intro:'Your friend gets {percent}% off their first trip. Your reward activates when their booking enters the non-refundable period 24 hours before departure. Discounts cannot be stacked.',copy:'Copy invite link',share:'Share',copied:'Invite link copied',invites:'Successful invites',coupons:'My coupons',none:'No coupons yet',valid:'Valid until',pending:'Waiting for the non-refundable period',tripStarts:'Friend’s trip starts',available:'Expected availability',invalid:'Invalid (booking cancelled or refunded)',loading:'Loading referral benefits…'},
  es:{title:'Invita a un amigo y ambos ahorran',intro:'Tu amigo obtiene un {percent}% de descuento en su primer viaje. Tu premio se activa cuando su reserva entra en el período no reembolsable, 24 horas antes de la salida. No se acumula con otros descuentos.',copy:'Copiar enlace',share:'Compartir',copied:'Enlace copiado',invites:'Invitaciones válidas',coupons:'Mis cupones',none:'Aún no hay cupones',valid:'Válido hasta',pending:'Esperando el período no reembolsable',tripStarts:'Inicio del viaje del amigo',available:'Disponibilidad prevista',invalid:'No válido (reserva cancelada o reembolsada)',loading:'Cargando ventajas…'},
  vi:{title:'Mời bạn, cả hai cùng được giảm',intro:'Bạn của bạn được giảm {percent}% cho chuyến đầu tiên. Phiếu thưởng của bạn có hiệu lực khi đơn của họ bước vào thời hạn không hoàn tiền, 24 giờ trước khi khởi hành, và không được cộng dồn.',copy:'Sao chép liên kết',share:'Chia sẻ',copied:'Đã sao chép liên kết',invites:'Lời mời thành công',coupons:'Phiếu của tôi',none:'Chưa có phiếu giảm',valid:'Hạn dùng',pending:'Chờ đến thời hạn không hoàn tiền',tripStarts:'Chuyến đi của bạn bắt đầu',available:'Dự kiến có thể dùng',invalid:'Không còn hiệu lực (đã hủy hoặc hoàn tiền)',loading:'Đang tải quyền lợi…'},
  ne:{title:'साथी बोलाउनुहोस्, दुवैले छुट पाउनुहोस्',intro:'साथीले पहिलो यात्रामा {percent}% छुट पाउँछन्। प्रस्थानको २४ घण्टा अघि बुकिङ फिर्ता नहुने अवधिमा पुगेपछि तपाईंको कुपन सक्रिय हुन्छ र अन्य छुटसँग जोडिँदैन।',copy:'लिङ्क प्रतिलिपि',share:'साझा गर्नुहोस्',copied:'लिङ्क प्रतिलिपि भयो',invites:'सफल निमन्त्रणा',coupons:'मेरा कुपन',none:'कुपन छैन',valid:'मान्य मिति',pending:'फिर्ता नहुने अवधिको प्रतीक्षा',tripStarts:'साथीको यात्रा सुरु',available:'प्रयोग हुने अनुमानित समय',invalid:'अमान्य (बुकिङ रद्द वा फिर्ता)',loading:'सुविधा लोड हुँदैछ…'},
  ko:{title:'친구 초대, 두 사람 모두 할인',intro:'친구는 첫 여행에 {percent}% 할인을 받고, 출발 24시간 전 환불 불가 기간에 들어가면 내 보상 쿠폰이 활성화됩니다. 다른 할인과 중복되지 않습니다.',copy:'초대 링크 복사',share:'공유',copied:'초대 링크를 복사했습니다',invites:'초대 성공',coupons:'내 쿠폰',none:'쿠폰이 없습니다',valid:'유효기간',pending:'환불 불가 기간 대기 중',tripStarts:'친구 투어 시작',available:'예상 사용 가능 시간',invalid:'사용 불가(예약 취소 또는 환불)',loading:'초대 혜택 불러오는 중…'},
} as const;
const referralAchievementLevels={
  'zh-CN':[{at:0,name:'旅途探索者',benefit:'获得专属推荐链接'},{at:1,name:'旅行分享官',benefit:'推荐人与被推荐人各得一张10%推荐券'},{at:3,name:'推广新星',benefit:'获得推广新手徽章'},{at:10,name:'推广大使候选人',benefit:'获得推广大使申请资格'},{at:100,name:'金牌推广大使',benefit:'审核后，符合条件的奖励可全部现金提现'}],
  'zh-TW':[{at:0,name:'旅途探索者',benefit:'獲得專屬推薦連結'},{at:1,name:'旅行分享官',benefit:'推薦人與被推薦人各得一張10%推薦券'},{at:3,name:'推廣新星',benefit:'獲得推廣新手徽章'},{at:10,name:'推廣大使候選人',benefit:'獲得推廣大使申請資格'},{at:100,name:'金牌推廣大使',benefit:'審核後，符合條件的獎勵可全部現金提領'}],
  ja:[{at:0,name:'旅の探検者',benefit:'紹介リンクを利用できます'},{at:1,name:'旅のシェアラー',benefit:'紹介者と友達に10%クーポン'},{at:3,name:'プロモーションルーキー',benefit:'限定バッジを獲得'},{at:10,name:'アンバサダー候補',benefit:'プロモーションアンバサダーに申請可能'},{at:100,name:'ゴールドアンバサダー',benefit:'審査後、対象報酬を全額現金で受取可能'}],
  en:[{at:0,name:'Travel Explorer',benefit:'Your referral link is available'},{at:1,name:'Travel Sharer',benefit:'Both travellers receive a 10% coupon'},{at:3,name:'Rising Promoter',benefit:'Unlock the achievement badge'},{at:10,name:'Ambassador Candidate',benefit:'Eligible to apply as a Promotion Ambassador'},{at:100,name:'Gold Ambassador',benefit:'After review, eligible rewards can be paid fully in cash'}],
  es:[{at:0,name:'Explorador viajero',benefit:'Obtén tu enlace de recomendación'},{at:1,name:'Embajador de viajes',benefit:'Ambos reciben un cupón del 10%'},{at:3,name:'Promotor emergente',benefit:'Desbloquea la insignia inicial'},{at:10,name:'Candidato a embajador',benefit:'Puede solicitar ser embajador promocional'},{at:100,name:'Embajador de oro',benefit:'Tras la revisión, la recompensa elegible puede pagarse en efectivo'}],
  vi:[{at:0,name:'Nhà khám phá',benefit:'Nhận liên kết giới thiệu riêng'},{at:1,name:'Người chia sẻ hành trình',benefit:'Cả hai nhận phiếu giảm 10%'},{at:3,name:'Ngôi sao quảng bá',benefit:'Mở khóa huy hiệu người mới'},{at:10,name:'Ứng viên đại sứ',benefit:'Đủ điều kiện đăng ký đại sứ quảng bá'},{at:100,name:'Đại sứ vàng',benefit:'Sau khi duyệt, phần thưởng hợp lệ có thể nhận hoàn toàn bằng tiền mặt'}],
  ne:[{at:0,name:'यात्रा अन्वेषक',benefit:'आफ्नो सिफारिस लिङ्क पाउनुहोस्'},{at:1,name:'यात्रा साझेदार',benefit:'दुवैले १०% कुपन पाउँछन्'},{at:3,name:'उदीयमान प्रवर्द्धक',benefit:'प्रारम्भिक ब्याज खोल्नुहोस्'},{at:10,name:'एम्बेसडर उम्मेदवार',benefit:'प्रवर्द्धन एम्बेसडरका लागि आवेदन दिन योग्य'},{at:100,name:'गोल्ड एम्बेसडर',benefit:'समीक्षापछि योग्य पुरस्कार पूर्ण रूपमा नगद लिन सकिन्छ'}],
  ko:[{at:0,name:'여행 탐험가',benefit:'전용 추천 링크 제공'},{at:1,name:'여행 공유자',benefit:'추천인과 신규 여행자 모두 10% 쿠폰 제공'},{at:3,name:'라이징 프로모터',benefit:'초급 홍보 배지 획득'},{at:10,name:'앰배서더 후보',benefit:'프로모션 앰배서더 신청 자격 획득'},{at:100,name:'골드 앰배서더',benefit:'심사 후 대상 보상을 전액 현금으로 수령 가능'}],
} as const;
const referralAchievementUi={
  'zh-CN':{current:'当前成就',complete:'再完成',people:'人解锁',highest:'已达最高里程碑',levels:'等级与权益',completed:'有效推荐',progress:'进行中',unit:'人完成有效行程'},
  'zh-TW':{current:'目前成就',complete:'再完成',people:'人解鎖',highest:'已達最高里程碑',levels:'等級與權益',completed:'有效推薦',progress:'進行中',unit:'人完成有效行程'},
  ja:{current:'現在の実績',complete:'あと',people:'人で',highest:'最高ランク達成',levels:'レベルと特典',completed:'完了',progress:'進行中',unit:'人の旅行完了'},
  en:{current:'Current achievement',complete:'Complete',people:'more to unlock',highest:'Highest milestone reached',levels:'Levels and benefits',completed:'Completed',progress:'In progress',unit:'completed referrals'},
  es:{current:'Logro actual',complete:'Completa',people:'más para desbloquear',highest:'Hito máximo alcanzado',levels:'Niveles y ventajas',completed:'Completadas',progress:'En curso',unit:'recomendaciones completadas'},
  vi:{current:'Thành tích hiện tại',complete:'Hoàn thành thêm',people:'người để mở khóa',highest:'Đã đạt mốc cao nhất',levels:'Cấp độ và quyền lợi',completed:'Đã hoàn thành',progress:'Đang tiến hành',unit:'lượt giới thiệu hoàn tất'},
  ne:{current:'हालको उपलब्धि',complete:'थप पूरा गर्नुहोस्',people:'जना पछि खुल्छ',highest:'उच्चतम चरण पूरा भयो',levels:'तह र सुविधा',completed:'पूरा भएका',progress:'जारी',unit:'पूरा सिफारिस'},
  ko:{current:'현재 성과',complete:'추가로',people:'명 완료 시 해제',highest:'최고 단계 달성',levels:'등급 및 혜택',completed:'완료',progress:'진행 중',unit:'명 유효 여행 완료'},
} as const;
const couponFilterCopy={
  'zh-CN':{all:'全部',active:'可使用',pending:'待解锁',used:'已使用',invalid:'已失效',activeStatus:'可使用',usedStatus:'已使用'},
  'zh-TW':{all:'全部',active:'可使用',pending:'待解鎖',used:'已使用',invalid:'已失效',activeStatus:'可使用',usedStatus:'已使用'},
  ja:{all:'すべて',active:'利用可能',pending:'待機中',used:'使用済み',invalid:'無効',activeStatus:'利用可能',usedStatus:'使用済み'},
  en:{all:'All',active:'Available',pending:'Pending',used:'Used',invalid:'Invalid',activeStatus:'Available',usedStatus:'Used'},
  es:{all:'Todos',active:'Disponibles',pending:'Pendientes',used:'Usados',invalid:'No válidos',activeStatus:'Disponible',usedStatus:'Usado'},
  vi:{all:'Tất cả',active:'Có thể dùng',pending:'Chờ mở khóa',used:'Đã dùng',invalid:'Hết hiệu lực',activeStatus:'Có thể dùng',usedStatus:'Đã dùng'},
  ne:{all:'सबै',active:'प्रयोग योग्य',pending:'प्रतीक्षामा',used:'प्रयोग भयो',invalid:'अमान्य',activeStatus:'प्रयोग योग्य',usedStatus:'प्रयोग भयो'},
  ko:{all:'전체',active:'사용 가능',pending:'잠금 대기',used:'사용 완료',invalid:'사용 불가',activeStatus:'사용 가능',usedStatus:'사용 완료'},
} as const;
function ReferralPanel(){
  const {state,services}=useApp();const locale=state.ui.locale??'zh-CN';const c=referralPanelCopy[locale];
  const [summary,setSummary]=useState<Awaited<ReturnType<NonNullable<typeof services>['loadOwnReferralSummary']>>>(null);const [notice,setNotice]=useState('');const [now]=useState(()=>Date.now());const [couponFilter,setCouponFilter]=useState<'all'|'active'|'pending'|'used'|'invalid'>('all');
  const [commission,setCommission]=useState<Awaited<ReturnType<NonNullable<typeof services>['loadOwnCashCommissionSummary']>>>(null);const[payoutBusy,setPayoutBusy]=useState(false);
  useEffect(()=>{let active=true;void services?.loadOwnReferralSummary().then(value=>{if(active)setSummary(value)});return()=>{active=false}},[services]);
  useEffect(()=>{let active=true;void services?.loadOwnCashCommissionSummary().then(value=>{if(active)setCommission(value)});return()=>{active=false}},[services]);
  if(!summary)return <div className="empty-card"><p>{c.loading}</p></div>;
  const link=`${window.location.origin}/app/create-account?ref=${encodeURIComponent(summary.code)}`;
  const copy=async()=>{await navigator.clipboard.writeText(link);setNotice(c.copied)};
  const share=async()=>{if(navigator.share)await navigator.share({title:c.title,text:c.intro.replace('{percent}',String(summary.discountPercent)),url:link});else await copy()};
  const activeCount=summary.coupons.filter(item=>item.status==='active'&&new Date(item.expiresAt).getTime()>now).length;
  const completed=summary.completedInvites??0;
  const next=summary.nextMilestone;
  const prior=completed>=100?100:completed>=10?10:completed>=3?3:completed>=1?1:0;
  const progress=next==null?100:Math.max(0,Math.min(100,Math.round((completed-prior)/(next-prior)*100)));
  const levels=referralAchievementLevels[locale];
  const achievementUi=referralAchievementUi[locale];
  const filterCopy=couponFilterCopy[locale];
  const visibleCoupons=summary.coupons.filter(item=>couponFilter==='all'||(couponFilter==='active'&&item.status==='active')||(couponFilter==='pending'&&item.status==='pending_trip_completion')||(couponFilter==='used'&&['reserved','redeemed'].includes(item.status))||(couponFilter==='invalid'&&['void','frozen','expired'].includes(item.status)));
  const current=[...levels].reverse().find(item=>completed>=item.at)??levels[0];
  const upcoming=levels.find(item=>item.at>completed);
  return <section className="referral-card">
    <div className="eyebrow">{summary.code}</div><h2>{c.title}</h2><p>{c.intro.replace('{percent}',String(summary.discountPercent))}</p>
    <div className="referral-achievement">
      <div className="referral-rank-icon" aria-hidden="true">{completed>=10?'冠':completed>=3?'星':'旅'}</div>
      <div><small>{achievementUi.current}</small><h3>{current.name}</h3><p>{current.benefit}</p></div>
      <strong>{completed}{next!=null?` / ${next}`:''}</strong>
      <div className="referral-progress" role="progressbar" aria-valuemin={prior} aria-valuemax={next??100} aria-valuenow={completed}><i style={{width:`${progress}%`}}/></div>
      <small>{upcoming?`${achievementUi.complete} ${upcoming.at-completed} ${achievementUi.people} ${upcoming.name}`:achievementUi.highest}</small>
    </div>
    <div className="referral-rights"><h3>{achievementUi.levels}</h3>{levels.map(item=><article className={completed>=item.at?'earned':''} key={item.at}><span>{completed>=item.at?'✓':item.at}</span><div><b>{item.name}</b><small>{item.at===0?'':`${item.at} ${achievementUi.unit} · `}{item.benefit}</small></div></article>)}</div>
    <div className="referral-actions"><button className="button" onClick={()=>void share()}>{c.share}</button><button className="button secondary" onClick={()=>void copy()}>{c.copy}</button></div>{notice&&<p role="status" className="notice">{notice}</p>}
    <div className="app-stats"><article><small>{achievementUi.completed}</small><b>{completed}</b></article><article><small>{achievementUi.progress}</small><b>{summary.pendingInvites??0}</b></article><article><small>{c.coupons}</small><b>{activeCount}</b></article></div>
    {commission&&<div className="referral-achievement"><small>推广现金佣金（新人首笔有效行程完成后解锁）</small><div className="app-stats"><article><small>待结算</small><b>¥{commission.pendingJpy.toLocaleString()}</b></article><article><small>可提现</small><b>¥{commission.availableJpy.toLocaleString()}</b></article><article><small>审核/打款中</small><b>¥{commission.lockedJpy.toLocaleString()}</b></article><article><small>累计已付</small><b>¥{commission.paidJpy.toLocaleString()}</b></article></div>{commission.qualificationStatus!=='approved'&&<p className="privacy">现金推广资格：{commission.qualificationStatus==='pending'?'审核中':commission.qualificationStatus==='suspended'?'已暂停':'尚未获批'}。游客需申请并通过运营审核；获批司导自动开通。</p>}<button className="button" disabled={payoutBusy||commission.availableJpy<=0||commission.qualificationStatus!=='approved'} onClick={async()=>{if(!services||!window.confirm(`确认申请提现 ¥${commission.availableJpy.toLocaleString()}？每周只能申请一次。`))return;setPayoutBusy(true);const result=await services.requestOwnCommissionPayout(crypto.randomUUID());setPayoutBusy(false);setNotice(result.ok?'提现申请已提交，余额已锁定等待审核。':`申请失败：${result.error}`);if(result.ok)setCommission(await services.loadOwnCashCommissionSummary())}}>{payoutBusy?'正在提交':'申请本周提现'}</button>{commission.payouts.length>0&&<div className="app-list">{commission.payouts.map(item=><article className="order-card" key={item.id}><b>¥{item.amountJpy.toLocaleString()} · {item.status}</b><small>{item.weekStart} 周申请</small></article>)}</div>}</div>}
    <h2>{c.coupons}</h2><div className="coupon-filter-tabs" role="tablist">{(['all','active','pending','used','invalid'] as const).map(key=><button role="tab" aria-selected={couponFilter===key} className={couponFilter===key?'active':''} onClick={()=>setCouponFilter(key)} key={key}>{filterCopy[key]}</button>)}</div>{summary.coupons.length===0?<p className="privacy">{c.none}</p>:visibleCoupons.length===0?<p className="privacy">{c.none}</p>:<div className="app-list">{visibleCoupons.map(item=>{const waiting=item.status==='pending_trip_completion';const invalid=['void','frozen','expired'].includes(item.status);const used=['reserved','redeemed'].includes(item.status);const format=(value:string|null)=>value?new Date(value).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tokyo'}):null;return <article className={`order-card referral-coupon ${waiting?'is-pending':''} ${invalid?'is-invalid':''} ${used?'is-used':''}`} key={item.id}><b>{item.discountPercent}% OFF</b><span>{item.recipientKind==='inviter'?c.invites:c.title}</span>{invalid?<small>{c.invalid}</small>:waiting?<><small>{c.pending}</small>{item.qualifyingTripStartsAt&&<span>{c.tripStarts}：{format(item.qualifyingTripStartsAt)}</span>}{item.availableAt&&<span>{c.available}：{format(item.availableAt)}</span>}</>:used?<small>{filterCopy.usedStatus}</small>:<><small>{filterCopy.activeStatus}</small><span>{c.valid} {new Date(item.expiresAt).toLocaleDateString(locale)}</span></>}</article>})}</div>}
  </section>;
}
function TravelShareCampaign(){
  const {services}=useApp();
  const [data,setData]=useState<Awaited<ReturnType<NonNullable<typeof services>['loadOwnShareCampaign']>>|null>(null);
  const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const reload=async()=>{if(services)setData(await services.loadOwnShareCampaign())};
  useEffect(()=>{void reload()},[services]);
  if(!data)return <section className="form"><h2>旅行分享活动</h2><p>正在读取活动状态…</p></section>;
  if(!data.campaign)return <section className="form"><h2>旅行分享活动</h2><p className="privacy">活动规则尚在确认，目前保持关闭。开放后只需提交 TikTok、Instagram 或 Facebook 的帖子链接，不上传照片或视频文件。</p></section>;
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!services||!data.campaign)return;const form=new FormData(event.currentTarget);setBusy(true);const result=await services.submitShareLink({campaignId:String(data.campaign.id),orderId:String(form.get('orderId')),platform:String(form.get('platform')) as 'tiktok'|'instagram'|'facebook',url:String(form.get('url')),platformAccount:String(form.get('platformAccount')),authorizationVersion:'share-link-v1'});setBusy(false);setNotice(result.error??'链接已提交，等待人工核验；互动数不会被系统臆测为 0。');if(result.ok){event.currentTarget.reset();await reload()}};
  return <section className="form"><h2>旅行分享活动</h2><p className="privacy">仅提交外部帖子链接。帖子需关联本人已完成的行程并 @ 对应平台官方账号；转载授权不等同于音乐或同行者肖像授权。活动先人工核验，不自动抓取或保存视频。</p><form onSubmit={submit}><label>已完成订单<select name="orderId" required><option value="">请选择</option>{data.orders.map(order=><option value={String(order.id)} key={String(order.id)}>{String(order.id).slice(0,8)} · {String(order.status)}</option>)}</select></label><label>平台<select name="platform" required><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select></label><label>本人平台账号<input name="platformAccount" required minLength={2}/></label><label>公开帖子链接<input name="url" required type="url" placeholder="https://…"/></label><label className="check"><input type="checkbox" required/><span>我确认内容属于本人，并授权官方账号按活动说明转载该帖子链接所指内容；付费广告或扩大用途需另行确认。</span></label><button className="button full" disabled={busy||data.orders.length===0}>{busy?'正在提交':'提交链接等待核验'}</button></form>{notice&&<p className="notice" role="status">{notice}</p>}{data.submissions.length>0&&<div className="app-list">{data.submissions.map(item=><article className="order-card" key={String(item.id)}><b>{String(item.platform)}</b><span>{String(item.platform_account)} · {String(item.status)}</span><a href={String(item.post_url)} target="_blank" rel="noreferrer">查看已提交链接</a></article>)}</div>}</section>;
}
export function Profile() {
  const { state, setUi, reset, services } = useApp();
  const locale=state.ui.locale??'zh-CN';
  const pc=profileCopy[locale];
  const nav = useNavigate();
  const [profile, setProfile] = useState({
    displayName: "",
    phone: "",
    emergencyName: "",
    emergencyPhone: "",
  });
  const [profileState, setProfileState] = useState<
    "loading" | "ready" | "saving" | "unavailable"
  >(services ? "loading" : "unavailable");
  const [profileNotice, setProfileNotice] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayNameNotice, setDisplayNameNotice] = useState("");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [accountRole,setAccountRole]=useState<string|null>(null);
  useEffect(() => {
    let active = true;
    if (!services)
      return () => {
        active = false;
      };
    void Promise.all([services.loadOwnAccountProfile(),services.loadOwnDisplayName(),services.currentRole().catch(()=>null)]).then(([result,nameResult,role]) => {
      if (!active) return;
      setAccountRole(role);
      if (result.error) {
        setProfileNotice(result.error);
        setProfileState("unavailable");
        return;
      }
      if (result.data)
        setProfile({
          displayName: result.data.display_name,
          phone: result.data.phone,
          emergencyName: result.data.emergency_name,
          emergencyPhone: result.data.emergency_phone,
        });
      setDisplayName(nameResult.data || result.data?.display_name || "");
      if(nameResult.error)setDisplayNameNotice(nameResult.error);
      setProfileState("ready");
    });
    return () => {
      active = false;
    };
  }, [services]);
  const saveDisplayName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services) return;
    setDisplayNameSaving(true);
    const result=await services.updateOwnDisplayName(displayName);
    setDisplayNameSaving(false);
    setDisplayNameNotice(result.error ?? pc.saved);
    if(result.ok)setDisplayName(result.data ?? displayName.trim());
  };
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services) return;
    const form = new FormData(event.currentTarget);
    setProfileState("saving");
    const result = await services.updateOwnAccountProfile({
      displayName,
      phone: String(form.get("phone")),
      emergencyName: String(form.get("emergencyName")),
      emergencyPhone: String(form.get("emergencyPhone")),
      acceptedTerms: Boolean(form.get("terms")),
      acceptedPrivacy: Boolean(form.get("privacy")),
    });
    setProfileState("ready");
    setProfileNotice(result.error ?? pc.saved);
    if (result.ok)
      setProfile({
        displayName,
        phone: String(form.get("phone")),
        emergencyName: String(form.get("emergencyName")),
        emergencyPhone: String(form.get("emergencyPhone")),
      });
  };
  const logout = async () => {
    if (services) await services.signOut();
    reset();
    nav("/app/login");
  };
  return (
    <>
      <AppTitle eyebrow={pc.eyebrow} title={pc.title} />
      <div className="receipt">
        <div>
          <span>{pc.status}</span>
          <b>
            {services
              ? state.user
                ? pc.signed
                : pc.signedOut
              : backend.connected
                ? "本地开发账户"
                : "账户服务不可用"}
          </b>
        </div>
        <div>
          <span>{pc.email}</span>
          <b>{state.user?.email ?? pc.signedOut}</b>
        </div>
        <div>
          <span>{pc.language}</span>
          <b>{passengerLocales.find(item=>item.code===locale)?.label}</b>
        </div>
        <div>
          <span>{pc.runtime}</span>
          <b>
            {appConfig.runtimeMode === "production"
              ? pc.production
              : appConfig.runtimeMode === "development"
                ? pc.development
                : pc.demo}
          </b>
        </div>
      </div>
      <section className="form" aria-labelledby="account-center-title">
        <h2 id="account-center-title">{pc.center}</h2>
        <p className="privacy">{pc.centerText}</p>
        <div className="inline-actions account-center-actions">
          <Link className="button" to="/app/orders">
            {pc.orders}
          </Link>
          <Link className="button secondary" to="/app/my-trip/room">
            {pc.messages}
          </Link>
        </div>
      </section>
      {accountRole==='passenger'&&<TravelShareCampaign/>}
      {services && (
        <form className="form" onSubmit={saveDisplayName}>
          <h2>{pc.name}</h2>
          <label>
            {pc.name} *
            <input required maxLength={80} value={displayName} onChange={(event)=>setDisplayName(event.target.value)}/>
          </label>
          <button className="button full" disabled={displayNameSaving}>{displayNameSaving?pc.saving:pc.save}</button>
          {displayNameNotice&&<p className="notice" role="status">{displayNameNotice}</p>}
        </form>
      )}
      {services && accountRole==='passenger' && (
        <form className="form" onSubmit={saveProfile}>
          <h2>{pc.details}</h2>
          <p className="privacy">{pc.detailsText}</p>
          <label>
            {pc.phone} *
            <input
              required
              name="phone"
              type="tel"
              maxLength={40}
              value={profile.phone}
              onChange={(event) =>
                setProfile({ ...profile, phone: event.target.value })
              }
            />
          </label>
          <label>
            {pc.emergencyName} *
            <input
              required
              name="emergencyName"
              maxLength={80}
              value={profile.emergencyName}
              onChange={(event) =>
                setProfile({ ...profile, emergencyName: event.target.value })
              }
            />
          </label>
          <label>
            {pc.emergencyPhone} *
            <input
              required
              name="emergencyPhone"
              type="tel"
              maxLength={40}
              value={profile.emergencyPhone}
              onChange={(event) =>
                setProfile({ ...profile, emergencyPhone: event.target.value })
              }
            />
          </label>
          <label className="check">
            <input required name="terms" type="checkbox" /> {pc.agree}{" "}
            <Link to="/terms">{pc.terms}</Link>
          </label>
          <label className="check">
            <input required name="privacy" type="checkbox" /> {pc.agree}{" "}
            <Link to="/privacy">{pc.privacy}</Link>
          </label>
          <button
            className="button full"
            disabled={profileState === "loading" || profileState === "saving"}
          >
            {profileState === "loading"
              ? pc.loading
              : profileState === "saving"
                ? pc.saving
                : pc.save}
          </button>
          {profileNotice && (
            <p className="notice" role="status">
              {profileNotice}
            </p>
          )}
        </form>
      )}
      <LanguageSelect />
      <label className="check">
        <input
          type="checkbox"
          checked={state.ui.compact}
          onChange={(e) => setUi({ compact: e.target.checked })}
        />{" "}
        {pc.compact}
      </label>
      {services && state.user ? (
        <button className="button danger-button full" onClick={logout}>
          {pc.logout}
        </button>
      ) : (
        <button
          className="button danger-button full"
          onClick={() => {
            reset();
            nav("/app/login");
          }}
        >
          {pc.reset}
        </button>
      )}
      <p className="privacy">
        {pc.logoutText}
      </p>
    </>
  );
}
export function NotFound() {
  const location = useLocation();
  return (
    <main className="empty">
      <h1>页面不存在</h1>
      <p>无法找到：{location.pathname}</p>
      <Link to="/">返回首页</Link>
    </main>
  );
}
