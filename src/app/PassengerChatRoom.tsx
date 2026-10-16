import {useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {passengerRound1Copy} from '../shared/i18n/passengerRound1';
import {useApp} from './store';
import {chatLanguages,type ChatLanguage} from '../shared/services/chatTranslation';
import {currentMeetingStop,meetingUrgency,type ItineraryStop} from '../shared/services/itineraryMeeting';
import {guideTelephoneUrl,openWalkingNavigation} from '../shared/capabilities/meetingActions';

type ChatMessage={id:string;senderId?:string;name?:string;role?:'passenger'|'driver'|'guide'|'driver_guide'|'operations';time?:string;content?:string;translated?:string;sourceLanguage?:string;kind?:'unread'|'meeting-change';oldValue?:string;newValue?:string;reason?:string;photo?:React.ReactNode;location?:React.ReactNode};
export type ArrivalPassenger={passengerId:string;label:string;status:'pending'|'confirmed_departure'|'at_meeting_point'|'boarded'|'needs_assistance'|'contacting'|'unreachable'|'no_show_confirmed';meetingRevision?:number|null};
export type PassengerChatRoomProps={tripName:string;stage:string;status:'preparing'|'meeting'|'traveling'|'ended';meetingActive:boolean;party:{arrived:number;total:number;distanceMeters:number|null;walkMinutes:number|null};guide:{name:string;role:string;phone:string;avatar:string;vehicle:{type:string;color:string;plate:string;photoUrl?:string}};stops:ItineraryStop[];messages:ChatMessage[];onSend?:(message:string)=>void;arrivalPassengers?:ArrivalPassenger[];meetingContext?:{roomId:string;vehicleGroupId:string;status:'scheduled'|'active'|'completed'|'cancelled';revision:number;time:string;place:string};onArrive?:(passengerIds:string[],meetingRevision:number)=>boolean|Promise<boolean>;onLate?:(minutes:5|10|15)=>boolean|Promise<boolean>;initialLateMinutes?:number|null;readOnly?:boolean;readOnlyNotice?:string;onLocaleChange?:(language:ChatLanguage)=>void;renderMoreControls?:(close:()=>void)=>React.ReactNode;mapHref?:string};

const useChatCopy=()=>{
  const {state}=useApp();
  const copy=passengerRound1Copy[state.ui.locale??'zh-CN'];
  return {...copy.chat,...copy.common,back:copy.common.back,callGuide:copy.chat.callStaff,guideVehicle:copy.chat.staffVehicle};
};
const roleLabel=(c:ReturnType<typeof useChatCopy>)=>({passenger:c.passenger,driver:c.driver,guide:c.guide,driver_guide:c.driverGuide,operations:c.operations} as const);
const PhoneIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3H4.8C3.8 3 3 3.8 3 4.8 3 13.7 10.3 21 19.2 21c1 0 1.8-.8 1.8-1.8V17l-4.7-1-1.1 2.1a15.8 15.8 0 0 1-9.3-9.3L8 7.7 7 3Z"/></svg>;
const MapIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 5-2 8 2 5-2v14l-5 2-8-2-5 2V6Z"/><path d="M8 4v14m8-12v14M12.5 13.5l5.5-3-3 5.5-1-2-1.5-.5Z"/></svg>;

export function PassengerChatRoom(props:PassengerChatRoomProps){
  const {state}=useApp();
  const c=useChatCopy();
  const locale=state.ui.locale??'zh-CN';
  const [expanded,setExpanded]=useState(false);const [menu,setMenu]=useState(false);const [translationMenu,setTranslationMenu]=useState(false);const [moreOpen,setMoreOpen]=useState(false);const [now,setNow]=useState(()=>new Date());const [lateMenu,setLateMenu]=useState(false);
  const initialLateMinutes=props.initialLateMinutes===5||props.initialLateMinutes===10||props.initialLateMinutes===15?props.initialLateMinutes:null;
  const [lateMinutes,setLateMinutes]=useState<5|10|15|null>(
    initialLateMinutes ?? null
  );
  const [lateSaving,setLateSaving]=useState(false);const [draft,setDraft]=useState('');const [quick,setQuick]=useState(false);const [acked,setAcked]=useState<string[]>([]);const [originals,setOriginals]=useState<string[]>([]);const [demoMessages,setDemoMessages]=useState(props.messages);const scrollRef=useRef<HTMLDivElement>(null);const stickToBottom=useRef(true);
  useEffect(()=>{const id=window.setInterval(()=>setNow(new Date()),30000);return()=>window.clearInterval(id)},[]);
  const localMessages=props.onSend?props.messages:demoMessages;
  const stop=useMemo(()=>currentMeetingStop(props.stops),[props.stops]);
  const urgency=stop?meetingUrgency(stop,now):null;
  const ended=props.status==='ended'||props.readOnly;
  if(!stop)return null;
  const activeLanguage=locale as ChatLanguage;
  const activeLanguageLabel=chatLanguages.find(item=>item.code===activeLanguage)?.label??activeLanguage;
  const stageLabel=props.stage.trim()!==c.status[props.status].trim()?props.stage.trim():'';
  const peopleLabel=locale==='en'&&props.party.total===1?'person':c.people;
  const emptyCopy=locale==='ja'?['メッセージはまだありません','ツアーチャットは開いています。連絡事項はこちらに表示されます。']:locale==='en'?['No messages yet','Your trip chat is open. Updates and messages will appear here.']:locale==='vi'?['Chưa có tin nhắn','Nhóm trò chuyện chuyến đi đã mở. Thông báo và tin nhắn sẽ xuất hiện tại đây.']:['暂无消息','行程群聊已开启，通知和成员消息会显示在这里。'];
  const attachmentTitle=locale==='ja'?'送信する内容':locale==='en'?'Send content':locale==='vi'?'Gửi nội dung':'发送内容';
  const chooseLanguage=(next:ChatLanguage)=>{props.onLocaleChange?.(next);setTranslationMenu(false)};
  const send=(value=draft)=>{const text=value.trim();if(!text||ended)return;if(props.onSend)props.onSend(text);else setDemoMessages(items=>[...items,{id:crypto.randomUUID(),senderId:'me',name:c.me,role:'passenger',time:new Date().toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}),content:text}]);setDraft('');setQuick(false)};
  useEffect(()=>{const list=scrollRef.current;if(!list||!stickToBottom.current)return;list.scrollTop=list.scrollHeight},[localMessages.length,props.meetingContext?.revision]);
  const callGuide=(event:React.MouseEvent)=>{event.stopPropagation();const url=guideTelephoneUrl(props.guide.phone);if(url&&window.confirm(c.confirmCall))window.location.href=url};
  return <div className="passenger-chat-page">
    <header className="pc-header"><Link to="/app/messages" aria-label={c.back}>‹</Link><div><b>{props.tripName}</b><span><i className={`pc-status ${props.status}`}/>{c.status[props.status]}{stageLabel?` · ${stageLabel}`:''} · {props.party.total} {peopleLabel}</span></div><button className="pc-translation-status" type="button" aria-label={c.translate} onClick={()=>setTranslationMenu(v=>!v)}>🌐 {activeLanguageLabel}</button><button type="button" aria-label={c.more} onClick={()=>setMenu(v=>!v)}>•••</button>{translationMenu&&<div className="pc-popover pc-language-menu">{chatLanguages.map(item=><button key={item.code} className={activeLanguage===item.code?'active':''} onClick={()=>chooseLanguage(item.code)}>{item.label}</button>)}</div>}{menu&&<div className="pc-popover pc-more-menu">{[c.members,c.notifications,c.emergency,c.feedback].map(item=><button key={item}>{item}</button>)}</div>}</header>
    <section className={`pc-meeting-shell ${expanded?'expanded':''} ${urgency?.late?'late':''}`}>
      <div className="pc-meeting-bar" role="button" tabIndex={0} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setExpanded(v=>!v)}}}>
        <button className="pc-icon-button" type="button" aria-label={c.callGuide} disabled={!guideTelephoneUrl(props.guide.phone)} onClick={callGuide}><PhoneIcon/></button>{props.mapHref?<Link className="pc-icon-button" to={props.mapHref} aria-label={c.navigate} onClick={event=>event.stopPropagation()}><MapIcon/></Link>:<button className="pc-icon-button" type="button" aria-label={c.navigate} disabled><MapIcon/></button>}<b>{stop.meetingTime}{c.meetingSuffix}</b><span title={stop.meetingPointName}>{stop.meetingPointName}</span><em>{props.party.distanceMeters==null?'--':`${props.party.distanceMeters}m`}</em><i className="pc-chevron" aria-hidden="true">⌄</i>
      </div>
      <div className={`pc-time-progress ${urgency?.tone}`} aria-label={urgency?.late?c.late:`${c.remaining}${urgency?.minutesRemaining}${c.minutes}`}><span style={{width:`${urgency?.progress??0}%`}}/></div>
      {expanded&&<MeetingDetails {...props} stop={stop} urgency={urgency!} lateMinutes={lateMinutes} onLate={()=>setLateMenu(true)} onNavigate={()=>openWalkingNavigation({latitude:stop.latitude,longitude:stop.longitude,destinationName:stop.meetingPointName})}/>}
    </section>
    {lateMenu&&<div className="pc-modal-backdrop" role="presentation" onClick={()=>!lateSaving&&setLateMenu(false)}>
      <div className="pc-modal" role="dialog" aria-modal="true" aria-label={c.lateReport} onClick={e=>e.stopPropagation()}>
        <h2>{c.lateReport}</h2>
        {([5,10,15] as const).map(minutes=><button key={minutes} disabled={lateSaving} onClick={async () => {
          setLateSaving(true);
          const ok = (await props.onLate?.(minutes)) ?? true;
          setLateSaving(false);
          if (ok) {
            setLateMinutes(minutes);
            setLateMenu(false);
          }
        }}>{minutes===15?c.lateOptionPlus:c.lateOption.replace('{minutes}',String(minutes))}</button>)}
        <button disabled={lateSaving} onClick={()=>setLateMenu(false)}>{c.cancel}</button>
      </div>
    </div>}
    <div className="pc-chat-scroll" ref={scrollRef} onScroll={event=>{const node=event.currentTarget;stickToBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<48}}>
      <div className="pc-day-divider"><span>{c.dateToday}</span></div>
      {props.meetingContext&&<MeetingArrivalNotice locale={locale} context={props.meetingContext} passengers={props.arrivalPassengers??[]} disabled={ended||!props.meetingActive} onArrive={props.onArrive}/>}
      {localMessages.length===0&&<div className="pc-empty-state"><span aria-hidden="true">◇</span><b>{emptyCopy[0]}</b><p>{emptyCopy[1]}</p></div>}
      {localMessages.map((message,index)=><MessageView key={message.id} message={message} previous={localMessages[index-1]} own={message.senderId==='me'} acknowledged={acked.includes(message.id)} originalOpen={originals.includes(message.id)} onAcknowledge={()=>setAcked(v=>[...v,message.id])} onOriginal={()=>setOriginals(v=>v.includes(message.id)?v.filter(id=>id!==message.id):[...v,message.id])}/>) }
    </div>
    {moreOpen&&props.renderMoreControls&&<div className="pc-modal-backdrop pc-composer-backdrop" role="presentation" onClick={()=>setMoreOpen(false)}><section className="pc-modal pc-composer-sheet" role="dialog" aria-modal="true" aria-label={c.more} onClick={event=>event.stopPropagation()}><i className="pc-sheet-handle" aria-hidden="true"/><h2>{attachmentTitle}</h2><div className="pc-sheet-actions">{props.renderMoreControls(()=>setMoreOpen(false))}</div></section></div>}
    <footer className="pc-composer">{ended&&<div className="pc-readonly">{props.readOnlyNotice??c.closed}</div>}{quick&&<div className="pc-quick-phrases">{c.phrases.map((item:string)=><button key={item} onClick={()=>send(item)}>{item}</button>)}</div>}<div className="pc-compose-row"><button className="pc-more-trigger" type="button" aria-expanded={moreOpen} aria-label={c.more} disabled={ended||!props.renderMoreControls} onClick={()=>setMoreOpen(value=>!value)}>＋</button><textarea aria-label={c.input} rows={1} value={draft} disabled={ended} onChange={e=>setDraft(e.target.value)} onInput={e=>{e.currentTarget.style.height='auto';e.currentTarget.style.height=`${Math.min(e.currentTarget.scrollHeight,120)}px`}} placeholder={ended?(props.readOnlyNotice??c.closed):c.input}/><button className="pc-send" disabled={ended||!draft.trim()} onClick={()=>send()}>{c.send}</button></div></footer>
  </div>
}

