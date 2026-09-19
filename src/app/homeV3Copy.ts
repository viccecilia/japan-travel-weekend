import type {PassengerLocale} from '../shared/i18n/passengerLocale';
const labels:Record<PassengerLocale,[string,string,string,string,string]> = {
  'zh-CN':['未来 7 天','其他日期','当日可报名路线','我的旅行权益','更多出行方式'],
  'zh-TW':['未來 7 天','其他日期','當日可報名路線','我的旅行權益','更多出行方式'],
  ja:['今後7日間','別の日付','この日のツアー','旅行特典','その他の旅行'],
  en:['Next 7 days','Other dates','Trips on this date','My travel benefits','More ways to travel'],
  es:['Próximos 7 días','Otras fechas','Viajes de este día','Mis ventajas','Más formas de viajar'],
  vi:['7 ngày tới','Ngày khác','Chuyến đi trong ngày','Quyền lợi của tôi','Cách du lịch khác'],
  ne:['आगामी ७ दिन','अन्य मिति','यस मितिका यात्रा','मेरो यात्रा लाभ','अन्य यात्रा विकल्प'],
  ko:['앞으로 7일','다른 날짜','이 날짜의 여행','내 여행 혜택','다른 여행 방법'],
};
export const homeV3Labels = (locale:PassengerLocale) => labels[locale];

