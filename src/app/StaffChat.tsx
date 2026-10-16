import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {useApp} from './store';
import type {StaffTask} from './StaffPortal';
import {ChatPhotoUpload} from './ChatPhoto';
import {passengerLocales,type PassengerLocale} from '../shared/i18n/passengerLocale';
import {isSeedEnabled} from '../shared/config/businessRules';
import './staffChat.css';

type Message={id:string;content:string;original_content?:string|null;created_at:string;important?:boolean;author_id?:string;author_name?:string;trip_room_message_translations?:Array<{target_language:string;translated_content:string}>};
type Member={passenger_id:string;passenger_label:string};
export function StaffChat({task}:{task:StaffTask}){
  const {services,state}=useApp();
  const preview=!services&&isSeedEnabled;
  const [messages,setMessages]=useState<Message[]>(()=>preview?[
    {id:'preview-system',content:'集合已开始，请到达后确认游客状态。',created_at:new Date(Date.now()-12*60_000).toISOString(),important:true,author_name:'系统通知'},
    {id:'preview-guest',content:'我们已经到集合点附近了。',created_at:new Date(Date.now()-7*60_000).toISOString(),author_id:'preview-guest',author_name:'游客 A'},
    {id:'preview-own',content:'收到，请在车辆标识旁等候。',created_at:new Date(Date.now()-5*60_000).toISOString(),author_id:'preview-staff',author_name:'我'},
  ]:[]);
  const [members,setMembers]=useState<Member[]>([]);
  const [showMembers,setShowMembers]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [draft,setDraft]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(preview);
  const [failed,setFailed]=useState(false);
  const [currentUser,setCurrentUser]=useState<string|null>(preview?'preview-staff':null);
  const [language,setLanguage]=useState<PassengerLocale>(state.ui.locale??'zh-CN');
  const [originals,setOriginals]=useState<Set<string>>(()=>new Set());
  const [sharing,setSharing]=useState(false);
  const requestKey=useRef(crypto.randomUUID());
  const composerRef=useRef<HTMLTextAreaElement|null>(null);
  const listRef=useRef<HTMLDivElement|null>(null);
  const stickToBottom=useRef(true);
  const refreshRef=useRef<()=>Promise<void>>(async()=>{});
  const open=task.room_status==='open'&&Boolean(task.room_id);
  useEffect(()=>{
    let active=true;let subscription:{close():void}|null=null;let inFlight=false;
    if(!services||!task.room_id)return;
    const refresh=async()=>{
      if(inFlight)return;inFlight=true;
      try{
        const rows=await services.tripRoom.loadMessages(task.room_id!);
        if(active){setMessages(rows as Message[]);setLoaded(true);setFailed(false)}
      }catch{if(active){setFailed(true);setLoaded(true)}}finally{inFlight=false}
    };
    refreshRef.current=refresh;void refresh();
    void services.currentUser().then(user=>{if(active)setCurrentUser(user?.id??null)}).catch(()=>{if(active)setCurrentUser(null)});
    if(typeof services.tripRoom.loadDriverLocation==='function')void services.tripRoom.loadDriverLocation(task.vehicle_group_id).then(value=>{if(active)setSharing(Boolean(value))});
    void services.realtime.subscribeTripRoom(task.room_id,()=>void refresh(),()=>void refresh(),()=>void refresh()).then(live=>{if(active)subscription=live;else live.close()}).catch(()=>{if(active)setNotice('实时连接暂不可用，正在定时刷新消息。')});
    const timer=window.setInterval(()=>void refresh(),15000);
    window.addEventListener('focus',refresh);
    return()=>{active=false;subscription?.close();window.clearInterval(timer);window.removeEventListener('focus',refresh)};
  },[services,task.room_id,task.vehicle_group_id]);
  const send=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!open||!services||!task.room_id||!draft.trim())return;
    setBusy(true);setNotice('');stickToBottom.current=true;
    try{
      const ok=await services.tripRoom.sendMessage(task.room_id,draft,requestKey.current);
      if(!ok){setNotice('发送未确认，内容已保留，可重试。');return}
      setDraft('');requestKey.current=crypto.randomUUID();setNotice('消息已保存到本车群。');await refreshRef.current();
    }catch{setNotice('网络异常，内容已保留；重试使用同一请求编号。')}
    finally{setBusy(false)}
  };
  const loadMembers=async()=>{
    if(showMembers){setShowMembers(false);return}
    setShowMembers(true);
    try{if(services)setMembers(await services.tripRoom.loadAttendance(task.vehicle_group_id) as Member[])}
    catch{setNotice('成员读取失败，请重试');setShowMembers(false)}
  };
  const locate=()=>{
    if(!navigator.geolocation||!services||!task.room_id){setNotice('设备不支持定位，或本车群尚未就绪。');return}
    setNotice('正在读取司机位置；定位未授权时不会共享旧位置。');
    navigator.geolocation.getCurrentPosition(position=>{
      void services.tripRoom.publishDriverLocation(task.vehicle_group_id,{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:Number.isFinite(position.coords.accuracy)?position.coords.accuracy:null},15).then(ok=>{
        setSharing(ok);setNotice(ok?'司机位置已更新并向本车旅客共享 15 分钟。':'司机位置未能共享；请检查房间状态、定位和本车工作人员权限。');
      }).catch(()=>setNotice('司机位置未能共享；请检查网络后重试。'));
    },()=>setNotice('定位不可用，司机位置没有被共享。'),{enableHighAccuracy:true,timeout:10000,maximumAge:15000});
  };
  const stopLocation=async()=>{
    if(!services)return;
    const ok=await services.tripRoom.stopDriverLocation(task.vehicle_group_id);
    if(ok)setSharing(false);
    setNotice(ok?'司机位置共享已停止；旅客不会再将旧位置显示为实时位置。':'没有可停止的位置共享或权限不足。');
  };
  useEffect(()=>{const input=composerRef.current;if(!input)return;if(!draft){input.style.height='44px';return}input.style.height='auto';input.style.height=`${Math.min(Math.max(input.scrollHeight,44),120)}px`},[draft]);
  useEffect(()=>{const list=listRef.current;if(!list||!stickToBottom.current)return;list.scrollTop=list.scrollHeight},[messages]);
  return <section className="staff-chat-v2">
    <header className="staff-chat-room-head"><Link aria-label="返回消息列表" to="/staff/messages">‹</Link><div><h1>{task.trip_title}</h1><small>{task.vehicle_label??'车牌待确认'} · {open?'本车群开放':'本车群只读／尚未开放'} · {task.journey_status==='meeting'?'集合中':task.journey_status==='in_progress'?'行程中':task.journey_status==='completed'?'已完成':'待集合'}</small></div></header>
      <div className="staff-chat-tools"><button type="button" onClick={()=>void loadMembers()} aria-expanded={showMembers}>群成员</button><Link to={`/staff/tasks/${task.staff_assignment_id}/meeting`}>集合信息</Link>{sharing?<button type="button" onClick={()=>void stopLocation()}>停止共享位置</button>:<button type="button" onClick={locate}>共享实时位置</button>}<Link to={`/staff/tasks/${task.staff_assignment_id}/support`}>联系运营</Link></div>
    {showMembers&&<section className="staff-chat-members"><h3>本车工作人员</h3><p>司机：{task.driver_name??'待确认'}</p><p>导游：{task.guide_name??'未分配'}</p><h3>本车旅客</h3>{members.map(member=><p key={member.passenger_id}>{member.passenger_label}</p>)}<small>仅展示本车授权名单；此接口未提供联系电话，不编造号码。</small></section>}
    <div ref={listRef} className="staff-chat-list" aria-label="本车聊天记录" onScroll={event=>{const node=event.currentTarget;stickToBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<36}}>
      {!loaded?<p role="status">正在读取本车消息…</p>:failed?<p role="alert">消息读取失败。<button onClick={()=>void refreshRef.current()}>重试</button></p>:messages.length===0?<p>暂无消息。</p>:messages.map(message=>{
        const original=message.original_content??message.content;
        const translation=message.author_id===currentUser?null:message.trip_room_message_translations?.find(item=>item.target_language===language)?.translated_content;
        return <article className={`${message.author_id===currentUser?'own':''}${message.important?' system':''}`.trim()} key={message.id}><header><b>{message.author_name??(message.important?'重要通知':'本车成员')}</b><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'})}</time></header><p>{translation&&!originals.has(message.id)?translation:original}</p>{translation&&<button onClick={()=>setOriginals(value=>{const next=new Set(value);if(next.has(message.id))next.delete(message.id);else next.add(message.id);return next})}>{originals.has(message.id)?'查看译文':'查看原文'}</button>}</article>;
      })}
    </div>
    <div className="staff-chat-compose-wrap">
      {notice&&<p role="status">{notice}</p>}
      {expanded&&<div className="staff-chat-tools" aria-label="更多聊天功能">
        {services&&task.room_id&&<><ChatPhotoUpload repository={services.tripRoom} roomId={task.room_id} locale={language} disabled={!open||busy} presentation="more" source="library" onSent={()=>{setExpanded(false);void refreshRef.current()}}/><ChatPhotoUpload repository={services.tripRoom} roomId={task.room_id} locale={language} disabled={!open||busy} presentation="more" source="camera" onSent={()=>{setExpanded(false);void refreshRef.current()}}/></>}
        <label>翻译设置<select aria-label="目标语言" value={language} onChange={event=>setLanguage(event.target.value as PassengerLocale)}>{passengerLocales.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        {sharing?<button disabled={!open||busy} onClick={()=>void stopLocation()}>停止位置共享</button>:<button disabled={!open||busy} onClick={locate}>开始／更新位置</button>}
        <Link to={`/staff/tasks/${task.staff_assignment_id}/support`}>联系运营</Link>
      </div>}
      <form className="staff-composer" onSubmit={event=>void send(event)}>
        <button type="button" aria-label="更多聊天功能" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>+</button>
        <textarea ref={composerRef} aria-label="发送到本车群组" value={draft} maxLength={1000} rows={1} disabled={!open||busy} placeholder={open?'输入本车消息':'当前群不可发送'} onChange={event=>{setDraft(event.target.value);requestKey.current=crypto.randomUUID()}}/>
        <button disabled={!open||busy||!draft.trim()}>{busy?'发送中':'发送'}</button>
      </form>
    </div>
  </section>;
}
