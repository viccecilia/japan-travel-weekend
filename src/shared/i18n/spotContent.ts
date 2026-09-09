import type { PassengerLocale } from './passengerLocale';

export type RichSpot={name:string;location:string;intro:string;history:string;highlights:string[];tip:string};

const zh:RichSpot[]=[
 {name:'清水寺',location:'京都 · 东山',intro:'清水寺不只是一处拍摄京都全景的舞台。本堂、音羽山的林木、音羽瀑布与二年坂、三年坂共同组成一条完整的参拜与街区体验。',history:'寺院开创于778年，现存主要伽蓝多重建于1633年；1994年作为“古都京都的文化财”之一列入世界文化遗产。',highlights:['从本堂舞台同时观察悬造木结构、山林与京都市区','到音羽瀑布理解寺名、地形与观音信仰的联系','沿东山参道步行，感受寺院与古街自然相连'],tip:'坡道和台阶较多，建议穿防滑步行鞋，并为二年坂、三年坂预留慢行时间。'},
 {name:'伏见稻荷大社',location:'京都 · 伏见',intro:'千本鸟居只是入口。楼门、本殿、林间参道与山上的小型祭祀空间连成一条仍在使用的信仰之路。',history:'伏见稻荷是日本各地稻荷神社的总本宫。官方沿革将稻荷大神镇座稻荷山追溯到711年；历代祈愿与还愿奉纳的鸟居形成了今天的朱红景观。',highlights:['先在楼门和本殿参拜，再进入山路','观察一座座个人奉纳如何汇聚成连续的千本鸟居','越往山中越安静，可看见观光地之外的信仰空间'],tip:'时间有限可走到千本鸟居前段；继续登山前务必设定折返时间，并准备饮水。'},
 {name:'奈良公园',location:'奈良 · 奈良市',intro:'这里不是围起来的鹿园，而是草地、林地、寺社、博物馆与城市共同构成的广阔历史景观。',history:'奈良公园连接东大寺、兴福寺和春日大社等古都文化空间。园内鹿为国家天然纪念物，是生活在公共空间里的野生动物。',highlights:['在草地、寺社屋顶、若草山和鹿群之间看见奈良特有的开阔感','按体力连接东大寺、春日大社或浮云园地','把与鹿互动放进古都历史和自然环境中理解'],tip:'鹿可能顶撞、咬或踢人。请收好纸张与随身物品，看护儿童，并遵守现场鹿饼喂食规则。'},
];

const en:RichSpot[]=[
 {name:'Kiyomizu-dera Temple',location:'Kyoto · Higashiyama',intro:'Kiyomizu-dera is more than a panoramic stage. Its Main Hall, wooded Mount Otowa, waterfall and the lanes of Ninenzaka and Sannenzaka form one continuous temple-and-neighbourhood experience.',history:'Founded in 778, most principal buildings seen today date from the 1633 reconstruction. It joined UNESCO’s Historic Monuments of Ancient Kyoto inscription in 1994.',highlights:['Study the cliff-side timber structure before turning to the Kyoto panorama','Connect the temple’s name, landscape and Kannon worship at Otowa Waterfall','Walk the Higashiyama approach where temple grounds flow into historic streets'],tip:'Expect slopes and steps. Wear shoes with good grip and leave time to walk Ninenzaka and Sannenzaka slowly.'},
 {name:'Fushimi Inari Taisha',location:'Kyoto · Fushimi',intro:'The Senbon Torii are the entrance, not the whole story. Gate, main shrine, wooded paths and small sacred spaces form an active pilgrimage route across Mount Inari.',history:'Fushimi Inari is the head shrine of Inari shrines throughout Japan. Its official history traces the deity’s enshrinement on the mountain to 711; generations of donated torii created today’s vermilion landscape.',highlights:['Worship at the Romon Gate and main shrine before entering the mountain','Notice how individual offerings become one continuous tunnel of gates','See the atmosphere shift from busy landmark to sacred mountain farther uphill'],tip:'A short visit can cover the first gate tunnels. Set a firm turnaround time and carry water if continuing uphill.'},
 {name:'Nara Park',location:'Nara · Nara City',intro:'This is not an enclosed deer park but a broad historic landscape where lawns, woodland, temples, shrines, museums and the city meet.',history:'The park links the religious and urban memory of ancient Nara through Todaiji, Kofukuji and Kasuga Taisha. Its nationally protected deer are wild animals sharing public space.',highlights:['See lawns, sacred roofs, Mount Wakakusa and deer in one open landscape','Choose a walking line through Todaiji, Kasuga Taisha or Ukimido areas','Understand deer encounters as part of Nara’s history and natural setting'],tip:'Deer may charge, bite or kick. Secure bags and paper, supervise children and follow the official feeding guidance.'},
];

