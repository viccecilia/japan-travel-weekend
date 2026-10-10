import type {PassengerLocale} from './passengerLocale';
import {expandedRouteSummary} from './routeExpansion';

export type LegacyRouteContent={
  title:string;
  region:string;
  duration:string;
  summary:string;
  stops:string[];
};

const standardRouteListTranslations:Record<string,Partial<Record<PassengerLocale,string>>>={
  '往返车辆与司机服务':{
    'zh-CN':'往返车辆与司机服务','zh-TW':'往返車輛與司機服務',ja:'往復車両・ドライバーサービス',en:'Round-trip vehicle and driver service',ko:'왕복 차량 및 운전기사 서비스',vi:'Xe khứ hồi và tài xế',ne:'आउने-जाने सवारी र चालक सेवा',es:'Vehículo de ida y vuelta con conductor',
  },
  '行程履约支持与本车 Trip Room':{
    'zh-CN':'行程履约支持与本车 Trip Room','zh-TW':'行程履約支援與本車 Trip Room',ja:'行程運営サポートと本車両の Trip Room',en:'Trip operations support and this vehicle’s Trip Room',ko:'여행 운영 지원 및 해당 차량 Trip Room',vi:'Hỗ trợ vận hành hành trình và Trip Room của xe',ne:'यात्रा सञ्चालन सहयोग र यस सवारीको Trip Room',es:'Asistencia operativa del viaje y Trip Room del vehículo',
  },
  '往返车辆与司导服务':{
    'zh-CN':'往返车辆与司导服务','zh-TW':'往返車輛與司導服務',ja:'往復車両・ドライバーガイドサービス',en:'Round-trip vehicle and driver-guide service',ko:'왕복 차량 및 드라이버 가이드 서비스',vi:'Xe khứ hồi và dịch vụ tài xế kiêm hướng dẫn',ne:'आउने-जाने सवारी र चालक-गाइड सेवा',es:'Vehículo de ida y vuelta con conductor-guía',
  },
  '行程内运营通知与集合支持':{
    'zh-CN':'行程内运营通知与集合支持','zh-TW':'行程內營運通知與集合支援',ja:'行程中の運営連絡と集合サポート',en:'Trip notifications and meeting support',ko:'여행 중 운영 알림 및 집합 지원',vi:'Thông báo vận hành và hỗ trợ tập trung trong hành trình',ne:'यात्राका सञ्चालन सूचना र भेट्ने सहयोग',es:'Avisos operativos y asistencia en el punto de encuentro',
  },
  '未在班次确认页明确列出的景点门票':{
    'zh-CN':'未在班次确认页明确列出的景点门票','zh-TW':'班次確認頁未明確列出的景點門票',ja:'便の確認画面に明記されていない施設入場料',en:'Attraction admission not explicitly listed on the departure confirmation page',ko:'출발편 확인 페이지에 명시되지 않은 관광지 입장료',vi:'Vé tham quan không được ghi rõ trên trang xác nhận chuyến',ne:'प्रस्थान पुष्टि पृष्ठमा स्पष्ट रूपमा नलेखिएका आकर्षण प्रवेश शुल्क',es:'Entradas no indicadas expresamente en la confirmación de la salida',
  },
  '餐食、饮品及个人消费':{
    'zh-CN':'餐食、饮品及个人消费','zh-TW':'餐食、飲品及個人消費',ja:'食事・飲み物・個人的な費用',en:'Meals, drinks and personal expenses',ko:'식사, 음료 및 개인 경비',vi:'Bữa ăn, đồ uống và chi phí cá nhân',ne:'खाना, पेय पदार्थ र व्यक्तिगत खर्च',es:'Comidas, bebidas y gastos personales',
  },
  '餐饮及个人消费':{
    'zh-CN':'餐饮及个人消费','zh-TW':'餐飲及個人消費',ja:'飲食代と個人的な費用',en:'Food, drinks and personal expenses',ko:'식음료 및 개인 경비',vi:'Ăn uống và chi phí cá nhân',ne:'खानपान र व्यक्तिगत खर्च',es:'Comidas, bebidas y gastos personales',
  },
  '景点临时收费或自选项目':{
    'zh-CN':'景点临时收费或自选项目','zh-TW':'景點臨時收費或自選項目',ja:'現地での臨時料金または任意参加の項目',en:'Temporary attraction charges or optional activities',ko:'현장 임시 요금 또는 선택 활동',vi:'Phí phát sinh tại điểm tham quan hoặc hoạt động tự chọn',ne:'आकर्षणस्थलका अस्थायी शुल्क वा वैकल्पिक गतिविधि',es:'Cargos temporales en atracciones o actividades opcionales',
  },
};