function MeetingDetails({stop,party,guide,stops,urgency,arrivalPassengers,lateMinutes,meetingActive,onLate,onNavigate}:Omit<PassengerChatRoomProps,'onArrive'|'onLate'>&{stop:ItineraryStop;urgency:ReturnType<typeof meetingUrgency>;lateMinutes:5|10|15|null;onLate:()=>void;onNavigate:()=>void}){
  const c=useChatCopy();const {state}=useApp();const arrival=arrivalCopy(state.ui.locale??'zh-CN');
  const arrivals=arrivalPassengers??[];const boarded=arrivals.length>0&&arrivals.every(item=>item.status==='boarded');
  const arrived=arrivals.length>0&&arrivals.every(item=>item.status==='at_meeting_point'||item.status==='boarded');
  return <div className="pc-meeting-details"><div className="pc-detail-metrics"><span><small>{c.remaining}</small><b>{urgency.late?c.late:`${Math.max(0,urgency.minutesRemaining)} ${c.minutes}`}</b></span><span><small>{c.distance}</small><b>{party.distanceMeters==null?'--':`${party.distanceMeters} m`}</b></span><span><small>{c.walk}</small><b>{party.walkMinutes==null?'--':`${party.walkMinutes} ${c.minutes}`}</b></span></div><div className="pc-landmark">{stop.meetingPointPhoto&&<img src={stop.meetingPointPhoto} alt={c.meetingPhotoAlt}/>}<div><b>{stop.meetingPointName}</b><p>{stop.meetingPointDescription}</p><button onClick={onNavigate}>{c.navigate}</button></div></div><div className="pc-checkin"><div><small>{c.ownCheckin}</small><b>{boarded?arrival.boarded:arrived?arrival.arrived:lateMinutes==null?c.notArrived:lateMinutes===15?c.lateOptionPlus:c.lateOption.replace('{minutes}',String(lateMinutes))}</b><span>{c.groupProgress} {party.arrived}/{party.total} {c.people}</span></div>{meetingActive&&<span className="pc-checkin-hint">{c.arrived}</span>}<button onClick={onLate}>{c.mayBeLate}</button></div><section className="pc-guide-vehicle"><h3>{c.guideVehicle}</h3><div className="pc-guide-row"><i>{guide.avatar}</i><span><b>{guide.name}</b><small>{guide.role}{guide.phone?` · ${guide.phone}`:''}</small></span></div><p>{guide.vehicle.type} · {guide.vehicle.color} · <b>{guide.vehicle.plate}</b>{guide.vehicle.photoUrl&&<> · <a href={guide.vehicle.photoUrl} target="_blank" rel="noreferrer">{c.vehiclePhoto}</a></>}</p></section><section className="pc-today"><h3>{c.today}</h3>{stops.map((item,index)=><div className={item.id===stop.id?'current':item.status} key={item.id}><i>{item.status==='completed'?'✓':index+1}</i><span><b>{item.name}</b><small>{item.meetingTime} · {item.meetingPointName}{item.id===stop.id&&<span className="pc-current-marker" aria-label={c.currentMeeting}>▲</span>}</small></span><em>{item.id===stop.id?c.current:item.status==='completed'?c.completed:index===stops.indexOf(stop)+1?c.next:c.upcoming}</em></div>)}</section></div>
}