const compact=(language:'vi'|'ne'|'ko'|'ja'|'zh-TW'|'es'):RichSpot[]=>{
 const data={
  es:[['Templo Kiyomizu-dera','Kioto · Higashiyama','No es solo un mirador: el salón principal, el monte Otowa, la cascada y las calles Ninenzaka y Sannenzaka forman una experiencia continua.','Fundado en 778, sus edificios principales fueron reconstruidos en 1633 y forman parte del Patrimonio Mundial de la UNESCO desde 1994.','Observa la estructura de madera sobre la ladera|Relaciona el nombre del templo con la cascada Otowa|Recorre con calma Ninenzaka y Sannenzaka','Hay pendientes y escaleras; lleva calzado antideslizante.'],['Fushimi Inari Taisha','Kioto · Fushimi','Los miles de torii son solo la entrada; el santuario principal, los senderos del bosque y los pequeños altares forman una ruta de peregrinación viva.','Es el santuario principal de Inari en Japón y su tradición en la montaña se remonta al año 711.','Visita primero el santuario principal|Observa cómo las donaciones forman el túnel rojo|Descubre un ambiente más sereno al subir','Si continúas montaña arriba, fija una hora de regreso y lleva agua.'],['Parque de Nara','Nara · Ciudad de Nara','No es un recinto cerrado para ciervos, sino un amplio paisaje histórico de praderas, bosques, templos y museos.','Conecta Todaiji, Kofukuji y Kasuga Taisha; sus ciervos protegidos son animales salvajes.','Contempla el monte Wakakusa, los templos y los ciervos|Elige una ruta según tu condición física|Comprende a los ciervos dentro de la historia de Nara','Los ciervos pueden embestir, morder o patear; vigila a los niños y tus pertenencias.']],
  vi:[['Chùa Kiyomizu','Kyoto · Higashiyama','Không chỉ là sân ngắm cảnh: chính điện, núi Otowa, thác Otowa và các phố dốc cổ tạo thành một hành trình liền mạch.','Khởi dựng năm 778, phần lớn kiến trúc chính được tái thiết năm 1633 và được UNESCO ghi danh năm 1994.','Quan sát kết cấu gỗ trên sườn núi|Liên hệ tên chùa với thác Otowa|Đi chậm qua Ninenzaka và Sannenzaka','Có nhiều dốc và bậc thang; nên mang giày chống trượt.'],['Fushimi Inari Taisha','Kyoto · Fushimi','Senbon Torii chỉ là lối vào; đền chính, đường rừng và các điện thờ nhỏ hợp thành một tuyến hành hương đang được sử dụng.','Đây là tổng bản xã của các đền Inari tại Nhật; lịch sử thờ Inari trên núi được truy về năm 711.','Viếng chính điện trước khi lên núi|Xem từng cổng hiến tặng tạo thành đường hầm đỏ|Cảm nhận không gian tĩnh hơn khi lên cao','Nếu đi tiếp lên núi, hãy đặt giờ quay lại và mang theo nước.'],['Công viên Nara','Nara · Thành phố Nara','Không phải vườn hươu khép kín mà là cảnh quan lịch sử rộng lớn gồm bãi cỏ, rừng, đền chùa và bảo tàng.','Công viên nối Todaiji, Kofukuji và Kasuga Taisha; đàn hươu được bảo vệ là động vật hoang dã.','Ngắm núi Wakakusa, mái đền và đàn hươu|Chọn tuyến đi bộ phù hợp thể lực|Hiểu hươu trong bối cảnh lịch sử Nara','Hươu có thể húc, cắn hoặc đá; giữ đồ dùng cẩn thận và trông trẻ nhỏ.']],
  ne:[['कियोमिजु-डेरा','क्योटो · हिगाशियामा','यो दृश्य-मञ्च मात्र होइन; मुख्य हल, ओतोवा पहाड, झरना र पुराना गल्लीहरूले एउटै अनुभव बनाउँछन्।','सन् ७७८ मा स्थापना भएको मन्दिरका मुख्य भवनहरू १६३३ मा पुनर्निर्माण गरिए र १९९४ मा युनेस्को सूचीमा परे।','काठको संरचना र सहरको दृश्य हेर्नुहोस्|ओतोवा झरनाको कथा बुझ्नुहोस्|निनेनजाका र सान्नेनजाका हिँड्नुहोस्','उकालो र भर्‍याङ धेरै छन्; नचिप्लिने जुत्ता लगाउनुहोस्।'],['फुशिमी इनारी ताइशा','क्योटो · फुशिमी','सेनबोन तोरी प्रवेश मात्र हो; मुख्य मन्दिर, वनमार्ग र साना पूजास्थलले जीवित तीर्थमार्ग बनाउँछन्।','यो जापानभरका इनारी मन्दिरहरूको मुख्य मन्दिर हो; पहाडमा पूजा सन् ७११ देखि मानिन्छ।','पहिले मुख्य मन्दिरमा पूजा गर्नुहोस्|दान गरिएका तोरीको निरन्तर मार्ग हेर्नुहोस्|माथि जाँदा शान्त धार्मिक वातावरण महसुस गर्नुहोस्','माथि जाने भए फर्कने समय तय गर्नुहोस् र पानी बोक्नुहोस्।'],['नारा पार्क','नारा · नारा सहर','यो घेरिएको हिरण पार्क होइन; घाँसेमैदान, वन, मन्दिर र संग्रहालय जोडिएको विशाल ऐतिहासिक भू-दृश्य हो।','पार्कले तोदाइजी, कोफुकुजी र कासुगा ताइशालाई जोड्छ; संरक्षित हिरण जंगली जनावर हुन्।','खुला मैदान र वाकाकुसा पहाड हेर्नुहोस्|शक्तिअनुसार हिँड्ने बाटो छान्नुहोस्|प्रकृति र इतिहाससँगै हिरण बुझ्नुहोस्','हिरणले ठेल्न, टोक्न वा लात हान्न सक्छ; बच्चा र सामानको ध्यान राख्नुहोस्।']],
  ko:[['기요미즈데라','교토 · 히가시야마','전망 무대만이 아니라 본당, 오토와산 숲, 폭포와 니넨자카·산넨자카가 하나의 참배 경험을 이룹니다.','778년에 창건되었고 주요 건물은 1633년에 재건되었으며 1994년 유네스코 세계유산에 등재되었습니다.','절벽 위 목조 구조와 교토 전망|오토와 폭포의 지형과 신앙|히가시야마 옛 거리 산책','경사와 계단이 많으니 미끄럼 방지 신발을 권합니다.'],['후시미 이나리 타이샤','교토 · 후시미','센본도리이는 시작입니다. 누문, 본전, 숲길과 작은 제단이 이나리산의 살아 있는 순례길을 이룹니다.','일본 이나리 신사의 총본궁으로, 공식 연혁은 711년의 진좌로 거슬러 올라갑니다.','본전 참배 후 산길 시작|개별 봉납이 만든 붉은 도리이 터널|위로 갈수록 깊어지는 신앙 공간','등산을 계속한다면 반환 시간을 정하고 물을 준비하세요.'],['나라 공원','나라 · 나라시','울타리 안 사슴원이 아니라 잔디, 숲, 사찰과 박물관이 이어지는 넓은 역사 경관입니다.','도다이지, 고후쿠지, 가스가타이샤를 연결하며 보호받는 사슴은 야생동물입니다.','와카쿠사산과 사찰 지붕, 사슴이 어우러진 풍경|체력에 맞춘 도보 동선|역사와 자연 속 사슴 이해','사슴이 들이받거나 물 수 있으니 어린이와 소지품을 잘 살펴주세요.']],
  ja:[['清水寺','京都・東山','舞台からの眺望だけでなく、本堂、音羽山、音羽の滝、二年坂・三年坂までが一続きの参拝体験です。','778年創建。主要伽藍は1633年に再建され、1994年に世界文化遺産へ登録されました。','懸造の木造建築と京都市街|音羽の滝と寺名・信仰のつながり|東山の歴史的な坂道散策','坂と階段が多いため、滑りにくい靴がおすすめです。'],['伏見稲荷大社','京都・伏見','千本鳥居は入口にすぎません。楼門、本殿、森の参道と小さな祠が、今も生きる巡拝路を形づくります。','全国の稲荷神社の総本宮で、稲荷大神の鎮座は711年にさかのぼると伝わります。','本殿参拝から山道へ|奉納鳥居がつくる連続景観|奥へ進むほど深まる信仰の空気','登る場合は折り返し時刻を決め、水分を用意してください。'],['奈良公園','奈良・奈良市','囲われた鹿園ではなく、芝地、森、社寺、博物館と町が重なる広大な歴史景観です。','東大寺、興福寺、春日大社を結び、天然記念物の鹿は公共空間で暮らす野生動物です。','若草山・社寺の屋根・鹿の開放景観|体力に合わせた散策ルート|古都の歴史と自然の中で鹿を理解','鹿は突進、噛みつき、蹴りをする場合があります。子どもと荷物に注意してください。']],
  'zh-TW':[['清水寺','京都・東山','不只是眺望京都的舞台；本堂、音羽山、音羽瀑布與二年坂、三年坂共同構成完整體驗。','寺院創建於778年，主要伽藍多於1633年重建，1994年列入世界文化遺產。','觀察懸造木結構與京都景觀|理解音羽瀑布與寺名的關係|慢行二年坂、三年坂','坡道和階梯較多，建議穿防滑步行鞋。'],['伏見稻荷大社','京都・伏見','千本鳥居只是入口；樓門、本殿、林間參道與小型祭祀空間組成仍在使用的巡拜路。','這裡是日本各地稻荷神社的總本宮，稻荷大神鎮座稻荷山可追溯至711年。','先參拜本殿再進入山路|看奉納鳥居形成連續景觀|越往山中越能感受信仰空間','繼續登山前請設定折返時間並準備飲水。'],['奈良公園','奈良・奈良市','不是封閉鹿園，而是草地、林地、寺社、博物館與城市共同構成的歷史景觀。','公園連接東大寺、興福寺與春日大社；受保護的鹿是野生動物。','若草山、寺社屋頂與鹿群同框|依體力選擇步行路線|從歷史與自然理解鹿群','鹿可能衝撞、咬或踢人，請看護兒童並收好隨身物品。']],
 }[language] as string[][];
 return data.map(([name,location,intro,history,points,tip])=>({name,location,intro,history,highlights:points.split('|'),tip}));
};