const standardOperationalStopTranslations:Record<string,Partial<Record<PassengerLocale,string>>>={
  '大阪日本桥集合':{'zh-CN':'大阪日本桥集合','zh-TW':'大阪日本橋集合',ja:'大阪・日本橋集合',en:'Meet at Osaka Nipponbashi',ko:'오사카 닛폰바시 집합',vi:'Tập trung tại Nipponbashi, Osaka',ne:'ओसाका निप्पोनबाशीमा भेट',es:'Encuentro en Nipponbashi, Osaka'},
  '京都站集合':{'zh-CN':'京都站集合','zh-TW':'京都站集合',ja:'京都駅集合',en:'Meet at Kyoto Station',ko:'교토역 집합',vi:'Tập trung tại ga Kyoto',ne:'क्योटो स्टेशनमा भेट',es:'Encuentro en la estación de Kioto'},
  '返回大阪':{'zh-CN':'返回大阪','zh-TW':'返回大阪',ja:'大阪へ戻る',en:'Return to Osaka',ko:'오사카로 귀환',vi:'Trở về Osaka',ne:'ओसाका फर्कने',es:'Regreso a Osaka'},
  '千叠敷与三段壁':{'zh-CN':'千叠敷与三段壁','zh-TW':'千疊敷與三段壁',ja:'千畳敷と三段壁',en:'Senjojiki and Sandanbeki',ko:'센조지키와 산단베키',vi:'Senjojiki và Sandanbeki',ne:'सेन्जोजिकी र सानदानबेकी',es:'Senjojiki y Sandanbeki'},
};

export function legacyStandardRouteLists(locale:PassengerLocale,included:string[]|undefined,excluded:string[]|undefined){
  const translate=(values:string[],prefix:string)=>Object.fromEntries(values.flatMap((source,index)=>{
    const value=standardRouteListTranslations[source]?.[locale];
    return value?[[`${prefix}-${index+1}`,value]]:[];
  }));
  const sourceIncluded=included??[];
  const sourceExcluded=excluded??[];
  const localizedIncluded=translate(sourceIncluded,'included');
  const localizedExcluded=translate(sourceExcluded,'excluded');
  return {
    ...(Object.keys(localizedIncluded).length===sourceIncluded.length&&sourceIncluded.length?{included:localizedIncluded}:{}),
    ...(Object.keys(localizedExcluded).length===sourceExcluded.length&&sourceExcluded.length?{excluded:localizedExcluded}:{}),
  };
}

export function legacyOperationalStopTitle(locale:PassengerLocale,source:string){
  return standardOperationalStopTranslations[source]?.[locale]??'';
}

type CoreLegacyRouteContent=Record<string,LegacyRouteContent>;

/**
 * Human-authored route cards that existed before the published-route layer.
 * These are presentation fallbacks only: a current-locale published record
 * always wins, and no locale is allowed to borrow another locale's copy.
 */
