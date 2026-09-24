import type {PassengerLocale} from './passengerLocale';

type Navigation = {home:string;trips:string;orders:string;messages:string;profile:string;notifications:string;bottom:{home:string;trips:string;orders:string;messages:string;profile:string}};
export const passengerNavigation:Record<PassengerLocale,Navigation>={
 'zh-CN':{home:'发现',trips:'精选线路',orders:'订单',messages:'消息',profile:'我的',notifications:'系统通知',bottom:{home:'发现',trips:'精选线路',orders:'订单',messages:'消息',profile:'我的'}},
 'zh-TW':{home:'發現',trips:'精選路線',orders:'訂單',messages:'訊息',profile:'我的',notifications:'系統通知',bottom:{home:'發現',trips:'精選路線',orders:'訂單',messages:'訊息',profile:'我的'}},
 ja:{home:'発見',trips:'厳選コース',orders:'予約',messages:'メッセージ',profile:'マイページ',notifications:'お知らせ',bottom:{home:'発見',trips:'コース',orders:'予約',messages:'メッセージ',profile:'マイページ'}},
 en:{home:'Discover',trips:'Curated Trips',orders:'Orders',messages:'Messages',profile:'My Page',notifications:'Notifications',bottom:{home:'Discover',trips:'Trips',orders:'Orders',messages:'Messages',profile:'Profile'}},
 ko:{home:'발견',trips:'추천 코스',orders:'주문',messages:'메시지',profile:'마이페이지',notifications:'알림',bottom:{home:'발견',trips:'코스',orders:'주문',messages:'메시지',profile:'마이'}},
 es:{home:'Descubrir',trips:'Rutas seleccionadas',orders:'Reservas',messages:'Mensajes',profile:'Mi cuenta',notifications:'Notificaciones',bottom:{home:'Descubrir',trips:'Rutas',orders:'Pedidos',messages:'Mensajes',profile:'Perfil'}},
 vi:{home:'Khám phá',trips:'Tuyến chọn lọc',orders:'Đơn của tôi',messages:'Tin nhắn',profile:'Tài khoản',notifications:'Thông báo',bottom:{home:'Khám phá',trips:'Tuyến',orders:'Đơn',messages:'Tin nhắn',profile:'Tôi'}},
 ne:{home:'खोज',trips:'छानिएका यात्रा',orders:'मेरा अर्डर',messages:'सन्देश',profile:'मेरो पृष्ठ',notifications:'सूचनाहरू',bottom:{home:'खोज',trips:'रुट',orders:'अर्डर',messages:'सन्देश',profile:'मेरो'}},
};
