import type {Category,Trip} from '../types';
import {cancellationPolicy} from '../config/legalOperations';
const common={meetingPoint:null,departureTime:null,returnTime:null,price:null,priceStatus:'待公布' as const,minimumGuests:null,maximumGuests:null,availableSeats:null,seatStatus:'未开放' as const,included:['车辆及行程服务的最终包含项由运营发布'],excluded:['餐食、景点门票及个人消费是否包含以班次确认页为准'],languages:['简体中文'],mealOptions:'餐食安排待运营确认；未确认前请按自理准备。',childPolicy:'成人、儿童及婴儿的占座与费用规则以具体班次确认页为准。',luggagePolicy:'大件行李、婴儿车及行动辅助设备须在乘客资料中申报并由运营确认。',suitableFor:['希望从大阪出发、一天游览关西代表景点的旅客'],notices:['实际顺序和停留时间可能因天气、交通、景区管制调整','未确认的门票、餐食、辅助设备和费用不会提前收费'],packingList:['可确认订单和集合信息的手机','移动电源及充电线','饮用水和常用个人药品','轻便雨具或折叠伞'],clothingAdvice:'建议穿着便于步行的鞋和可增减的外套；请在出发前一天结合目的地天气调整防晒、防雨或保暖用品。',friendlyReminders:['贵重物品请随身保管，下车时确认随身物品','巴士将按公布时间出发，请预留前往集合点的时间','垃圾请带回车内指定位置或依景区规则处理'],assistanceStatus:'儿童座椅、轮椅、无障碍车辆及工作人员协助均须运营确认',cancellationPolicy:cancellationPolicy.summary,weatherPolicy:'天气或拥堵仅导致顺序、停留或到达时间调整时，不当然构成全额退款；依法应退款、解除或补偿的情形除外。',status:'预告' as const};
type Brief={id:string;slug:string;title:string;shortTitle:string;subtitle:string;summary:string;description:string;region:string;duration:string;walkingLevel:string;categories:Category[];heroImage:string;highlights:string[];stops:string[];timeline:[string,string][];sourceUrl:string};
const rows:Brief[]=[
 {id:'trip-kyoto-nara',slug:'kyoto-nara-classic',title:'邂逅萌鹿：京都奈良一日游',shortTitle:'京都与奈良',subtitle:'清水寺、千本鸟居与奈良萌鹿',summary:'从大阪或京都出发，一天游览清水寺、伏见稻荷大社与奈良公园。',description:'从京都东山历史街区到伏见稻荷千本鸟居，最后前往奈良公园感受古都与鹿群交织的风景。',region:'京都与奈良',duration:'约 9–10 小时',walkingLevel:'中等',categories:['经典人文'],heroImage:'/images/kyoto-nara.jpg',highlights:['清水寺历史街区','伏见稻荷千本鸟居','奈良公园萌鹿'],stops:['清水寺','伏见稻荷大社','奈良公园'],timeline:[['清水寺','游览清水寺及京都东山历史街区。'],['伏见稻荷大社','漫步朱红色千本鸟居。'],['奈良公园','自由游览公园与寺院区域。']],sourceUrl:'https://www.gogoday.com/pages/dayTrip/index?id=128&lang=zh'},
 {id:'trip-amano-ine',slug:'amanohashidate-ine',title:'海之京都：天桥立与伊根舟屋一日游',shortTitle:'天桥立与伊根',subtitle:'日本三景沙洲与临海舟屋村落',summary:'从大阪或京都出发，充实探访天桥立与伊根舟屋两处海岸景观。',description:'在天桥立自由游览并自行用餐，随后前往伊根湾，散步或自费骑行探访沿岸传统舟屋。',region:'京都北部',duration:'约 10–11 小时',walkingLevel:'中等',categories:['自然风光','海滨'],heroImage:'/images/amanohashidate-ine.jpg',highlights:['日本三景天桥立','伊根临海舟屋','海之京都慢旅行'],stops:['天桥立','智恩寺文殊堂','伊根舟屋'],timeline:[['天桥立','自由游览沙洲、观景区域与智恩寺周边。'],['伊根舟屋','散步或自费骑行探访临水而建的舟屋景观。']],sourceUrl:'https://www.gogoday.com/pages/dayTrip/index?id=179&lang=zh'},
 {id:'trip-biwa',slug:'biwako-shirahige',title:'琵琶湖山谷、白须神社与近江八幡一日游',shortTitle:'琵琶湖M线',subtitle:'水上鸟居、山顶湖景与童话草屋',summary:'连接白须神社水上鸟居、琵琶湖观景台与La Collina近江八幡。',description:'从湖中鸟居启程，登上琵琶湖观景台俯瞰湖面，再到La Collina近江八幡感受自然建筑与甜点文化。',region:'滋贺',duration:'约 10–11 小时',walkingLevel:'中等',categories:['自然风光','经典人文'],heroImage:'/images/lake-biwa.jpg',highlights:['白须神社水上鸟居','琵琶湖山顶全景','La Collina草屋'],stops:['白须神社','琵琶湖观景台','La Collina近江八幡'],timeline:[['白须神社','从专用观景区域欣赏湖中鸟居。'],['琵琶湖观景台','搭乘自费缆车前往山顶自由活动。'],['La Collina近江八幡','参观草屋建筑与当地甜点空间。']],sourceUrl:'https://www.gogoday.com/pages/dayTrip/index?id=189&lang=zh'},
 {id:'trip-wakayama',slug:'wakayama-family',title:'和歌山猫站长与白滨温泉一日游',shortTitle:'和歌山猫站长白滨',subtitle:'特色电车、海鲜市场与壮阔海岸',summary:'从贵志站猫站长出发，前往白滨海鲜市场、温泉与海岸名胜。',description:'体验贵志川线特色电车，在Toretore市场自由用餐，可自费体验温泉，最后游览千叠敷与三段壁。',region:'和歌山',duration:'约 9–10 小时',walkingLevel:'轻松至中等',categories:['亲子','海滨'],heroImage:'/images/wakayama.jpg',highlights:['贵志站猫站长','白滨海鲜与温泉','千叠敷与三段壁'],stops:['贵志站','特色电车','白滨Toretore市场','Toretore温泉','千叠敷','三段壁'],timeline:[['贵志站','参观猫站长主题车站并体验特色电车。'],['白滨Toretore市场','自由用餐、购物或自费体验温泉。'],['千叠敷与三段壁','欣赏白滨代表性海岸地貌。']],sourceUrl:'https://www.gogoday.com/pages/dayTrip/index?id=200&lang=zh'},
 {id:'trip-kobe',slug:'kobe-arima-rokko',title:'神户有马温泉与六甲山夜景一日游',shortTitle:'神户夜景B线',subtitle:'温泉古街、异人馆、港湾与千万夜景',summary:'从有马温泉出发，经过北野异人馆与神户港，以六甲山夜景收尾。',description:'午后漫步有马温泉古街，感受北野异人馆与神户港的城市风貌，夜间登上六甲山欣赏神户灯火。',region:'兵库',duration:'约 10–11 小时',walkingLevel:'中等',categories:['经典人文','温泉'],heroImage:'/images/kobe.jpg',highlights:['有马温泉古街','神户港与北野异人馆','六甲山夜景'],stops:['有马温泉','北野异人馆街','神户港与马赛克摩天轮','六甲山夜景'],timeline:[['有马温泉','漫步日本代表性古老温泉街。'],['北野与神户港','感受港都历史与现代夜景。'],['六甲山','从山上眺望神户城市灯火。']],sourceUrl:'https://www.gogoday.com/pages/dayTrip/index?id=190&lang=zh'}];
