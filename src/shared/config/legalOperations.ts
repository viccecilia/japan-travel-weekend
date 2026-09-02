export const operatorProfile={
  legalNameJa:'株式会社大寅',
  legalNameEn:'Daitora Co., Ltd.',
  address:'大阪府大阪市大正区小林西2丁目10-3',
  representative:'代表取締役 大野 創世',
  corporatePhone:'06-6710-9861',
  corporateEmail:'info@daitora-jp.com',
  businessHours:'10:00–17:00（土・日・祝日除く）',
  licences:[
    '一般乗用旅客自動車運送事業 近運自ニ第990号',
    '一般貸切旅客自動車運送事業 近運自一第737号',
    '旅行手配・観光サービス 第7068号（第二種旅行业登记名称与编号待许可证原文确认）',
  ],
} as const;

export const cancellationPolicy={
  timeZone:'Asia/Tokyo',
  cutoffLabel:'日本时间',
  tiers:[
    {label:'出发日前第3天之前',refundPercent:100},
    {label:'出发前2～3天',refundPercent:50},
    {label:'出发前1天、出发当天及行程开始后',refundPercent:0},
  ],
  summary:'出发日前第3天之前全额退款；出发前2～3天退款50%；出发前1天起原则上不退款。',
  rules:[
    '取消时间以系统成功受理时间为准，统一按日本时间计算。',
    '迟到、未出现或自行中途离团，原则上不退款。',
    '由我方取消时，退还未提供服务对应的款项；依法应退款、解除或补偿的情形不受排除。',
    '天气或拥堵仅造成景点顺序、停留时间或到达时间调整时，不当然构成全额退款。',
    'Stripe退款原路退回；银行转账退款经人工核对。退款状态会区分我方已发起和金融机构实际到账。',
    '儿童座椅、轮椅等附加服务须先确认可提供及费用；无法提供时不会收取对应费用。',
  ],
} as const;

const japanCalendarDay=(value:Date)=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);const get=(type:string)=>Number(parts.find(part=>part.type===type)?.value);return Date.UTC(get('year'),get('month')-1,get('day'))};
export function refundPercentAt(departure:Date,acceptedAt:Date){const days=Math.round((japanCalendarDay(departure)-japanCalendarDay(acceptedAt))/86_400_000);return days>3?100:days>=2?50:0}