export const kyotoNaraSpots:Record<PassengerLocale,RichSpot[]>={'zh-CN':zh,'zh-TW':compact('zh-TW'),ja:compact('ja'),en,es:compact('es'),vi:compact('vi'),ne:compact('ne'),ko:compact('ko')};

const amanohashidateIneZh:RichSpot[]=[
 {name:'天桥立',location:'京都府 · 宫津市',intro:'一条覆满松林的沙洲横卧宫津湾，海、松、天空在步行与登高之间不断变换。与其只拍一张“日本三景”，更适合留时间从高处看全景，再走进沙洲感受海风。',history:'天桥立自古就是和歌、绘画与参拜文化中的名胜。约3.6公里的沙洲由海流长期堆积形成，沿线生长着数千株松树。',highlights:['登上观景处看“飞龙观”或“升龙观”的完整构图','沿松林步道散步，近距离感受两侧海湾','把观景、午餐和智恩寺安排成从容的一段自由时间'],tip:'观景缆车、单轨车或游船通常需自费；请选择一种主体验，避免在交通排队上耗尽自由时间。'},
 {name:'智恩寺文殊堂',location:'京都府 · 宫津市',intro:'从天桥立入口步行即可抵达的古寺，让海岸风景多了一层参拜与街区体验。山门、文殊堂与周边小店适合在登高或走沙洲前后慢慢游览。',history:'智恩寺以文殊菩萨信仰闻名，与天桥立共同形成当地延续至今的参拜景观。',highlights:['从庄重山门进入文殊堂参拜','留意扇形签与寺院细节','把寺院、回旋桥和海边街区串成短距离步行线'],tip:'寺院是宗教场所，请降低音量；回旋桥开启时注意现场人员引导。'},
 {name:'伊根舟屋',location:'京都府 · 伊根町',intro:'房屋一层临海停船、二层生活，舟屋沿安静海湾排成独特聚落。这里的魅力不在“打卡一栋房”，而在从街巷、海面与高处理解人与海共同生活的方式。',history:'伊根湾因地形避风，舟屋聚落长期服务于当地渔业与生活。现存景观仍是居民真实生活空间，不是封闭式景区。',highlights:['沿海湾步行观察舟屋与水面的关系','从观景点看舟屋围绕海湾展开的全貌','可按班次选择游船或短距离骑行，换一个角度看聚落'],tip:'请勿进入私人住宅、码头或狭窄院落拍照；航班、租车与商店营业会受天气和日期影响。'},
];