const arrivalCopy=(locale:string)=>({
  'zh-CN':{title:'集合已开始',place:'集合地点',time:'集合时间',prompt:'请到达集合地点后确认。',action:'📍 我已到达',busy:'正在确认…',arrived:'✓ 已到达',boarded:'✓ 已登车',choose:'请选择已到达的同行乘客',confirm:'确认到达',cancel:'取消',error:'报到未保存，请检查网络后重试。',retry:'重试'},
  'zh-TW':{title:'集合已開始',place:'集合地點',time:'集合時間',prompt:'請抵達集合地點後確認。',action:'📍 我已抵達',busy:'正在確認…',arrived:'✓ 已抵達',boarded:'✓ 已登車',choose:'請選擇已抵達的同行乘客',confirm:'確認抵達',cancel:'取消',error:'報到未儲存，請檢查網路後重試。',retry:'重試'},
  ja:{title:'集合開始',place:'集合場所',time:'集合時刻',prompt:'集合場所に到着後、確認してください。',action:'📍 到着しました',busy:'確認中…',arrived:'✓ 到着済み',boarded:'✓ 乗車済み',choose:'到着した同行者を選択してください',confirm:'到着を確認',cancel:'キャンセル',error:'到着情報を保存できませんでした。再試行してください。',retry:'再試行'},
  en:{title:'Meeting started',place:'Meeting point',time:'Meeting time',prompt:'Confirm after you arrive at the meeting point.',action:'📍 I have arrived',busy:'Confirming…',arrived:'✓ Arrived',boarded:'✓ Boarded',choose:'Select the travelers who have arrived',confirm:'Confirm arrival',cancel:'Cancel',error:'Arrival was not saved. Check your connection and retry.',retry:'Retry'},
  ko:{title:'집합 시작',place:'집합 장소',time:'집합 시간',prompt:'집합 장소에 도착한 후 확인해 주세요.',action:'📍 도착했습니다',busy:'확인 중…',arrived:'✓ 도착',boarded:'✓ 탑승',choose:'도착한 동행자를 선택하세요',confirm:'도착 확인',cancel:'취소',error:'도착 상태를 저장하지 못했습니다. 다시 시도하세요.',retry:'다시 시도'},
  es:{title:'Punto de encuentro activo',place:'Lugar',time:'Hora',prompt:'Confirma cuando llegues al punto de encuentro.',action:'📍 Ya llegué',busy:'Confirmando…',arrived:'✓ Llegó',boarded:'✓ Embarcó',choose:'Selecciona a quienes ya llegaron',confirm:'Confirmar llegada',cancel:'Cancelar',error:'No se guardó la llegada. Inténtalo de nuevo.',retry:'Reintentar'},
  vi:{title:'Bắt đầu tập trung',place:'Điểm tập trung',time:'Thời gian',prompt:'Hãy xác nhận sau khi đến điểm tập trung.',action:'📍 Tôi đã đến',busy:'Đang xác nhận…',arrived:'✓ Đã đến',boarded:'✓ Đã lên xe',choose:'Chọn những người đã đến',confirm:'Xác nhận đã đến',cancel:'Hủy',error:'Chưa lưu được trạng thái. Vui lòng thử lại.',retry:'Thử lại'},
  ne:{title:'भेला सुरु भयो',place:'भेला हुने स्थान',time:'भेला हुने समय',prompt:'स्थानमा पुगेपछि पुष्टि गर्नुहोस्।',action:'📍 म आइपुगेँ',busy:'पुष्टि हुँदैछ…',arrived:'✓ आइपुगेको',boarded:'✓ चढिसकेको',choose:'आइपुगेका सहयात्री छान्नुहोस्',confirm:'आगमन पुष्टि',cancel:'रद्द',error:'आगमन सुरक्षित भएन। फेरि प्रयास गर्नुहोस्।',retry:'फेरि प्रयास'}
}[locale]??{title:'Meeting started',place:'Meeting point',time:'Meeting time',prompt:'Confirm after you arrive at the meeting point.',action:'📍 I have arrived',busy:'Confirming…',arrived:'✓ Arrived',boarded:'✓ Boarded',choose:'Select the travelers who have arrived',confirm:'Confirm arrival',cancel:'Cancel',error:'Arrival was not saved. Check your connection and retry.',retry:'Retry'});

