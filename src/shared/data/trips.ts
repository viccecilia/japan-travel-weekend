import type {Category,Trip} from '../types';
import {cancellationPolicy} from '../config/legalOperations';
const common={meetingPoint:null,departureTime:null,returnTime:null,price:null,priceStatus:'待公布' as const,minimumGuests:null,maximumGuests:null,availableSeats:null,seatStatus:'未开放' as const,included:['车辆及行程服务的最终包含项由运营发布'],excluded:['餐食、景点门票及个人消费是否包含以班次确认页为准'],languages:['简体中文'],mealOptions:'餐食安排待运营确认；未确认前请按自理准备。',childPolicy:'成人、儿童及婴儿的占座与费用规则以具体班次确认页为准。',luggagePolicy:'大件行李、婴儿车及行动辅助设备须在乘客资料中申报并由运营确认。',suitableFor:['希望从大阪出发、一天游览关西代表景点的旅客'],notices:['实际顺序和停留时间可能因天气、交通、景区管制调整','未确认的门票、餐食、辅助设备和费用不会提前收费'],assistanceStatus:'儿童座椅、轮椅、无障碍车辆及工作人员协助均须运营确认',cancellationPolicy:cancellationPolicy.summary,weatherPolicy:'天气或拥堵仅导致顺序、停留或到达时间调整时，不当然构成全额退款；依法应退款、解除或补偿的情形除外。',status:'预告' as const};
type Brief={id:string;slug:string;title:string;shortTitle:string;subtitle:string;summary:string;description:string;region:string;duration:string;walkingLevel:string;categories:Category[];heroImage:string;highlights:string[];stops:string[];timeline:[string,string][];sourceUrl:string};
const rows:Brief[]=[
 {id:'trip-kyoto-nara',slug:'kyoto-nara-classic',title:'京都与奈良世界遗产经典一日游',shortTitle:'京都与奈良',subtitle:'神社、古街与鹿群交织的关西经典路线',summary:'适合初次到访者，一天感受京都与奈良最具代表性的文化景观。',description:'从伏见稻荷大社的朱红鸟居出发，漫步京都古街，再前往奈良公园与代表性寺院。',region:'京都与奈良',duration:'约 10–11 小时',walkingLevel:'中等',categories:['经典人文'],heroImage:'/images/kyoto-nara.jpg',highlights:['世界遗产氛围','京都历史街区','奈良公园景观'],stops:['伏见稻荷大社','清水寺','祇园花见小路','奈良公园','东大寺','春日大社'],timeline:[['伏见稻荷大社','从著名的千本鸟居开启一天。'],['清水寺与祇园','欣赏寺院景观并漫步历史街区。'],['奈良公园与寺院','穿过公园前往东大寺与春日大社。']],sourceUrl:'https://japan-travel.info/ja/routes/kyoto-nara-classic/'},
 {id:'trip-amano-ine',slug:'amanohashidate-ine',title:'天桥立与伊根舟屋海岸一日游',shortTitle:'天桥立与伊根',subtitle:'沙洲胜景与临海舟屋村落',summary:'用充实的一天探访京都北部两处独特的海岸景观。',description:'眺望天桥立的经典全景，并探访沿伊根湾而建的传统舟屋。',region:'京都北部',duration:'约 11–12 小时',walkingLevel:'中等',categories:['自然风光','海滨'],heroImage:'/images/amanohashidate-ine.jpg',highlights:['日本代表性景观之一','伊根临海村落','京都北部海岸'],stops:['天桥立','伊根舟屋'],timeline:[['天桥立','欣赏沙洲与海湾景色。'],['伊根舟屋','探访临水而建的传统舟屋景观。']],sourceUrl:'https://japan-travel.info/ja/routes/amanohashidate-ine/'},
 {id:'trip-biwa',slug:'biwako-shirahige',title:'琵琶湖、白须神社与近江八幡',shortTitle:'琵琶湖与近江八幡',subtitle:'湖畔风光、水乡街区与城郭历史',summary:'连接湖中鸟居、古老水乡与历史城郭的悠闲滋贺路线。',description:'从琵琶湖景色到近江八幡老街和彦根城，发现关西安静的一面。',region:'滋贺',duration:'约 9–10 小时',walkingLevel:'中等',categories:['自然风光','经典人文'],heroImage:'/images/lake-biwa.jpg',highlights:['琵琶湖全景','历史水乡','城郭文化'],stops:['白须神社','琵琶湖','近江八幡','彦根城'],timeline:[['白须神社','欣赏湖畔标志性的鸟居。'],['近江八幡','漫步运河边的历史街区。'],['彦根城','在城郭历史中结束一天。']],sourceUrl:'https://japan-travel.info/ja/routes/biwako-shirahige/'},
 {id:'trip-wakayama',slug:'wakayama-family',title:'和歌山亲子一日游',shortTitle:'和歌山亲子之旅',subtitle:'趣味车站、市场风味与海滨空气',summary:'兼顾猫咪车站、当地市场、城堡与海岸的亲子路线。',description:'感受和歌山轻松有趣的铁路文化、当地市场氛围、城堡庭园与海滨散步。',region:'和歌山',duration:'约 8–9 小时',walkingLevel:'轻松至中等',categories:['亲子','海滨'],heroImage:'/images/wakayama.jpg',highlights:['猫咪车站主题','当地市场氛围','城堡与海岸'],stops:['贵志站','猫站长主题','黑潮市场','和歌山城','海滨散步'],timeline:[['贵志站','体验和歌山广受喜爱的猫咪车站。'],['黑潮市场','感受热闹的当地市场。'],['城堡与海滨','把地方历史与海岸空气连在一起。']],sourceUrl:'https://japan-travel.info/ja/routes/wakayama-family/'},
 {id:'trip-kobe',slug:'kobe-arima-rokko',title:'神户、有马温泉与六甲山夜景',shortTitle:'神户、有马与六甲山',subtitle:'港都风情、温泉街与山顶夜景',summary:'从港湾文化到有马温泉，再以六甲山夜景收尾的多彩路线。',description:'先探索神户港湾与异人馆文化，再漫步有马温泉街，最后欣赏六甲山夜景。',region:'兵库',duration:'约 9–10 小时',walkingLevel:'中等',categories:['经典人文','温泉'],heroImage:'/images/kobe.jpg',highlights:['神户港湾','有马温泉街','六甲山夜景'],stops:['神户港与临海乐园','北野异人馆','布引香草园','有马温泉','六甲山'],timeline:[['神户港湾与北野','了解港都与国际文化。'],['有马温泉','漫步关西著名温泉街。'],['六甲山','在城市灯火中结束一天。']],sourceUrl:'https://japan-travel.info/ja/routes/kobe-arima-rokko/'}];