const kobeArimaRokkoZh:RichSpot[]=[
 {name:'有马温泉',location:'神户 · 北区',intro:'日本代表性的古温泉街之一。金泉、银泉、坡道小巷、蒸汽与小店让这里既适合入浴，也适合不泡温泉的游客散步和品尝当地小吃。',history:'有马温泉在日本古代文献中已有记载，长期受到皇室、僧侣与旅人的喜爱。含铁的金泉与无色透明的银泉是当地最鲜明的特色。',highlights:['在坡道老街寻找金泉泉源与传统建筑','按兴趣选择公共浴场、足汤或街边小吃','从午后温泉街自然过渡到神户城市夜景'],tip:'入浴费、毛巾及个别设施通常自理；有纹身、儿童同行或身体状况顾虑时，请提前确认浴场规则。'},
 {name:'北野异人馆街',location:'神户 · 中央区',intro:'开港后外国人生活留下的洋馆街区，坡道、砖墙与不同建筑风格让神户呈现出区别于京都和大阪的城市气质。',history:'神户港开港后，外国居民在北野一带建造住宅。保存下来的异人馆记录了城市与海外交流的近代历史。',highlights:['沿北野坂步行观察洋馆外观与城市坡地','选择一至两座最感兴趣的馆舍入内参观','在高处回望神户市区与港湾方向'],tip:'街区坡度较大，部分馆舍单独收费；短暂停留时不建议购买过多联票。'},
 {name:'神户港与马赛克摩天轮',location:'神户 · Harborland',intro:'海边步道把港塔、船舶、仓库建筑、商场与摩天轮放进同一幅港都景观。日落前后光线变化最丰富，也适合安排晚餐或短暂休息。',history:'神户港自1868年开港后发展为日本重要国际港口，今天的滨水区保留了港口记忆，也成为城市公共生活空间。',highlights:['沿海边步道寻找神户港经典天际线','在蓝调时刻拍摄灯光与水面倒影','利用自由时间用餐、购物或乘坐摩天轮'],tip:'周末餐厅可能排队；若计划乘摩天轮或看日落，请先确认集合时间再安排活动。'},
 {name:'六甲山夜景',location:'神户 · 六甲山',intro:'从山上俯瞰神户、大阪湾与远处城市灯火，是整条线路的收尾高潮。晴朗时能看到港湾、道路和城区形成富有层次的夜景。',history:'六甲山观景地因面向阪神城市带而闻名，“千万美元夜景”的称呼来自广阔城市灯光带来的视觉规模。',highlights:['在天色由蓝转黑时观察城市逐渐亮起','辨认神户港、大阪湾与城区道路的层次','用广角画面记录山体、港湾与灯火的关系'],tip:'山上明显比市区冷，风也更强；夜景能见度受云雾和天气影响，请准备外套并以安全为先。'},
];

const biwakoShirahigeZh:RichSpot[]=[
 {name:'白须神社',location:'滋贺 · 高岛市',intro:'朱红鸟居立在琵琶湖水面上，远处湖面、山影与天空共同形成极简而开阔的画面。清晨或天气通透时，水色与光线的层次尤其漂亮。',history:'白须神社以延年长寿、结缘与旅途平安的信仰闻名，是近江地区历史悠久的神社之一。湖中鸟居也成为琵琶湖西岸最具代表性的景观。',highlights:['从安全观景区域欣赏湖中鸟居与山水构图','观察天气、波光和云层带来的不同湖色','把神社参拜与琵琶湖沿岸风景放在一起体验'],tip:'神社与湖岸之间有车流量较大的道路，严禁横穿马路或站在车道拍照，请只在指定安全区域观景。'},
 {name:'琵琶湖山谷观景台',location:'滋贺 · 琵琶湖Valley',intro:'乘索道快速登上海拔千米以上的山地，从高处俯瞰日本最大湖泊。晴天时湖岸线、群山和城市像地图一样铺开，能直观看见琵琶湖的规模。',history:'这里原为山地滑雪区域，后来发展出面向四季游客的观景设施。自然地形和高差让同一地点在新绿、盛夏、红叶和雪季呈现完全不同的景色。',highlights:['从高处寻找琵琶湖完整湖岸线','在露台拍摄天空、水面与山脊的层次','按季节体验高山花草、红叶或雪景'],tip:'索道可能因强风、雷雨或检修停运，山顶温度通常低于市区；请带防风外套，并以当日运营通知为准。'},
 {name:'La Collina近江八幡',location:'滋贺 · 近江八幡',intro:'起伏草屋顶仿佛从田野中生长出来，建筑、庭院、甜点工房与季节植物融为一体。即使不购物，也值得沿园区观察空间和自然如何连接。',history:'La Collina由滋贺和菓子品牌Taneya打造，建筑设计强调当地土地、农业与手工制作之间的关系，已成为近江八幡的新地标。',highlights:['拍摄草屋顶随季节变化的色彩与质感','透过工房观察年轮蛋糕等甜点制作','在田园式园区中寻找建筑细节和限定商品'],tip:'热门甜点和咖啡区域可能排队，请先确认集合时间；草屋顶不可攀爬，雨天步道可能湿滑。'},
];