const coreLegacyContent:Partial<Record<PassengerLocale,CoreLegacyRouteContent>>={
  en:{
    'kyoto-nara-classic':{title:'Kyoto & Nara Highlights Day Trip',region:'Kyoto and Nara',duration:'9–10 hours',summary:'Travel from Osaka to Kiyomizu-dera, Fushimi Inari and Nara Park in one memorable day.',stops:['Kiyomizu-dera','Fushimi Inari Taisha','Nara Park']},
    'amanohashidate-ine':{title:'Amanohashidate & Ine Seaside Day Trip',region:'Northern Kyoto',duration:'10–11 hours',summary:'Discover Amanohashidate and the waterfront boathouses of Ine on a scenic journey from Osaka.',stops:['Amanohashidate','Chionji Temple','Ine Funaya']},
    'biwako-shirahige':{title:'Lake Biwa, Shirahige Shrine & Omihachiman',region:'Shiga',duration:'10–11 hours',summary:'Visit Shirahige Shrine, Lake Biwa viewpoints and La Collina Omihachiman.',stops:['Shirahige Shrine','Lake Biwa viewpoint','La Collina Omihachiman']},
    'wakayama-family':{title:'Wakayama Coast & Hot Spring Day Trip',region:'Wakayama',duration:'9–10 hours',summary:'Explore Wakayama’s characterful railway, seafood market, dramatic coast and hot springs.',stops:['Kishi Station','Toretore Market','Senjojiki','Sandanbeki']},
    'kobe-arima-rokko':{title:'Kobe, Arima Onsen & Mt. Rokko Night View',region:'Hyogo',duration:'10–11 hours',summary:'Combine historic Kobe, Arima Onsen, the harbor and a sparkling night view from Mt. Rokko.',stops:['Arima Onsen','Kitano Ijinkan','Kobe Harbor','Mt. Rokko']},
  },
  es:{
    'kyoto-nara-classic':{title:'Excursión de un día por Kioto y Nara',region:'Kioto y Nara',duration:'9–10 horas',summary:'Viaja desde Osaka para conocer Kiyomizu-dera, Fushimi Inari y el Parque de Nara en un día inolvidable.',stops:['Kiyomizu-dera','Fushimi Inari Taisha','Parque de Nara']},
    'amanohashidate-ine':{title:'Excursión costera a Amanohashidate e Ine',region:'Norte de Kioto',duration:'10–11 horas',summary:'Descubre Amanohashidate y las casas flotantes de Ine en una ruta panorámica desde Osaka.',stops:['Amanohashidate','Templo Chionji','Casas flotantes de Ine']},
    'biwako-shirahige':{title:'Lago Biwa, santuario Shirahige y Omihachiman',region:'Shiga',duration:'10–11 horas',summary:'Visita el santuario Shirahige, los miradores del lago Biwa y La Collina Omihachiman.',stops:['Santuario Shirahige','Mirador del lago Biwa','La Collina Omihachiman']},
    'wakayama-family':{title:'Costa y aguas termales de Wakayama',region:'Wakayama',duration:'9–10 horas',summary:'Disfruta de un ferrocarril singular, un mercado de marisco, una costa espectacular y aguas termales.',stops:['Estación Kishi','Mercado Toretore','Senjojiki','Sandanbeki']},
    'kobe-arima-rokko':{title:'Kobe, Arima Onsen y vista nocturna del monte Rokko',region:'Hyogo',duration:'10–11 horas',summary:'Combina el Kobe histórico, Arima Onsen, el puerto y la vista nocturna del monte Rokko.',stops:['Arima Onsen','Kitano Ijinkan','Puerto de Kobe','Monte Rokko']},
  },
  ja:{
    'kyoto-nara-classic':{title:'京都・奈良 名所めぐり日帰りツアー',region:'京都・奈良',duration:'約9～10時間',summary:'大阪から清水寺、伏見稲荷大社、奈良公園を一日で巡ります。',stops:['清水寺','伏見稲荷大社','奈良公園']},
    'amanohashidate-ine':{title:'天橋立・伊根 海の京都日帰りツアー',region:'京都北部',duration:'約10～11時間',summary:'天橋立と伊根の舟屋を訪ねる、大阪発の絶景日帰り旅です。',stops:['天橋立','智恩寺','伊根の舟屋']},
    'biwako-shirahige':{title:'琵琶湖・白鬚神社・近江八幡日帰りツアー',region:'滋賀',duration:'約10～11時間',summary:'白鬚神社、琵琶湖の展望スポット、ラ コリーナ近江八幡を巡ります。',stops:['白鬚神社','琵琶湖展望スポット','ラ コリーナ近江八幡']},
    'wakayama-family':{title:'和歌山の海岸と温泉 日帰りツアー',region:'和歌山',duration:'約9～10時間',summary:'個性的な駅、海鮮市場、海岸の絶景と温泉を楽しみます。',stops:['貴志駅','とれとれ市場','千畳敷','三段壁']},
    'kobe-arima-rokko':{title:'神戸・有馬温泉・六甲山夜景 日帰りツアー',region:'兵庫',duration:'約10～11時間',summary:'異国情緒ある神戸、有馬温泉、港、六甲山の夜景を一日で満喫します。',stops:['有馬温泉','北野異人館街','神戸港','六甲山']},
  },
  'zh-TW':{
    'kyoto-nara-classic':{title:'京都與奈良名勝一日遊',region:'京都與奈良',duration:'約 9–10 小時',summary:'從大阪出發，一天走訪清水寺、伏見稻荷大社與奈良公園。',stops:['清水寺','伏見稻荷大社','奈良公園']},
    'amanohashidate-ine':{title:'天橋立與伊根海岸一日遊',region:'京都北部',duration:'約 10–11 小時',summary:'從大阪前往天橋立與伊根舟屋，欣賞海之京都的獨特風景。',stops:['天橋立','智恩寺','伊根舟屋']},
    'biwako-shirahige':{title:'琵琶湖、白鬚神社與近江八幡一日遊',region:'滋賀',duration:'約 10–11 小時',summary:'走訪白鬚神社、琵琶湖觀景處與 La Collina 近江八幡。',stops:['白鬚神社','琵琶湖觀景處','La Collina 近江八幡']},
    'wakayama-family':{title:'和歌山海岸與溫泉一日遊',region:'和歌山',duration:'約 9–10 小時',summary:'體驗特色電車、海鮮市場、壯麗海岸與溫泉。',stops:['貴志站','Toretore 市場','千疊敷','三段壁']},
    'kobe-arima-rokko':{title:'神戶、有馬溫泉與六甲山夜景一日遊',region:'兵庫',duration:'約 10–11 小時',summary:'一次感受神戶歷史街區、有馬溫泉、港灣與六甲山夜景。',stops:['有馬溫泉','北野異人館街','神戶港','六甲山']},
  },
  vi:{
    'kyoto-nara-classic':{title:'Đi Kyoto & Nara trong ngày',region:'Kyoto và Nara',duration:'9–10 giờ',summary:'Khởi hành từ Osaka, khám phá chùa Kiyomizu, Fushimi Inari và công viên Nara trong một ngày.',stops:['Chùa Kiyomizu','Fushimi Inari Taisha','Công viên Nara']},
    'amanohashidate-ine':{title:'Amanohashidate & Ine trong ngày',region:'Bắc Kyoto',duration:'10–11 giờ',summary:'Khám phá Amanohashidate và làng nhà thuyền Ine trên hành trình ven biển từ Osaka.',stops:['Amanohashidate','Chùa Chionji','Nhà thuyền Ine']},
    'biwako-shirahige':{title:'Hồ Biwa, đền Shirahige & Omihachiman',region:'Shiga',duration:'10–11 giờ',summary:'Thăm đền Shirahige, điểm ngắm hồ Biwa và La Collina Omihachiman.',stops:['Đền Shirahige','Điểm ngắm hồ Biwa','La Collina Omihachiman']},
    'wakayama-family':{title:'Bờ biển & suối nước nóng Wakayama',region:'Wakayama',duration:'9–10 giờ',summary:'Trải nghiệm đường sắt độc đáo, chợ hải sản, bờ biển hùng vĩ và suối nước nóng.',stops:['Ga Kishi','Chợ Toretore','Senjojiki','Sandanbeki']},
    'kobe-arima-rokko':{title:'Kobe, Arima Onsen & cảnh đêm Rokko',region:'Hyogo',duration:'10–11 giờ',summary:'Kết hợp phố cổ Kobe, Arima Onsen, cảng biển và cảnh đêm núi Rokko.',stops:['Arima Onsen','Kitano Ijinkan','Cảng Kobe','Núi Rokko']},
  },
  ne:{
    'kyoto-nara-classic':{title:'क्योटो र नारा एकदिने यात्रा',region:'क्योटो र नारा',duration:'९–१० घण्टा',summary:'ओसाकाबाट कियोमिजु-डेरा, फुशिमी इनारी र नारा पार्क एकै दिनमा घुम्नुहोस्।',stops:['कियोमिजु-डेरा','फुशिमी इनारी ताइशा','नारा पार्क']},
    'amanohashidate-ine':{title:'अमानोहाशिदाते र इने एकदिने यात्रा',region:'उत्तरी क्योटो',duration:'१०–११ घण्टा',summary:'ओसाकाबाट अमानोहाशिदाते र इनेका डुङ्गाघरको रमणीय समुद्री यात्रा।',stops:['अमानोहाशिदाते','चिओन्जी मन्दिर','इने फुनाया']},
    'biwako-shirahige':{title:'बिवा ताल, शिराहिगे र ओमिहाचिमान',region:'शिगा',duration:'१०–११ घण्टा',summary:'शिराहिगे मन्दिर, बिवा ताल दृश्यस्थल र ला कोलिना ओमिहाचिमान भ्रमण गर्नुहोस्।',stops:['शिराहिगे मन्दिर','बिवा ताल दृश्यस्थल','ला कोलिना ओमिहाचिमान']},
    'wakayama-family':{title:'वाकायामा तट र तातोपानी एकदिने यात्रा',region:'वाकायामा',duration:'९–१० घण्टा',summary:'विशेष रेलमार्ग, समुद्री खाना बजार, भव्य तट र तातोपानीको अनुभव लिनुहोस्।',stops:['किशी स्टेशन','तोरेतोरे बजार','सेन्जोजिकी','सान्दानबेकी']},
    'kobe-arima-rokko':{title:'कोबे, अरिमा ओन्सेन र रोक्को रात्री दृश्य',region:'ह्योगो',duration:'१०–११ घण्टा',summary:'ऐतिहासिक कोबे, अरिमा ओन्सेन, बन्दरगाह र रोक्को पर्वतको रात्री दृश्य एकै यात्रामा।',stops:['अरिमा ओन्सेन','कितानो इजिनकान','कोबे बन्दरगाह','रोक्को पर्वत']},
  },
  ko:{
    'kyoto-nara-classic':{title:'교토·나라 명소 당일 여행',region:'교토와 나라',duration:'약 9–10시간',summary:'오사카에서 출발해 기요미즈데라, 후시미 이나리와 나라 공원을 하루에 둘러봅니다.',stops:['기요미즈데라','후시미 이나리 타이샤','나라 공원']},
    'amanohashidate-ine':{title:'아마노하시다테·이네 해안 당일 여행',region:'교토 북부',duration:'약 10–11시간',summary:'오사카에서 아마노하시다테와 이네 후나야를 찾는 아름다운 해안 여행입니다.',stops:['아마노하시다테','지온지','이네 후나야']},
    'biwako-shirahige':{title:'비와호·시라히게 신사·오미하치만',region:'시가',duration:'약 10–11시간',summary:'시라히게 신사, 비와호 전망대와 라 코리나 오미하치만을 방문합니다.',stops:['시라히게 신사','비와호 전망대','라 코리나 오미하치만']},
    'wakayama-family':{title:'와카야마 해안과 온천 당일 여행',region:'와카야마',duration:'약 9–10시간',summary:'개성 있는 철도, 해산물 시장, 웅장한 해안과 온천을 체험합니다.',stops:['기시역','토레토레 시장','센조지키','산단베키']},
    'kobe-arima-rokko':{title:'고베·아리마 온천·롯코산 야경',region:'효고',duration:'약 10–11시간',summary:'고베의 역사 거리, 아리마 온천, 항구와 롯코산 야경을 한 번에 즐깁니다.',stops:['아리마 온천','기타노 이진칸','고베항','롯코산']},
  },
};

export function legacyRouteContent(locale:PassengerLocale,slug:string):LegacyRouteContent|null{
  const core=coreLegacyContent[locale]?.[slug];
  if(core)return {...core,stops:[...core.stops]};
  const expanded=expandedRouteSummary(locale,slug);
  return expanded?{title:expanded.name,region:expanded.region,duration:expanded.duration,summary:expanded.summary,stops:expanded.stops}:null;
}

export const legacyRouteSlugs=()=>new Set([
  ...Object.values(coreLegacyContent).flatMap(content=>Object.keys(content??{})),
  ...['uji-nara-onsen','miyama-katsuoji-arashiyama','arashiyama-train-hozugawa','sanzenin-kibune-arashiyama-autumn'],
]);
