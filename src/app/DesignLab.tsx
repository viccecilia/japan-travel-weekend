import {useState} from 'react';

type ThemeKey='atelier'|'market'|'wa'|'journey';
type ViewKey='home'|'booking'|'trip'|'room';

const themes:{key:ThemeKey;code:string;name:string;idea:string}[]=[
  {key:'atelier',code:'A',name:'国际精品',idea:'克制、高级、重摄影'},
  {key:'market',code:'B',name:'高转化电商',idea:'明快、直接、重预订'},
  {key:'wa',code:'C',name:'日式精品',idea:'安静、在地、有辨识度'},
  {key:'journey',code:'D',name:'履约助手',idea:'安心、清晰、重行程'},
];

export function DesignLab(){
  const [theme,setTheme]=useState<ThemeKey>('atelier');
  const [view,setView]=useState<ViewKey>('home');
  const selected=themes.find(item=>item.key===theme)!;
  return <main className="design-lab">
    <header className="lab-head">
      <div><span>JT WEEKEND · VISUAL LAB</span><h1>四种视觉方向</h1><p>同一产品、同一内容，比较品牌感与使用效率。</p></div>
      <a href="/app">返回当前 App</a>
    </header>
    <nav className="theme-picker" aria-label="视觉方案">
      {themes.map(item=><button key={item.key} className={theme===item.key?'active':''} onClick={()=>setTheme(item.key)}><i>{item.code}</i><b>{item.name}</b><small>{item.idea}</small></button>)}
    </nav>
    <div className="lab-toolbar"><div><b>{selected.code} · {selected.name}</b><span>{selected.idea}</span></div><div className="view-switch"><button className={view==='home'?'active':''} onClick={()=>setView('home')}>发现</button><button className={view==='booking'?'active':''} onClick={()=>setView('booking')}>预订</button><button className={view==='trip'?'active':''} onClick={()=>setView('trip')}>我的行程</button><button className={view==='room'?'active':''} onClick={()=>setView('room')}>Trip Room</button></div></div>
    <section className={`concept-stage theme-${theme}`}>
      <div className="concept-note"><span>设计关键词</span><strong>{theme==='atelier'?'Editorial · Trust · Curated':theme==='market'?'Fast · Clear · Conversion':theme==='wa'?'Local · Calm · Human':'Live · Safe · Connected'}</strong><p>{theme==='atelier'?'用精选摄影和克制留白建立国际旅行品牌信任。':theme==='market'?'让日期、余位、价格和预订按钮第一眼就能看懂。':theme==='wa'?'以日本在地质感与小团温度建立独有品牌记忆。':'把集合、导航、车辆和群组变成产品最强差异点。'}</p></div>
      <div className="concept-phone">
        <header className="concept-top"><span>JT</span><b>Japan Travel Weekend</b><button className="concept-language" aria-label="当前语言：简体中文"><i>文</i><span>简中</span><em>⌄</em></button></header>
        {view==='home'&&<HomePreview theme={theme} onBook={()=>setView('booking')}/>}
        {view==='booking'&&<BookingPreview onComplete={()=>setView('trip')}/>}
        {view==='trip'&&<MyTripPreview onRoom={()=>setView('room')}/>}
        {view==='room'&&<RoomPreview/>}
        <nav className="concept-nav"><button className={view==='home'?'active':''} onClick={()=>setView('home')}>⌂<small>首页</small></button><button className={view==='booking'?'active':''} onClick={()=>setView('booking')}>◇<small>行程</small></button><button className={view==='trip'||view==='room'?'active':''} onClick={()=>setView('trip')}>▤<small>订单</small></button><button>○<small>我的</small></button></nav>
      </div>
    </section>
  </main>;
}

