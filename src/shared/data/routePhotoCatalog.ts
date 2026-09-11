export type RoutePhotoAsset={url:string;creditUrl:string;creditLabel:string};

// The filenames come from the reviewed content pack. Undefined entries are
// intentional: a location without a confirmed image keeps the existing safe
// fallback instead of borrowing a photo from another attraction.
const photos:Record<string,RoutePhotoAsset>={
  '清水寺':{url:'/images/routes/kiyomizu/kiyomizu-01.webp',creditUrl:'https://commons.wikimedia.org/wiki/File:Japan_050416_Kiyomizu-dera_002.jpg',creditLabel:'Oren Rozen · CC BY-SA 4.0'},
  '伏见稻荷大社':{url:'/images/routes/fushimi/fushimi-01.webp',creditUrl:'https://commons.wikimedia.org/wiki/File:Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine,_Kyoto,_Japan.jpg',creditLabel:'Basile Morin · CC BY-SA 4.0'},
  '奈良公园':{url:'/images/routes/nara/nara-01.webp',creditUrl:'https://commons.wikimedia.org/wiki/File:Deer_in_Nara_Park.jpg',creditLabel:'Christophe95 · CC BY-SA 4.0'},
  '金阁寺':{url:'/images/routes/kinkaku/kinkaku-01.webp',creditUrl:'https://commons.wikimedia.org/wiki/File:Water_reflection_of_Kinkaku-ji_Temple_a_sunny_day,_Kyoto,_Japan.jpg',creditLabel:'Basile Morin · CC BY-SA 4.0'},
  '二年坂·三年坂':{url:'/images/routes/sannenzaka/sannenzaka-01.webp',creditUrl:'https://commons.wikimedia.org/wiki/File:Sannenzaka-kyoto.JPG',creditLabel:'Aporon999 · CC BY-SA 3.0'},
  '天桥立':{url:'/images/routes/amanohashidate/amanohashidate-01.webp',creditUrl:'https://commons.wikimedia.org/wiki/File:Amanohashidate_view_from_Mt_Moju02s3s4592.jpg',creditLabel:'663highland · CC BY 2.5'},
  '伊根舟屋':{url:'/images/routes/ine/ine-01.webp',creditUrl:'https://commons.wikimedia.org/wiki/File:Funaya_in_Ine_Town,_Yosa_District,_Kyoto_Prefecture_001.jpg',creditLabel:'Naokijp · CC BY-SA 4.0'},
  '神户港':{url:'/images/routes/kobe/kobe-01.webp',creditUrl:'https://commons.wikimedia.org/wiki/File:2022_Kobe_Meriken_Park_001.jpg',creditLabel:'Naokijp · CC BY-SA 4.0'},
  '北野异人馆街':{url:'/images/routes/kitano/kitano-01.webp',creditUrl:'https://commons.wikimedia.org/wiki/File:Kobe_kitano_thomas_house07_2816.jpg',creditLabel:'663highland · CC BY 2.5'},
  '有马温泉':{url:'/images/routes/arima/arima-01.webp',creditUrl:'https://commons.wikimedia.org/wiki/File:Arima_Onsen_Yumotozaka02s3872.jpg',creditLabel:'663highland · CC BY 2.5'},
  '贵船神社':{url:'/images/routes/kifune/kifune-autumn-01.jpg',creditUrl:'https://commons.wikimedia.org/wiki/File:Kifune-jinja_Shint%C3%B4_Shrine_-_First_torii_(Ichi-no-torii).jpg',creditLabel:'Yanajin33 · CC BY-SA 4.0'},
  '大原三千院':{url:'/images/routes/sanzenin/sanzenin-autumn-01.jpg',creditUrl:'https://commons.wikimedia.org/wiki/File:Fall_foliage_in_Sanzen-in.jpg',creditLabel:'Charlie fong · CC BY-SA 4.0'},
  '岚山·渡月桥':{url:'/images/routes/arashiyama-autumn/togetsukyo-autumn-01.jpg',creditUrl:'https://commons.wikimedia.org/wiki/File:Togetsukyo_20211123.jpg',creditLabel:'Suicasmo · CC BY-SA 4.0'},
};

export const routePhotoFor=(name:string)=>photos[name];

const routePhotoNames:Record<string,string[]>={
  'kyoto-nara-classic':['清水寺','伏见稻荷大社','奈良公园'],
  'amanohashidate-ine':['天桥立','','伊根舟屋'],
  'biwako-shirahige':['琵琶湖露台','白须神社','La Collina 近江八幡'],
  'wakayama-family':['猫咪主题铁路·车站','海鲜市场','白滨海岸','温泉时光'],
  'kobe-arima-rokko':['有马温泉','北野异人馆街','神户港','六甲山夜景'],
  'uji-nara-onsen':['奈良公园','平等院','宇治抹茶街','温泉'],
  'miyama-katsuoji-arashiyama':['胜尾寺','爱宕念佛寺','岚山竹林'],
  'arashiyama-train-hozugawa':['金阁寺','清水寺','二年坂·三年坂','伏见稻荷大社'],
  // The marketing detail page intentionally presents Sanzenin first.
  'sanzenin-kibune-arashiyama-autumn':['大原三千院','贵船神社','岚山·渡月桥'],
};

export const routePhotoAt=(slug:string,index:number)=>routePhotoFor(routePhotoNames[slug]?.[index]??'');
