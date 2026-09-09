import type {PassengerLocale} from './passengerLocale';

export type LocalizedRouteSummary={name:string;region:string;duration:string;summary:string;stops:string[]};

const routes={
 'uji-nara-onsen':{
  'zh-CN':['奈良与宇治温泉','奈良与京都宇治','约 10–11 小时','从奈良鹿群走进宇治世界遗产与抹茶街区，以温泉放松收尾。',['奈良公园','宇治平等院','源氏物语博物馆','宇治源氏之汤']],
  'zh-TW':['奈良與宇治溫泉','奈良與京都宇治','約 10–11 小時','從奈良鹿群走進宇治世界遺產與抹茶街區，最後以溫泉放鬆身心。',['奈良公園','宇治平等院','源氏物語博物館','宇治源氏之湯']],
  ja:['奈良・宇治温泉','奈良・京都宇治','約10～11時間','奈良の鹿、宇治の世界遺産と抹茶の町を巡り、温泉で一日を締めくくります。',['奈良公園','宇治平等院','源氏物語ミュージアム','宇治源氏の湯']],
  en:['Nara, Uji & Onsen','Nara and Uji, Kyoto','10–11 hours','Meet Nara’s deer, explore Uji’s World Heritage and matcha streets, then unwind at an onsen.',['Nara Park','Byodoin Temple','The Tale of Genji Museum','Uji Genji-no-Yu']],
  es:['Nara, Uji y onsen','Nara y Uji, Kioto','10–11 horas','Conoce los ciervos de Nara, el patrimonio y el té matcha de Uji, y termina relajándote en un onsen.',['Parque de Nara','Templo Byodoin','Museo del Genji Monogatari','Uji Genji-no-Yu']],
  vi:['Nara, Uji & onsen','Nara và Uji, Kyoto','10–11 giờ','Gặp đàn hươu Nara, khám phá di sản và phố matcha Uji, rồi thư giãn tại onsen.',['Công viên Nara','Chùa Byodoin','Bảo tàng Truyện Genji','Uji Genji-no-Yu']],
  ko:['나라·우지 온천','나라와 교토 우지','약 10–11시간','나라 사슴, 우지 세계유산과 말차 거리를 둘러본 뒤 온천에서 휴식합니다.',['나라 공원','우지 뵤도인','겐지 이야기 박물관','우지 겐지노유']],
  ne:['नारा, उजी र ओन्सेन','नारा र उजी, क्योटो','१०–११ घण्टा','नाराका हिरण, उजीको विश्व सम्पदा र माचा गल्ली घुमेर ओन्सेनमा आराम गर्नुहोस्।',['नारा पार्क','ब्योदोइन मन्दिर','गेन्जी कथा संग्रहालय','उजी गेन्जी-नो-यु']],
 },
 'miyama-katsuoji-arashiyama':{
  'zh-CN':['胜尾寺、爱宕念佛寺与岚山','大阪北部与京都岚山','约 10–11 小时','从满寺达摩到千姿罗汉，再走进岚山竹林，发现关西寺院与自然景观的细节。',['胜尾寺','爱宕念佛寺','岚山竹林']],
  'zh-TW':['勝尾寺、愛宕念佛寺與嵐山','大阪北部與京都嵐山','約 10–11 小時','從滿寺達摩到千姿羅漢，再走進嵐山竹林，發現關西寺院與自然景觀的細節。',['勝尾寺','愛宕念佛寺','嵐山竹林']],
  ja:['勝尾寺・愛宕念仏寺・嵐山','大阪北部・京都嵐山','約10～11時間','だるまの勝尾寺、表情豊かな羅漢像、嵐山の竹林を巡り、寺院と自然の細部を楽しみます。',['勝尾寺','愛宕念仏寺','嵐山竹林']],
  en:['Katsuoji, Otagi Nenbutsuji & Arashiyama','Northern Osaka and Arashiyama, Kyoto','10–11 hours','Move from Katsuoji’s daruma to Otagi’s expressive rakan statues and the green light of Arashiyama’s bamboo grove.',['Katsuoji Temple','Otagi Nenbutsuji Temple','Arashiyama Bamboo Grove']],
  es:['Katsuoji, Otagi Nenbutsuji y Arashiyama','Norte de Osaka y Arashiyama, Kioto','10–11 horas','Descubre los darumas de Katsuoji, los expresivos rakan de Otagi y la luz verde del bambusal de Arashiyama.',['Templo Katsuoji','Templo Otagi Nenbutsuji','Bambusal de Arashiyama']],
  vi:['Katsuoji, Otagi Nenbutsuji & Arashiyama','Bắc Osaka và Arashiyama, Kyoto','10–11 giờ','Khám phá daruma ở Katsuoji, tượng rakan sinh động tại Otagi và ánh xanh của rừng tre Arashiyama.',['Chùa Katsuoji','Chùa Otagi Nenbutsuji','Rừng tre Arashiyama']],
  ko:['가쓰오지·오타기넨부쓰지·아라시야마','오사카 북부와 교토 아라시야마','약 10–11시간','가쓰오지의 다루마, 오타기의 표정 풍부한 나한상, 아라시야마 대나무숲을 하루에 만납니다.',['가쓰오지','오타기넨부쓰지','아라시야마 죽림']],
  ne:['कात्सुओजी, ओतागी नेम्बुत्सुजी र अराशियामा','उत्तरी ओसाका र क्योटो अराशियामा','१०–११ घण्टा','कात्सुओजीका दारुमा, ओतागीका भावपूर्ण मूर्ति र अराशियामाको बाँस वन हेर्नुहोस्।',['कात्सुओजी मन्दिर','ओतागी नेम्बुत्सुजी','अराशियामा बाँस वन']],
 },
 'arashiyama-train-hozugawa':{
  'zh-CN':['京都经典一日游','京都','约 9–10 小时','从金阁映水，到清水古街，再穿过千本鸟居，一天走遍记忆里最经典的京都画面。',['金阁寺','清水寺','二年坂·三年坂','伏见稻荷大社']],
  'zh-TW':['京都經典一日遊','京都','約 9–10 小時','從金閣映水，到清水古街，再穿過千本鳥居，一天走遍記憶裡最經典的京都畫面。',['金閣寺','清水寺','二年坂・三年坂','伏見稻荷大社']],
  ja:['京都定番一日ツアー','京都','約9～10時間','金閣の水鏡、清水の古い坂道、伏見稲荷の千本鳥居を一日で巡ります。',['金閣寺','清水寺','二年坂・三年坂','伏見稲荷大社']],
  en:['Classic Kyoto Day Tour','Kyoto','9–10 hours','See Kinkakuji reflected in the pond, walk the historic Kiyomizu lanes and finish beneath Fushimi Inari’s torii.',['Kinkakuji Temple','Kiyomizu-dera Temple','Ninenzaka & Sannenzaka','Fushimi Inari Taisha']],
  es:['Kioto clásico en un día','Kioto','9–10 horas','Contempla el reflejo de Kinkakuji, pasea por las calles de Kiyomizu y termina bajo los torii de Fushimi Inari.',['Templo Kinkakuji','Templo Kiyomizu-dera','Ninenzaka y Sannenzaka','Fushimi Inari Taisha']],
  vi:['Kyoto cổ điển trong ngày','Kyoto','9–10 giờ','Ngắm Kinkakuji phản chiếu trên hồ, dạo phố cổ Kiyomizu và kết thúc dưới cổng torii Fushimi Inari.',['Chùa Kinkakuji','Chùa Kiyomizu-dera','Ninenzaka & Sannenzaka','Fushimi Inari Taisha']],
  ko:['교토 클래식 당일 여행','교토','약 9–10시간','연못에 비친 금각사, 기요미즈 옛 거리, 후시미 이나리의 센본도리이를 하루에 둘러봅니다.',['금각사','기요미즈데라','니넨자카·산넨자카','후시미 이나리 신사']],
  ne:['क्योटो क्लासिक एकदिने यात्रा','क्योटो','९–१० घण्टा','पोखरीमा देखिने किन्काकुजी, कियोमिजुका पुराना गल्ली र फुशिमी इनारीका तोरी हेर्नुहोस्।',['किन्काकुजी','कियोमिजु-डेरा','निनेनजाका र सान्नेनजाका','फुशिमी इनारी']],
 },
 'sanzenin-kibune-arashiyama-autumn':{
  'zh-CN':['京都红叶三景','京都 · 大原、贵船、岚山','约 10–11 小时','在三千院看苔庭红叶、贵船看山谷秋色，再以岚山夕景收尾。',['大原三千院','贵船神社','岚山竹林与渡月桥']],
  'zh-TW':['京都紅葉三景','京都・大原、貴船、嵐山','約 10–11 小時','在三千院賞苔庭紅葉、貴船看山谷秋色，再以嵐山夕景收尾。',['大原三千院','貴船神社','嵐山竹林與渡月橋']],
  ja:['京都紅葉三景','京都・大原／貴船／嵐山','約10～11時間','三千院の苔庭と紅葉、貴船の渓谷美、夕暮れの嵐山を一日で巡る季節限定コースです。',['大原三千院','貴船神社','嵐山竹林・渡月橋']],
  en:['Kyoto Autumn: Sanzenin, Kibune & Arashiyama','Kyoto · Ohara, Kibune and Arashiyama','10–11 hours','See maple leaves over Sanzenin’s moss garden, Kibune’s valley and Arashiyama at dusk.',['Sanzenin Temple, Ohara','Kifune Shrine','Arashiyama Bamboo Grove & Togetsukyo']],
  es:['Otoño en Kioto: Sanzenin, Kibune y Arashiyama','Kioto · Ohara, Kibune y Arashiyama','10–11 horas','Contempla los arces sobre el musgo de Sanzenin, el valle de Kibune y Arashiyama al atardecer.',['Templo Sanzenin, Ohara','Santuario Kifune','Bambusal de Arashiyama y Togetsukyo']],
  vi:['Mùa thu Kyoto: Sanzenin, Kibune & Arashiyama','Kyoto · Ohara, Kibune và Arashiyama','10–11 giờ','Ngắm lá phong trên vườn rêu Sanzenin, thung lũng Kibune và Arashiyama lúc hoàng hôn.',['Chùa Sanzenin, Ohara','Đền Kifune','Rừng tre Arashiyama & cầu Togetsukyo']],
  ko:['교토 단풍 삼경','교토·오하라, 기부네, 아라시야마','약 10–11시간','산젠인의 이끼정원 단풍, 기부네 계곡과 해질녘 아라시야마를 하루에 둘러봅니다.',['오하라 산젠인','기후네 신사','아라시야마 죽림·도게쓰교']],
  ne:['क्योटो शरद दृश्य: सान्जेनइन, किबुने र अराशियामा','क्योटो · ओहारा, किबुने र अराशियामा','१०–११ घण्टा','सान्जेनइनको काइँयो बगैँचा, किबुने उपत्यका र साँझको अराशियामामा रातो पात हेर्नुहोस्।',['ओहारा सान्जेनइन','किफुने मन्दिर','अराशियामा बाँस वन र तोगेत्सुक्यो']],
 },
} as const;

export const expandedRouteSummary=(locale:PassengerLocale,slug:string):LocalizedRouteSummary|null=>{
 const row=routes[slug as keyof typeof routes]?.[locale];
 if(!row)return null;
 return {name:row[0],region:row[1],duration:row[2],summary:row[3],stops:[...row[4]]};
};

export const expandedRouteSlugs=Object.keys(routes);