export const trips:Trip[]=rows.map(r=>({...common,...r,gallery:[r.heroImage],timeline:r.timeline.map(([title,detail])=>({time:null,title,detail,location:title})),imageCredits:['Japan Travel / 大寅集团提供的来源站素材']}));
const kyotoNara=trips.find(trip=>trip.slug==='kyoto-nara-classic');
if(kyotoNara)Object.assign(kyotoNara,{
  status:'标准路线',
  description:'从大阪出发，依次走访伏见稻荷大社、京都东山历史街区与奈良公园区域。路线以关西代表性文化景观为主，实际出发和返回时间以具体班次为准。',
  gallery:['/images/kyoto-nara.jpg'],
  timeline:[
    {time:null,title:'大阪集合并确认乘客',detail:'集合时间、地点、地址和车辆信息由具体 Departure 发布；请提前到达并完成签到。',location:'大阪（具体集合点待班次确认）'},
    {time:null,title:'伏见稻荷大社',detail:'参观朱红鸟居与神社区域；停留时长根据交通和现场客流调整。',location:'京都市伏见区'},
    {time:null,title:'清水寺与东山历史街区',detail:'步行游览清水寺周边、二年坂三年坂一带；门票和午餐包含情况以班次确认页为准。',location:'京都市东山区'},
    {time:null,title:'奈良公园与东大寺周边',detail:'游览奈良公园及代表性寺院区域；请遵守当地野生动物与景区规则。',location:'奈良市'},
    {time:null,title:'返回大阪',detail:'预计结束时间由具体 Departure 发布；拥堵可能影响抵达时间。',location:'大阪（下车点待班次确认）'},
  ],
  included:['大阪往返车辆与司机服务（具体车型待配车确认）','行程履约支持与本车 Trip Room'],
  excluded:['未在班次确认页明确列出的景点门票','午餐、饮品及个人消费','儿童座椅、轮椅租赁等尚未确认的附加服务'],
  suitableFor:['第一次到访关西、希望一天串联京都与奈良代表景点的旅客','可接受中等步行量及上下车转换的旅客'],
  notices:['全程步行强度为中等，东山街区包含坡道与石阶','景点顺序和停留时间可因天气、拥堵及景区管制调整','鹿群为野生动物，请依现场指引互动并照看儿童'],
});
export const getTrip=(slug?:string)=>trips.find(t=>t.slug===slug);
