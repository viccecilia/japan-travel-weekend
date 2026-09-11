import { Link } from "react-router-dom";
import type { Trip } from "../types";
import type {PassengerLocale} from '../i18n/passengerLocale';
import {expandedRouteSummary} from '../i18n/routeExpansion';
import {trips as baselineTrips} from '../data/trips';
const appCardCopy:Record<PassengerLocale,{route:string;view:string}>={
  'zh-CN':{route:'简要路线',view:'查看路线'},'zh-TW':{route:'簡要路線',view:'查看路線'},ja:{route:'主なルート',view:'ツアーを見る'},en:{route:'Route summary',view:'View trip'},es:{route:'Resumen de la ruta',view:'Ver viaje'},vi:{route:'Tuyến tóm tắt',view:'Xem chuyến'},ne:{route:'रुट सारांश',view:'यात्रा हेर्नुहोस्'},ko:{route:'간단 노선',view:'여행 보기'}
};
const localizedTrips:Partial<Record<PassengerLocale,Record<string,{title:string;region:string;duration:string;summary:string;stops:string[]}>>>= {
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
  }
};
export const localizedTrip=(locale:PassengerLocale,trip:Trip)=>{
  const expanded=expandedRouteSummary(locale,trip.slug);
  const baseline=baselineTrips.find(item=>item.slug===trip.slug);
  return localizedTrips[locale]?.[trip.slug]??(expanded?{title:expanded.name,...expanded}:{
    title:trip.title||baseline?.title||trip.slug,
    region:trip.region||baseline?.region||'',
    duration:trip.duration||baseline?.duration||'',
    summary:trip.summary||baseline?.summary||baseline?.description||'',
    stops:trip.stops.length?trip.stops:(baseline?.stops??[]),
  });
};
export function TripCard({ trip, app = false, showcaseIndex,locale='zh-CN' }: { trip: Trip; app?: boolean; showcaseIndex?: number;locale?:PassengerLocale }) {
  const c=appCardCopy[locale];
  const display=localizedTrip(locale,trip);
  if(showcaseIndex!=null)return <article className="trip-card editorial-trip-card">
    <header className="editorial-trip-head"><span>0{showcaseIndex} · {display.region} · {display.duration}</span><h3>{display.title}</h3><p>{display.summary}</p></header>
    <div className="trip-card-media"><img src={trip.heroImage} alt={`${display.title} route scenery`} />{showcaseIndex===1&&<b className="featured-badge">本期推荐</b>}</div>
    <footer className="editorial-trip-route"><div><span>{c.route}</span><p>{display.stops.slice(0,4).join(' → ')}</p></div><Link className="editorial-trip-link" to={`/trips/${trip.slug}`} aria-label={`${c.view}: ${display.title}`}>{c.view} <b>→</b></Link></footer>
  </article>;
  return (
    <article className="trip-card">
      <div className="trip-card-media"><img src={trip.heroImage} alt={display.title} /></div>
      <div>
        <div className="eyebrow">
          {display.region} · {display.duration}
        </div>
        <h3>{display.title}</h3>
        <p>{display.summary}</p>
        {app ? <p className="app-card-route"><b>{c.route}</b>{display.stops.slice(0,4).join(' → ')}</p> : <div className="chips">
          {trip.categories.map((c) => <span key={c}>{c}</span>)}
          <span>价格待公布</span><span>{trip.status==='标准路线'?'标准路线内容':'日期未开放'}</span>
        </div>}
        <Link
          className="text-link"
          to={`${app ? "/app/trips" : "/trips"}/${trip.slug}`}
        >
          {app?c.view:'查看路线'} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
