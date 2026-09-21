import type {PassengerLocale} from './passengerLocale';
type Copy={add:string;send:string;busy:string;failed:string;limits:string;retry:string;remove:string;photo:string};
export const chatPhotoCopy:Record<PassengerLocale,Copy>={
 'zh-CN':{add:'添加图片',send:'发送图片',busy:'上传并发送中…',failed:'图片未能发送，请重试。',limits:'仅 JPG、PNG、WebP、GIF 图片，最大5MB。',retry:'重试',remove:'移除',photo:'本车群照片'},
 'zh-TW':{add:'新增圖片',send:'傳送圖片',busy:'上傳並傳送中…',failed:'圖片未能傳送，請重試。',limits:'僅 JPG、PNG、WebP、GIF 圖片，最大5MB。',retry:'重試',remove:'移除',photo:'本車群照片'},
 en:{add:'Add photo',send:'Send photo',busy:'Uploading and sending…',failed:'Photo could not be sent. Please retry.',limits:'JPG, PNG, WebP or GIF only. Maximum 5MB.',retry:'Retry',remove:'Remove',photo:'Vehicle group photo'},
 ja:{add:'写真を追加',send:'写真を送信',busy:'アップロード・送信中…',failed:'写真を送信できません。再試行してください。',limits:'JPG・PNG・WebP・GIF、最大5MB。',retry:'再試行',remove:'削除',photo:'本車グループの写真'},
 ko:{add:'사진 추가',send:'사진 보내기',busy:'업로드 및 전송 중…',failed:'사진을 보내지 못했습니다. 다시 시도하세요.',limits:'JPG, PNG, WebP, GIF만 허용, 최대 5MB.',retry:'다시 시도',remove:'제거',photo:'차량 그룹 사진'},
 es:{add:'Añadir foto',send:'Enviar foto',busy:'Subiendo y enviando…',failed:'No se pudo enviar la foto. Inténtalo de nuevo.',limits:'Solo JPG, PNG, WebP o GIF. Máximo 5MB.',retry:'Reintentar',remove:'Quitar',photo:'Foto del grupo del vehículo'},
 vi:{add:'Thêm ảnh',send:'Gửi ảnh',busy:'Đang tải lên và gửi…',failed:'Không gửi được ảnh. Vui lòng thử lại.',limits:'Chỉ JPG, PNG, WebP hoặc GIF, tối đa 5MB.',retry:'Thử lại',remove:'Xóa',photo:'Ảnh nhóm cùng xe'},
 ne:{add:'फोटो थप्नुहोस्',send:'फोटो पठाउनुहोस्',busy:'अपलोड र पठाउँदै…',failed:'फोटो पठाउन सकिएन। फेरि प्रयास गर्नुहोस्।',limits:'JPG, PNG, WebP वा GIF मात्र। अधिकतम 5MB।',retry:'फेरि प्रयास',remove:'हटाउनुहोस्',photo:'गाडी समूहको फोटो'},
};