const wakayamaFamilyZh:RichSpot[]=[
 {name:'贵志站与特色电车',location:'和歌山 · 纪之川市',intro:'小巧车站因猫站长而闻名，车站建筑、主题电车和沿途田园把普通乘车变成轻松有趣的地方体验，尤其适合亲子游客。',history:'和歌山电铁通过猫站长和主题列车为地方铁路注入活力，贵志站也因此成为铁路与社区共同创造的旅行目的地。',highlights:['参观猫脸造型的贵志站建筑','体验草莓、电车玩具等主题列车设计','从车窗欣赏和歌山乡间与小站风景'],tip:'猫站长有休息日，主题列车也按班次运行，不能保证当天见到指定猫咪或车型，请以官方时刻表为准。'},
 {name:'Toretore市场与温泉',location:'和歌山 · 白滨町',intro:'海鲜市场、餐饮、购物和温泉集中在同一区域，可以按自己的节奏选择现烤海鲜、当地伴手礼或泡汤休息，是行程中最自由的一段。',history:'Toretore市场依托纪州海产和白滨温泉旅游发展，汇集鲜鱼、水产加工品与当地特产，呈现南纪地区鲜明的饮食文化。',highlights:['挑选当地海鲜并现场用餐','比较梅干、柑橘和海产等纪州特产','有时间可自费体验温泉，让长途乘车更放松'],tip:'餐厅在午餐时段容易排队；入浴、毛巾和餐食通常自费，泡温泉前请确认纹身及儿童入浴规则。'},
 {name:'千叠敷',location:'和歌山 · 南纪白滨',intro:'层层砂岩台地伸向太平洋，海风、浪声与宽阔水平线构成白滨最有力量感的海岸风景。夕阳较低时，岩层纹理会更加明显。',history:'柔软砂岩经长期海浪侵蚀，形成像铺叠榻榻米般的阶梯状地貌，“千叠敷”之名正来自这种视觉印象。',highlights:['从高处拍摄岩层通向大海的纵深','观察海浪留下的侵蚀纹理','在安全区域感受太平洋开阔视野'],tip:'临海岩面湿滑且阵风强，请勿靠近浪线或悬崖边缘；恶劣天气应缩短停留并听从现场指引。'},
 {name:'三段壁',location:'和歌山 · 南纪白滨',intro:'高耸断崖直面太平洋，海浪在崖下不断撞击，是与千叠敷气质不同的壮阔海岸。可从展望处俯瞰，也可自费进入洞窟了解海蚀地貌。',history:'三段壁由海浪长期侵蚀形成，地下洞窟还留有与熊野水军传说相关的展示，使自然景观多了一层地方故事。',highlights:['从展望台感受断崖与海面的巨大高差','观察海浪、岩壁和洞窟的地质关系','把自然景观与熊野水军传说结合起来理解'],tip:'请始终停留在护栏内；洞窟需另购票，遇强风、大浪或设施停运时以现场安排为准。'},
];

const ujiNaraOnsenZh:RichSpot[]=[
 {name:'奈良公园',location:'奈良 · 奈良市',intro:'鹿群、草地、若草山与古寺屋顶共同组成奈良独有的城市风景。这里不只是喂鹿，更适合沿公园慢行，感受古都、自然和日常生活交织。',history:'奈良公园连接东大寺、兴福寺与春日大社等重要文化空间，园内鹿为受保护的野生动物，也是奈良信仰与城市记忆的一部分。',highlights:['在开阔草地拍摄鹿群与若草山','按时间选择东大寺或浮云园地散步','学习正确喂食方式，观察鹿群自然行为'],tip:'鹿可能顶撞、咬或踢人，请收好纸袋和地图，看护儿童，并只使用官方鹿饼喂食。'},
 {name:'平等院凤凰堂',location:'京都 · 宇治市',intro:'凤凰堂倒映在阿字池中，是日本人熟悉的十日元硬币图案。红白建筑、池水和庭园相互呼应，晴雨与四季都会呈现不同气氛。',history:'平等院由藤原赖通于1052年改建为寺院，凤凰堂建于1053年，保存了平安时代净土信仰、建筑与佛教艺术的重要遗产。',highlights:['寻找十日元硬币上的凤凰堂构图','从池畔不同角度观察倒影与屋顶凤凰','参观凤翔馆了解佛像、云中供养菩萨与寺院历史'],tip:'凤凰堂内部参观名额和时间有限，可能需另行排队购票；请优先保证庭园与集合时间。'},
 {name:'宇治抹茶街区与源氏物语博物馆',location:'京都 · 宇治市',intro:'宇治桥两岸把茶香、古寺、河景与《源氏物语》宇治十帖串在一起。可以一边品尝抹茶甜点，一边理解这座城市不止是“买茶”的文化层次。',history:'宇治自古是连接京都与奈良的交通节点，并以优质茶闻名。《源氏物语》最后十帖以宇治为舞台，为当地留下深厚文学印记。',highlights:['沿宇治川与宇治桥寻找文学场景','比较传统抹茶、甜点和现代茶饮','在博物馆通过模型与影像了解宇治十帖'],tip:'热门茶店常需排队；博物馆休馆日和入馆时间可能变化，请不要为单一店铺错过集合。'},
 {name:'宇治源氏之汤',location:'京都 · 宇治市',intro:'在一天步行后用温泉收尾，让古都参观、茶文化与身体放松形成完整节奏。不入浴的游客也可按班次安排在周边休息。',history:'日本公共浴场讲究先洗净身体再入池，并重视安静共享空间。了解这些礼仪，本身也是接近日常日本生活的体验。',highlights:['以温泉舒缓奈良与宇治的步行疲劳','体验日本公共浴场的入浴礼仪','为返程前留出安静休息时间'],tip:'入浴费及毛巾通常自理；纹身、疾病、饮酒后入浴及儿童同行规则请提前确认，身体不适时不要勉强。'},
];