function HomePreview({theme,onBook}:{theme:ThemeKey;onBook:()=>void}){
  return <div className="concept-content">
    <div className="concept-hero">
      <img src="/images/kyoto-nara.jpg" alt="京都伏见稻荷大社鸟居"/>
      <div><span>{theme==='market'?'本周末热卖':theme==='journey'?'大阪出发 · 已确认':'大阪出发 · 周末小团'}</span><h2>{theme==='wa'?'周末，去关西深处。':'探索关西，遇见同行者'}</h2><p>一个人也能参加 · 无需日语</p>{theme==='market'&&<button>搜索目的地或体验</button>}</div>
    </div>
    {theme==='journey'&&<article className="next-trip"><span>明天 · 08:00</span><b>京都与奈良</b><p>大阪梅田集合 · 车辆已分配</p><button>打开我的行程 →</button></article>}
    <div className="concept-section-head"><div><span>{theme==='wa'?'今週の旅':'THIS WEEKEND'}</span><h3>{theme==='market'?'本周末人气行程':'本周末精选'}</h3></div><button>查看全部</button></div>
    <article className="concept-trip">
      <img src="/images/amanohashidate-ine.jpg" alt="天桥立与伊根海岸"/>
      <div><div className="trip-flags"><span>本周六</span><em>{theme==='market'?'仅余 2 席':'小团出发'}</em></div><h3>天桥立与伊根舟屋</h3><p>海岸绝景 · 传统村落 · 大阪往返</p><footer><b>¥12,800 <small>/席</small></b><button onClick={onBook}>选择座位</button></footer></div>
    </article>
    <div className="confidence-row"><span>✓ 中文服务</span><span>✓ 专业车辆</span><span>✓ 安心出行</span></div>
  </div>;
}

function BookingPreview({onComplete}:{onComplete:()=>void}){
  return <div className="concept-content booking-preview">
    <div className="booking-cover"><img src="/images/amanohashidate-ine.jpg" alt="天桥立与伊根舟屋"/><button aria-label="返回">←</button><span>本周末精选</span></div>
    <div className="booking-title"><span>大阪出发 · 一日游</span><h2>天桥立与伊根舟屋</h2><p>海岸绝景、传统舟屋与当地风味午餐</p><div><b>4.8</b> · 286条评价 · <em>中文服务</em></div></div>
    <section className="booking-block"><header><span>1</span><div><b>选择出发班次</b><small>所有时间均为日本时间</small></div></header><div className="date-strip"><button>周五<small>8/28</small></button><button className="active">周六<small>8/29</small></button><button>周日<small>8/30</small></button></div><div className="departure-row"><div><b>08:00 出发</b><small>大阪梅田 · 行程已确认</small></div><strong>可预订</strong></div></section>
    <section className="booking-block"><header><span>2</span><div><b>购买席位</b><small>车辆将在报名结束后统一分配</small></div></header><div className="seat-row"><div><b>成人</b><small>¥12,800 / 席</small></div><div className="stepper"><button>−</button><strong>1</strong><button>＋</button></div></div><div className="seat-row"><div><b>儿童</b><small>如有儿童将确认儿童座椅</small></div><div className="stepper"><button>−</button><strong>0</strong><button>＋</button></div></div></section>
    <aside className="booking-policy">免费取消期限与退款金额按日本时间计算；付款前可查看完整规则。</aside>
    <div className="booking-total"><div><span>合计</span><b>¥12,800</b></div><button onClick={onComplete}>填写乘客并确认 →</button></div>
  </div>;
}

function MyTripPreview({onRoom}:{onRoom:()=>void}){
  return <div className="concept-content mytrip-preview">
    <div className="mytrip-heading"><span>MY TRIP</span><h2>明天见，Pang</h2><p>所有出发信息都已整理在这里。</p></div>
    <article className="trip-ticket"><div className="trip-ticket__hero"><img src="/images/kyoto-nara.jpg" alt="京都与奈良"/><span>明天 · 已确认</span><div><b>京都与奈良</b><small>订单 JTW-709682 · 1席</small></div></div><div className="trip-timeline"><div><span>07:45</span><p><b>请在集合点签到</b><small>大阪梅田 Mainichi 大厦前</small></p></div><div><span>08:00</span><p><b>准时出发</b><small>建议提前15分钟抵达</small></p></div></div><div className="meeting-access"><div className="meeting-photo">集合点<br/>照片</div><div><span>如何抵达</span><b>大阪站步行约8分钟</b><small>从樱桥口出站，沿地下通道前往。</small><button>打开地图导航</button></div></div><button className="open-room" onClick={onRoom}>进入本车 Trip Room →</button></article>
    <section className="service-check"><b>出发前确认</b><label><input type="checkbox"/> 我已确认集合时间和地点</label><label><input type="checkbox"/> 本订单没有需要补充的儿童座椅或轮椅</label></section>
    <div className="trip-support"><button>查看登车凭证</button><button>联系客服</button></div>
  </div>;
}

