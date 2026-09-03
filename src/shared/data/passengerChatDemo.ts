import type {ItineraryStop} from '../services/itineraryMeeting';
export const passengerChatDemo={
  tripName:'京都与奈良一日游',stage:'奈良公园自由活动',status:'traveling' as const,meetingActive:true,party:{arrived:9,total:12,distanceMeters:380,walkMinutes:6},
  guide:{name:'山田 美咲',role:'司导',phone:'+81-90-0000-1188',avatar:'山',vehicle:{type:'海狮',color:'珍珠白',plate:'大阪 830 あ 12-34'}},
  stops:[
    {id:'osaka',name:'大阪出发',arrivalTime:'07:50',meetingTime:'08:00',meetingPointName:'日本桥2号出口',meetingPointDescription:'2号出口地面，黄色工作人员旗帜旁',latitude:34.6687,longitude:135.5062,status:'completed'},
    {id:'todaiji',name:'东大寺与奈良公园',arrivalTime:'10:20',meetingTime:'11:30',meetingPointName:'东大寺南大门东侧',meetingPointDescription:'面向南大门右侧石灯笼旁，寻找黄色 JT 标识',meetingPointPhoto:'/images/kyoto-nara.jpg',latitude:34.6889,longitude:135.8398,status:'current'},
    {id:'nara',name:'奈良公园自由活动',arrivalTime:'13:10',meetingTime:'14:20',meetingPointName:'奈良公园巴士停车场',meetingPointDescription:'巴士停车场入口的团体集合区',latitude:34.6851,longitude:135.843,status:'upcoming'},
    {id:'return',name:'返程集合',arrivalTime:'15:30',meetingTime:'16:30',meetingPointName:'最后返程集合点',meetingPointDescription:'以司导当日通知为准',latitude:34.6812,longitude:135.8423,status:'upcoming'},
    {id:'osaka-return',name:'预计返回大阪',meetingTime:'18:00',meetingPointName:'日本桥2号出口',latitude:34.6687,longitude:135.5062,status:'upcoming'},
  ] satisfies ItineraryStop[],
  messages:[
    {id:'m1',senderId:'guide',name:'山田 美咲',role:'guide' as const,time:'10:18',content:'大家可以自由参观，11:30在南大门东侧集合。'},
    {id:'m2',senderId:'p2',name:'Linh',role:'passenger' as const,time:'10:20',content:'Tôi đã tìm thấy điểm tập trung.',translated:'我已经找到集合地点。',sourceLanguage:'vi'},
    {id:'m3',senderId:'me',name:'我',role:'passenger' as const,time:'10:21',content:'好的，谢谢！'},
    {id:'m4',kind:'unread' as const},
    {id:'change-1',kind:'meeting-change' as const,time:'10:23',oldValue:'集合：东大寺南大门西侧',newValue:'集合：东大寺南大门东侧',reason:'西侧临时实施通行管制'},
    {id:'m5',senderId:'operations',name:'Japan Travel',role:'operations' as const,time:'10:25',content:'如集合地点发生变化，会在这里发送需要确认的黄色通知。'},
  ]
};