const miyamaKatsuojiZh:RichSpot[]=[
 {name:'美山茅葺之里',location:'京都 · 南丹市美山町',intro:'茅葺民居沿山脚与稻田展开，四季里的炊烟、花木和生活痕迹让这里不像布景，而是一座仍在呼吸的山村。慢走比匆忙打卡更能发现细节。',history:'北村保存了数量集中的传统茅葺屋，居民持续维护屋顶、农业与社区生活，被列为重要传统建筑物群保存地区。',highlights:['从观景位置看茅屋、田野与群山的整体关系','沿村道寻找水沟、神社和生活细节','按季节欣赏新绿、秋色或雪景下的茅葺屋'],tip:'这里是居民生活区，请勿进入私人院落或以镜头贴近住户；冬季路面可能结冰，商店营业也会随日期变化。'},
 {name:'岚山竹林与渡月桥',location:'京都 · 岚山',intro:'竹林的竖向光影、渡月桥的河谷视野和嵯峨野街区组成多个层次。把时间分给竹林、河岸与小巷，才能看见岚山不只有一条拥挤的拍照路。',history:'岚山自平安时代便是贵族赏景之地，渡月桥与桂川延续着古都郊游文化；竹林则来自嵯峨野长期形成的竹业景观。',highlights:['在竹林仰拍竹梢与光影','从渡月桥观察桂川和山色','避开主街，在河岸或嵯峨野小路感受安静一面'],tip:'午后人流较大，请先规划最想看的区域；不要触碰或刻画竹子，并为返回集合点预留步行时间。'},
 {name:'胜尾寺',location:'大阪 · 箕面市',intro:'大小达摩分布在山门、台阶、庭园与寺院角落，形成鲜明而富有故事性的景观。它们并非装饰，而是人们许愿、努力与还愿的记录。',history:'胜尾寺拥有千年以上历史，以“胜运”信仰闻名。参拜者写下愿望带走达摩，愿望实现后再送回寺院，由此累积出今天独特的达摩景观。',highlights:['理解达摩从许愿到还愿的完整含义','在山门、池塘和台阶寻找不同构图','秋季欣赏红叶与朱红寺院、达摩同框'],tip:'寺内有坡道和台阶，雨天注意防滑；请勿移动已奉纳的达摩，购票与闭门时间以当日公告为准。'},
];

const hozugawaZh:RichSpot[]=[
 {name:'嵯峨野观光小火车',location:'京都 · 嵯峨野至龟冈',intro:'复古列车贴着保津峡缓慢前行，隧道、铁桥、河流与山壁不断切换。比起单纯交通，它更像一段会移动的观景台。',history:'观光列车利用山阴本线旧线运行，沿保津川峡谷保留了铁路工程与自然景观相互交织的独特视角。',highlights:['从车窗捕捉河流、铁桥与峡谷转弯','按季节欣赏樱花、新绿、红叶或雪景','观察列车与保津川游船在不同高度交会'],tip:'指定席在旺季很快售罄，开放式车厢也可能因天气关闭；请保管好车票并按集合安排乘车。'},
 {name:'保津川游船',location:'京都 · 龟冈至岚山',intro:'由船工以长篙和船桨操控木船，顺着约16公里河道穿越峡谷。水流平缓与激流交替，让风景不只是“看见”，而是从水面亲身经过。',history:'保津川水运过去用于把木材和物资运往京都，现代游船延续了传统操舟技术，也让旅客从河面理解峡谷地形。',highlights:['近距离观察岩壁、河滩和四季山林','体验船工协作通过水流变化','从水面抵达岚山，形成有故事的移动路线'],tip:'运行受水位、强风和天气影响，可能停航或改用替代交通；请遵守救生衣和座位要求，贵重物品注意防水。'},
 {name:'岚山竹林与渡月桥',location:'京都 · 岚山',intro:'游船抵达后，峡谷的动态体验转为岚山的自由散步。河岸、渡月桥、竹林和寺院可按兴趣组合，形成由水到陆地的完整收尾。',history:'岚山自古是京都代表性的郊游与赏景地，桂川、渡月桥及嵯峨野寺院共同构成延续至今的文化景观。',highlights:['从渡月桥回望刚刚经过的山谷方向','在竹林体验高耸竹梢形成的光影','按时间选择寺院、河岸或商店街自由游览'],tip:'请根据返程集合点倒推步行时间；旺季道路拥挤，若游船晚到，应优先保留必要休息和集合时间。'},
];