function RoomPreview(){
  const [mapOpen,setMapOpen]=useState(false);
  return <div className="concept-content room-preview">
    <div className="chat-room-head"><div><span>京都与奈良 · A组</span><h2>本车群聊</h2><p>司机、司导及本车乘客 · 8位成员</p></div><button>成员</button></div>
    <div className="pinned-message group-notice"><span>置顶 · 司机通知</span><b>请于 14:20 前返回清水寺巴士停车场</b><p>车辆已到达 · 查看集合详情 ›</p></div>
    <div className="pinned-strip">
      <button className="pin-card meeting"><span>下一次集合</span><strong>14:20</strong><small>清水寺巴士停车场</small></button>
      <button className="pin-card driver" onClick={()=>setMapOpen(value=>!value)}><span>寻找司机</span><strong>🚐 320米</strong><small>{mapOpen?'收起地图':'点击展开地图'}</small></button>
      <button className="pin-card vehicle"><span>车辆状态</span><strong>5 / 6</strong><small>乘客已返回</small></button>
    </div>
    {mapOpen&&<div className="map-expand"><div className="concept-map"><span className="map-pill">司机距您 320 米</span><i className="map-driver">🚐</i><i className="map-user">●</i><div className="map-route"/></div><div className="room-primary"><button>开始步行导航</button><button>共享我的位置</button></div></div>}
    <section className="vehicle-chat">
      <div className="chat-day">今天</div>
      <article className="service-message departure"><header><span>行程通知</span><time>07:00</time></header><h3>今日旅行团信息</h3><dl><div><dt>路线</dt><dd>京都与奈良一日游</dd></div><div><dt>集合</dt><dd>08:00 · 大阪梅田</dd></div><div><dt>车辆</dt><dd>Alphard · A组</dd></div></dl><footer><button>查看行程</button><button>集合点导航</button></footer></article>
      <article className="chat-message driver"><i>王</i><div><span>司机 · 王先生</span><p>车辆已经到达清水寺巴士停车场，请大家在14:20前返回。</p><small>查看原文：車両は清水寺バス駐車場に到着しました。</small></div></article>
      <article className="chat-message guest"><i>M</i><div><span>Minh · 乘客</span><p>收到，我们正在步行返回，大约需要8分钟。</p><small>查看原文：Đã rõ, chúng tôi đang đi bộ về.</small></div></article>
      <article className="chat-photo"><div>周围照片</div><p><b>Minh</b><span>我在这个入口附近</span></p></article>
      <article className="chat-message self"><div><span>我</span><p>好的，我已经看到司机位置了，马上回来。</p></div><i>我</i></article>
      <article className="service-message arrived"><header><span>司机通知</span><time>13:40</time></header><h3>车辆已经到达</h3><p>司机距集合点约320米，仍有1位乘客未返回。</p><footer><button onClick={()=>setMapOpen(true)}>寻找司机</button><button>我已知晓</button></footer></article>
      <article className="chat-message guest"><i>A</i><div><span>Amy · 乘客</span><p>我们已经上车了。</p><small>查看原文：We are already on the vehicle.</small></div></article>
      <div className="chat-compose"><button aria-label="添加照片">＋</button><input aria-label="群聊消息" placeholder="发送给本车群组…"/><button>发送</button></div>
      <small className="chat-privacy">仅本车成员可见 · 不显示私人联系方式</small>
    </section>
    <div className="room-tools"><button>登车凭证</button><button>发送照片</button><button>联系帮助</button></div>
  </div>;
}