function MeetingArrivalNotice({locale,context,passengers,disabled,onArrive}:{locale:string;context:NonNullable<PassengerChatRoomProps['meetingContext']>;passengers:ArrivalPassenger[];disabled:boolean;onArrive?:PassengerChatRoomProps['onArrive']}){
  const copy=arrivalCopy(locale);const [busy,setBusy]=useState(false);const [error,setError]=useState(false);const [selecting,setSelecting]=useState(false);const [selected,setSelected]=useState<string[]>([]);
  const current=passengers.filter(item=>item.status==='boarded'||(item.status==='at_meeting_point'&&item.meetingRevision===context.revision));
  const actionable=passengers.filter(item=>item.status!=='boarded'&&!(item.status==='at_meeting_point'&&item.meetingRevision===context.revision));
  const allBoarded=passengers.length>0&&passengers.every(item=>item.status==='boarded');const allArrived=passengers.length>0&&current.length===passengers.length;
  const submit=async(ids:string[])=>{if(busy||disabled||!ids.length||!onArrive)return;setBusy(true);setError(false);const ok=await onArrive(ids,context.revision);setBusy(false);if(!ok)setError(true);else{setSelecting(false);setSelected([])}};
  const begin=()=>{if(actionable.length===1)void submit([actionable[0].passengerId]);else if(actionable.length>1)setSelecting(true)};
  return <article className="pc-arrival-notice" data-room-id={context.roomId} data-vehicle-group-id={context.vehicleGroupId} data-meeting-revision={context.revision}><header><b>📍 {copy.title}</b><small>#{context.revision}</small></header><dl><div><dt>{copy.place}</dt><dd>{context.place}</dd></div><div><dt>{copy.time}</dt><dd>{context.time}</dd></div></dl><p>{copy.prompt}</p>{allBoarded?<span className="pc-arrival-result">{copy.boarded}</span>:allArrived?<span className="pc-arrival-result">{copy.arrived}</span>:<button type="button" disabled={disabled||busy||!onArrive} onClick={begin}>{busy?copy.busy:error?copy.retry:copy.action}</button>}{error&&<p role="alert" className="pc-arrival-error">{copy.error}</p>}{selecting&&<div className="pc-modal-backdrop" role="presentation" onClick={()=>!busy&&setSelecting(false)}><section className="pc-modal pc-arrival-picker" role="dialog" aria-modal="true" aria-label={copy.choose} onClick={event=>event.stopPropagation()}><h2>{copy.choose}</h2>{passengers.map(item=>{const locked=item.status==='boarded'||(item.status==='at_meeting_point'&&item.meetingRevision===context.revision);return <label key={item.passengerId}><input type="checkbox" checked={locked||selected.includes(item.passengerId)} disabled={locked||busy} onChange={event=>setSelected(value=>event.target.checked?[...value,item.passengerId]:value.filter(id=>id!==item.passengerId))}/><span>{item.label}</span><small>{item.status==='boarded'?copy.boarded:locked?copy.arrived:''}</small></label>})}<div><button type="button" disabled={busy||selected.length===0} onClick={()=>void submit(selected)}>{busy?copy.busy:copy.confirm}</button><button type="button" disabled={busy} onClick={()=>setSelecting(false)}>{copy.cancel}</button></div></section></div>}</article>;
}