const kyotoAutumnZh:RichSpot[]=[
 {name:'大原三千院',location:'京都 · 大原',intro:'苔庭像柔软绿毯铺在杉木与枫树之间，小小的童地藏藏在青苔中。红叶季里绿色、金色和深红叠在一起，气氛安静而细腻。',history:'三千院是天台宗门迹寺院，历经迁移后落脚大原。往生极乐院、庭园和山里环境共同塑造了区别于京都市中心的清幽气质。',highlights:['在有清园寻找苔庭中的童地藏','观察往生极乐院与杉木、枫叶的层次','沿大原参道感受山村秋色与小店'],tip:'石阶和苔边在雨后湿滑；红叶颜色受气温影响，无法保证固定日期达到最盛状态。'},
 {name:'贵船神社',location:'京都 · 贵船',intro:'朱红灯笼沿石阶向杉林深处延伸，贵船川的水声让山间参拜更有沉浸感。秋季树色、灯笼和石阶很适合纵深构图。',history:'贵船神社以水神信仰闻名，长期守护京都水源，也与祈雨、止雨和结缘文化相连。山谷地形使这里比市区更早感到凉意。',highlights:['从石阶下方拍摄灯笼形成的引导线','了解水占卜与水神信仰','沿贵船川观察山谷、料理床与季节景色'],tip:'道路狭窄且旺季有交通管制，停靠点可能调整；台阶较多，傍晚降温快，请穿防滑鞋并准备外套。'},
 {name:'岚山竹林与渡月桥',location:'京都 · 岚山',intro:'傍晚的岚山把竹林、桂川和山体秋色放进同一段自由时间。夕光落在渡月桥与河面时，景色会从热闹逐渐转为柔和。',history:'岚山自平安时代就是赏樱与观枫名所，渡月桥得名于古人观看月亮仿佛渡桥而过的意象，至今仍是京都季节旅行的代表。',highlights:['在渡月桥两侧寻找山色与河面倒影','进入竹林看绿色竹竿与红叶形成对比','沿河岸等候光线由午后转向黄昏'],tip:'秋季日落早、温差大且人流密集，请把返程集合放在第一优先，不要为了拍照停留在车道或阻塞通行。'},
];

const kyotoClassicZh:RichSpot[]=[
 {name:'金阁寺',location:'京都 · 北区',intro:'金色楼阁临池而立，天气平静时，建筑与倒影在镜湖池中组成一幅完整画面。沿池畔慢慢移动，金色、松树与庭园石景会不断变换层次。',history:'金阁寺正式名为鹿苑寺。现存舍利殿在1955年重建，其庭园延续了室町时代的审美，也是京都世界文化遗产组成部分。',highlights:['从镜湖池正面欣赏楼阁与完整倒影','沿回游路线观察不同角度的金色外观','留意庭园中的松树、岛石与借景关系'],tip:'热门时段人流密集，请跟随单向参观路线，避免堵塞通道。'},
 {name:'清水寺',location:'京都 · 东山',intro:'清水舞台、本堂、音羽山与远处城市共同展开。这里不只适合拍全景，也适合沿参拜路线看木结构、山林与京都街区如何相连。',history:'寺院开创于778年，现存主要伽蓝多重建于1633年；1994年作为“古都京都的文化财”之一列入世界文化遗产。',highlights:['观察悬造木结构、山林与京都市区','到音羽瀑布理解寺名与信仰的联系','从寺院自然衔接东山历史街区'],tip:'坡道和台阶较多，建议穿防滑步行鞋，并为东山古街预留充足慢行时间。'},
 {name:'二年坂·三年坂',location:'京都 · 东山',intro:'石板坡道、木格窗和店铺门帘，把寺院参拜延伸成一段有生活气息的古街散步。放慢脚步，建筑细节与街角风景往往比匆忙打卡更值得记住。',history:'这片坂道连接清水寺与东山传统街区，保存了京都代表性的历史景观，也持续承载商铺、住居与参拜动线。',highlights:['从坡道高低差寻找町家屋檐的层次','按兴趣挑选点心、工艺品与伴手礼','留意支路与转角中的安静街景'],tip:'石板路雨后较滑；请勿站在道路中央拍摄，也不要进入私人住宅范围。'},
 {name:'伏见稻荷大社',location:'京都 · 伏见',intro:'千本鸟居只是入口。楼门、本殿、林间参道与山上的小型祭祀空间连成一条仍在使用的信仰之路。',history:'伏见稻荷是日本各地稻荷神社的总本宫，官方沿革将稻荷大神镇座稻荷山追溯到711年。历代奉纳的鸟居形成了今天的朱红景观。',highlights:['先在楼门和本殿参拜，再进入山路','观察个人奉纳如何汇聚成连续鸟居长廊','越往山中越能感受安静的信仰空间'],tip:'时间有限可走千本鸟居前段；继续登山前请设定折返时间并准备饮水。'},
];