export const trips:Trip[]=rows.map(r=>({...common,...r,gallery:[r.heroImage],timeline:r.timeline.map(([title,detail])=>({time:null,title,detail,location:title})),imageCredits:['Japan Travel / 大寅集团提供的来源站素材']}));
const kyotoNara=trips.find(trip=>trip.slug==='kyoto-nara-classic');
if(kyotoNara)Object.assign(kyotoNara,{
  status:'标准路线',
  description:'从大阪出发，依次走访伏见稻荷大社、京都东山历史街区与奈良公园区域。路线以关西代表性文化景观为主，实际出发和返回时间以具体班次为准。',
  gallery:['/images/kyoto-nara.jpg'],
  timeline:[
    {time:'08:40',title:'大阪日本桥集合出发',detail:'建议发车前10分钟到达；迟到无法久候。',location:'日本桥站2号出口'},
    {time:'09:50',title:'京都站集合出发',detail:'选择京都上车的乘客请提前到达站前观光巴士停车场。',location:'京都站八条口'},
    {time:'10:00',title:'清水寺与东山历史街区',detail:'自由游览约150分钟；门票与午餐费用以订单包含项目为准。',location:'京都市东山区'},
    {time:'13:00',title:'伏见稻荷大社',detail:'自由游览约70分钟，漫步朱红色千本鸟居。',location:'京都市伏见区'},
    {time:'15:30',title:'奈良公园',detail:'自由游览约90分钟；请遵守野生动物互动规则并照看儿童。',location:'奈良市'},
    {time:'18:00',title:'预计返回大阪',detail:'返程时间仅供参考，实际可能受交通与当天行程影响。',location:'日本桥站2号出口'},
  ],
  included:['大阪往返车辆与司机服务（具体车型待配车确认）','行程履约支持与本车 Trip Room'],
  excluded:['未在班次确认页明确列出的景点门票','午餐、饮品及个人消费','儿童座椅、轮椅租赁等尚未确认的附加服务'],
  suitableFor:['第一次到访关西、希望一天串联京都与奈良代表景点的旅客','可接受中等步行量及上下车转换的旅客'],
  notices:['全程步行强度为中等，东山街区包含坡道与石阶','景点顺序和停留时间可因天气、拥堵及景区管制调整','鹿群为野生动物，请依现场指引互动并照看儿童'],
  packingList:['防滑、适合长时间步行的鞋','可确认集合地点与接收通知的手机','移动电源、饮用水及常用个人药品','夏季防晒用品，雨季轻便雨具，冬季保暖外套'],
  clothingAdvice:'伏见稻荷和京都东山区域有坡道、石阶与较长步行路段，建议穿运动鞋或防滑平底鞋；避免影响行动的长裙和不便步行的鞋履。',
  friendlyReminders:['奈良鹿属于野生动物，请勿追逐、拥抱或向幼童单独递食','景区人流较多，请遵守司导公布的集合时间并留意群内通知','神社与寺院内请降低音量，并遵守禁止摄影和饮食区域提示'],
});
const routeOverrides:Record<string,Partial<Trip>>={
  'amanohashidate-ine':{status:'标准路线',timeline:[
    {time:'08:40',title:'大阪日本桥集合出发',detail:'建议发车前10分钟到达；迟到无法久候。',location:'日本桥站2号出口'},
    {time:'09:50',title:'京都站集合出发',detail:'选择京都上车的乘客请提前抵达。',location:'京都站八条口'},
    {time:'11:20',title:'天桥立',detail:'自由游览约150分钟，包含自行午餐时间；缆车、观览船等是否包含以所选套餐为准。',location:'京都府宫津市'},
    {time:'14:30',title:'伊根舟屋',detail:'自由游览约80分钟，可散步或自费骑行。',location:'京都府伊根町'},
    {time:'18:20',title:'预计抵达京都站',detail:'返程时间仅供参考。',location:'京都站八条口'},
    {time:'19:20',title:'预计返回大阪',detail:'返程时间可能因道路情况提前或延后。',location:'日本桥站2号出口'},
  ]},
  'biwako-shirahige':{status:'标准路线',timeline:[
    {time:'08:00',title:'大阪日本桥集合出发',detail:'建议发车前10分钟到达；迟到无法久候。',location:'日本桥站2号出口'},
    {time:'09:20',title:'京都站集合出发',detail:'选择京都上车的乘客请提前抵达。',location:'京都站八条口'},
    {time:'10:20',title:'白须神社水上鸟居',detail:'停留约30分钟，请从安全的专用观景区域欣赏和拍摄。',location:'滋贺县高岛市'},
    {time:'11:30',title:'琵琶湖观景台',detail:'自由活动约180分钟并自行午餐；缆车票自理。检修或停运期间可能改为三千院。',location:'琵琶湖Valley'},
    {time:'15:30',title:'La Collina近江八幡',detail:'自由活动约60分钟，参观草屋建筑及甜点空间。',location:'滋贺县近江八幡市'},
    {time:'17:40',title:'预计抵达京都站',detail:'返程时间仅供参考。',location:'京都站八条口'},
    {time:'18:50',title:'预计返回大阪',detail:'实际抵达可能受道路情况影响。',location:'日本桥站2号出口'},
  ],notices:['琵琶湖观景台缆车门票与午餐通常自理，以班次确认页为准','缆车检修、天气或停运时可能改为三千院等替代行程','白须神社请在安全观景区域拍摄，禁止横穿车道']},
  'wakayama-family':{status:'标准路线',timeline:[
    {time:'09:00',title:'大阪日本桥集合出发',detail:'建议发车前10分钟到达；迟到无法久候。',location:'日本桥站2号出口'},
    {time:'10:30',title:'贵志站与特色电车',detail:'自由游览约50分钟；猫站长值班及特色列车班次可能调整。',location:'和歌山县纪之川市'},
    {time:'12:30',title:'白滨Toretore市场',detail:'自由活动约120分钟，可自行用餐、购物或自费体验温泉。',location:'和歌山县白滨町'},
    {time:'14:50',title:'千叠敷与三段壁',detail:'自由游览约70分钟；三段壁洞窟门票自理。',location:'南纪白滨海岸'},
    {time:'18:40',title:'预计返回大阪',detail:'实际抵达可能受道路情况影响。',location:'日本桥站2号出口'},
  ],notices:['猫站长值班与特色电车车型可能临时调整，不保证指定猫咪或列车','温泉、三段壁洞窟及餐食费用是否包含以班次确认页为准','海岸区域请远离湿滑岩石和临崖危险位置']},
  'kobe-arima-rokko':{status:'标准路线',timeline:[
    {time:'11:30',title:'大阪日本桥集合出发',detail:'夏令时参考11:30；冬令时参考10:30，最终以订单通知为准。',location:'日本桥站2号出口'},
    {time:'12:30',title:'有马温泉',detail:'自由游览约150分钟，可漫步温泉古街；入浴费用自理。',location:'神户市北区'},
    {time:'15:30',title:'北野异人馆街',detail:'自由游览约60分钟，冬令时参考14:30到达。',location:'神户市中央区'},
    {time:'16:50',title:'神户港与马赛克摩天轮',detail:'自由游览约150分钟，冬令时参考15:50到达。',location:'神户港'},
    {time:'19:20',title:'六甲山夜景',detail:'自由游览约100分钟；缆车及期间限定活动费用自理。',location:'六甲山'},
    {time:'22:00',title:'预计返回大阪',detail:'冬令时参考21:00；实际抵达可能受道路与季节日落时间影响。',location:'日本桥站2号出口'},
  ],notices:['本线路随日落时间采用冬令时或夏令时，最终发车时间以订单通知为准','六甲山缆车及期间限定活动费用通常自理','晚间山上温度较低且山路弯曲，请准备外套并酌情做好晕车防护']},
};
trips.forEach(trip=>Object.assign(trip,routeOverrides[trip.slug]??{}));
export const getTrip=(slug?:string)=>trips.find(t=>t.slug===slug);
