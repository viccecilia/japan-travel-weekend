import type {PassengerLocale} from './passengerLocale';
export const resumePaymentCopy:Record<PassengerLocale,{action:string;loading:string;failed:string;unavailable:string}>={
 'zh-CN':{action:'继续支付',loading:'正在恢复原订单支付…',failed:'无法继续支付。请刷新订单核对状态或联系工作人员；未重新下单。',unavailable:'测试支付服务暂不可用。'},
 'zh-TW':{action:'繼續付款',loading:'正在恢復原訂單付款…',failed:'無法繼續付款。請重新整理訂單確認狀態或聯絡工作人員；未重新下單。',unavailable:'測試付款服務暫不可用。'},
 ja:{action:'支払いを再開',loading:'元の予約の支払いを確認中…',failed:'再開できません。予約を更新して確認するかスタッフにご連絡ください。新しい予約は作成されていません。',unavailable:'テスト決済は現在利用できません。'},
 en:{action:'Continue payment',loading:'Resuming the original order…',failed:'Cannot resume. Refresh the order or contact staff. No new order was created.',unavailable:'Test payment is currently unavailable.'},
 es:{action:'Continuar el pago',loading:'Recuperando el pago de la reserva…',failed:'No se puede continuar. Actualiza la reserva o contacta al equipo. No se ha creado otra reserva.',unavailable:'El pago de prueba no está disponible.'},
 ko:{action:'결제 계속하기',loading:'기존 주문 결제 확인 중…',failed:'결제를 재개할 수 없습니다. 주문을 새로고침하거나 직원에게 문의해 주세요. 새 주문은 생성되지 않았습니다.',unavailable:'테스트 결제를 사용할 수 없습니다.'},
 vi:{action:'Tiếp tục thanh toán',loading:'Đang khôi phục thanh toán đơn cũ…',failed:'Không thể tiếp tục. Hãy tải lại đơn hoặc liên hệ nhân viên. Không có đơn mới được tạo.',unavailable:'Thanh toán thử nghiệm hiện không khả dụng.'},
 ne:{action:'भुक्तानी जारी राख्नुहोस्',loading:'पुरानै अर्डरको भुक्तानी खोलिँदै…',failed:'जारी राख्न सकिएन। अर्डर रिफ्रेस गर्नुहोस् वा कर्मचारीलाई सम्पर्क गर्नुहोस्। नयाँ अर्डर बनाइएको छैन।',unavailable:'परीक्षण भुक्तानी अहिले उपलब्ध छैन।'},
};