const katsuojiOtogiArashiyamaZh:RichSpot[]=[
 {name:'胜尾寺',location:'大阪府 · 箕面市',intro:'红色达摩散落在寺院庭园、石阶与屋檐之间。寻找它们的过程本身就是乐趣，也让参拜多了一份为目标重新出发的仪式感。',history:'胜尾寺以“胜运”信仰闻名，达摩承载着祈愿与还愿。这里的“胜”更接近战胜自己的软弱、坚持完成心中目标。',highlights:['在庭园与参道寻找大小不同的达摩','了解许愿与达成后还愿的文化','从寺院高处欣赏北摄山间景色'],tip:'寺院范围较大且有台阶；达摩为奉纳物，请勿移动。'},
 {name:'爱宕念佛寺',location:'京都 · 嵯峨鸟居本',intro:'山坡上排列着上千尊罗汉石像：有人微笑，有人合掌，也有让人忍不住多看一眼的幽默表情。苔藓、树影和石像共同营造出安静而亲切的寺院空间。',history:'寺院在近现代迁至现址后，由参拜者亲手雕刻并奉纳罗汉像，逐渐形成今天独一无二的千二百罗汉景观。',highlights:['寻找最有缘分或最像同行人的表情','观察石像、苔藓与季节植物的细节','感受区别于热门寺院的山间安静'],tip:'这里仍是宗教场所，请勿触摸或攀爬石像；雨后石阶容易湿滑。'},
 {name:'岚山竹林',location:'京都 · 嵯峨野',intro:'走进竹林小径，两侧竹子笔直向上，日光从叶间透下。抬头看风吹竹叶，也可以让同行人走在前方，用人物比例表现竹林的高度。',history:'嵯峨野自平安时代就是贵族别业与寺院集中的郊游地，竹林与周边寺院、河岸共同构成岚山代表性文化景观。',highlights:['在竹林纵深中观察光影变化','把竹林与附近寺院、河岸组合游览','避开人流停顿，边走边发现不同构图'],tip:'请勿进入竹林、倚靠竹竿或长时间占据通道拍摄。'},
];

export const featuredRouteSpots:Partial<Record<string,Partial<Record<PassengerLocale,RichSpot[]>>>>={
 'kyoto-nara-classic':kyotoNaraSpots,
 'amanohashidate-ine':{'zh-CN':amanohashidateIneZh},
 'biwako-shirahige':{'zh-CN':biwakoShirahigeZh},
 'wakayama-family':{'zh-CN':wakayamaFamilyZh},
 'kobe-arima-rokko':{'zh-CN':kobeArimaRokkoZh},
 'uji-nara-onsen':{'zh-CN':ujiNaraOnsenZh},
 'miyama-katsuoji-arashiyama':{'zh-CN':katsuojiOtogiArashiyamaZh},
 'arashiyama-train-hozugawa':{'zh-CN':kyotoClassicZh},
 'sanzenin-kibune-arashiyama-autumn':{'zh-CN':kyotoAutumnZh},
};

export const featuredRoutePitch:Partial<Record<string,Partial<Record<PassengerLocale,{lead:string;fit:string[]}>>>>={
 'kyoto-nara-classic':{'zh-CN':{lead:'一天收进京都古寺、千本鸟居与奈良鹿群：第一次到关西，也能轻松看懂两座古都最有代表性的风景。',fit:['初次到访关西','喜欢寺社与古街','可接受中等步行']}},
 'amanohashidate-ine':{'zh-CN':{lead:'从日本三景的松林沙洲走到伊根海边舟屋，一天看见“海之京都”开阔、安静而不同于古都的另一面。',fit:['喜欢海景与摄影','想避开城市人潮','可接受较长车程']}},
 'biwako-shirahige':{'zh-CN':{lead:'从湖中鸟居到千米高空俯瞰日本最大湖泊，再走进草屋顶与甜点香气交织的自然建筑，一天收藏滋贺最有反差的三种风景。',fit:['喜欢湖景与开阔视野','爱建筑与摄影','能适应山顶温差']}},
 'wakayama-family':{'zh-CN':{lead:'猫站长和主题电车带来轻松开场，午后用海鲜、温泉与太平洋断崖把可爱和壮阔装进同一天。',fit:['亲子或铁路爱好者','喜欢海鲜与温泉','希望步调轻松']}},
 'kobe-arima-rokko':{'zh-CN':{lead:'午后逛温泉古街与港都洋馆，日落后登六甲山看万家灯火，一条线路体验神户从白天到夜晚的层次。',fit:['喜欢温泉与城市夜景','适合朋友或情侣','可接受较晚返回']}},
 'uji-nara-onsen':{'zh-CN':{lead:'先在奈良与鹿群相遇，再到宇治读懂凤凰堂、抹茶与《源氏物语》，最后用温泉卸下一天的步行疲劳。',fit:['喜欢古都与抹茶','想兼顾文化和放松','可接受中等步行']}},
 'miyama-katsuoji-arashiyama':{'zh-CN':{lead:'红色达摩、表情各异的罗汉与向上生长的竹林，这条路线的乐趣藏在值得仔细看的细节里。',fit:['喜欢寺院与摄影','想看不一样的京都','可接受中等步行']}},
 'arashiyama-train-hozugawa':{'zh-CN':{lead:'从金阁映水，到清水古街，再穿过千本鸟居，一天走遍记忆里最经典的京都画面。',fit:['第一次到京都','喜欢古寺与古街','可接受中等步行']}},
 'sanzenin-kibune-arashiyama-autumn':{'zh-CN':{lead:'苔庭红叶、山谷灯笼与渡月桥夕景，从安静的大原一路走向岚山，把京都秋天最不同的三种气质收进一天。',fit:['红叶与摄影爱好者','喜欢寺院山景','可接受台阶与降温']}},
};