function MessageView({message,previous,own,acknowledged,originalOpen,onAcknowledge,onOriginal}: {message:ChatMessage;previous?:ChatMessage;own:boolean;acknowledged:boolean;originalOpen:boolean;onAcknowledge:()=>void;onOriginal:()=>void}){
  const c=useChatCopy();
  if(message.kind==='unread')return <div className="pc-unread"><span>{c.unread}</span></div>;
  if(message.kind==='meeting-change')return <article className={`pc-change-notice ${acknowledged?'acknowledged':''}`}><header><b>! {c.changed}</b><time>{message.time}</time></header><p><span className="pc-previous-meeting">{message.oldValue}</span><strong>{message.newValue}<span className="pc-current-marker" aria-label={c.currentMeeting}>▲</span></strong><small>{c.reason}：{message.reason}</small></p>{!acknowledged&&<button onClick={onAcknowledge}>{c.ack}</button>}</article>;
  const merged=previous?.senderId===message.senderId&&previous?.kind==null;
  const display=message.translated??message.content;
  const role=message.role??'passenger';
  return <article className={`pc-message ${own?'own':'other'} role-${role} ${merged?'merged':''}`}>{!own&&<div className="pc-avatar" aria-hidden="true">{message.name?.slice(0,1)}</div>}<div className="pc-message-stack">{!merged&&!own&&<header><b>{message.name}</b><span>{roleLabel(c)[role]}</span></header>}<div className="pc-bubble">{message.photo??message.location??<p>{display}</p>}{message.translated&&<small>{c.machineTranslation}</small>}{message.translated&&originalOpen&&<blockquote>{message.content}</blockquote>}</div><div className="pc-message-meta"><time>{message.time}</time><button>{c.reply}</button><button onClick={()=>void navigator.clipboard?.writeText(display??'')}>{c.copy}</button>{message.translated?<button onClick={onOriginal}>{originalOpen?c.hideOriginal:c.original}</button>:<button>{c.translateAction}</button>}</div></div></article>;
}
