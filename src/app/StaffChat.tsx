import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {useApp} from './store';
import type {StaffTask} from './StaffPortal';
import {ChatPhotoUpload} from './ChatPhoto';
import {passengerLocales,type PassengerLocale} from '../shared/i18n/passengerLocale';
import './staffChat.css';

type Message={id:string;content:string;original_content?:string|null;created_at:string;important?:boolean;author_id?:string;author_name?:string;trip_room_message_translations?:Array<{target_language:string;translated_content:string}>};
type Member={passenger_id:string;passenger_label:string};
export function StaffChat({task}:{task:StaffTask}){
  const {services,state}=useApp();
  const [messages,setMessages]=useState<Message[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [showMembers,setShowMembers]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [draft,setDraft]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [failed,setFailed]=useState(false);
  const [currentUser,setCurrentUser]=useState<string|null>(null);
  const [language,setLanguage]=useState<PassengerLocale>(state.ui.locale??'zh-CN');
  const [originals,setOriginals]=useState<Set<string>>(()=>new Set());
  const requestKey=useRef(crypto.randomUUID());
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
    void services.realtime.subscribeTripRoom(task.room_id,()=>void refresh(),()=>void refresh(),()=>void refresh()).then(live=>{if(active)subscription=live;else live.close()}).catch(()=>{if(active)setNotice('实时连接暂不可用，正在定时刷新消息。')});
    const timer=window.setInterval(()=>void refresh(),15000);
    window.addEventListener('focus',refresh);
    return()=>{active=false;subscription?.close();window.clearInterval(timer);window.removeEventListener('focus',refresh)};
  },[services,task.room_id]);
  const send=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!open||!services||!task.room_id||!draft.trim())return;
    setBusy(true);setNotice('');
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
        setNotice(ok?'司机位置已更新并向本车旅客共享 15 分钟。':'司机位置未能共享；请检查房间状态、定位和本车工作人员权限。');
      }).catch(()=>setNotice('司机位置未能共享；请检查网络后重试。'));
    },()=>setNotice('定位不可用，司机位置没有被共享。'),{enableHighAccuracy:true,timeout:10000,maximumAge:15000});
  };
  const stopLocation=async()=>{
    if(!services)return;
    const ok=await services.tripRoom.stopDriverLocation(task.vehicle_group_id);
    setNotice(ok?'司机位置共享已停止；旅客不会再将旧位置显示为实时位置。':'没有可停止的位置共享或权限不足。');
  };
  return <section className="staff-chat-v2">
    <header><h2>{task.trip_title}</h2><small>{task.vehicle_label??'车牌待确认'} · {open?'本车群开放':'本车群只读／尚未开放'}</small>
      <div className="staff-chat-tools"><button type="button" onClick={()=>void loadMembers()} aria-expanded={showMembers}>群成员</button><Link to={`/staff/tasks/${task.staff_assignment_id}/meeting`}>集合信息</Link>
        <label>目标语言<select value={language} onChange={event=>setLanguage(event.target.value as PassengerLocale)}>{passengerLocales.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></label></div>
      <small>已有译文按所选语言显示；缺少译文保留原文，不冒充翻译成功。</small>
    </header>
    {showMembers&&<section className="staff-chat-members"><h3>本车工作人员</h3><p>司机：{task.driver_name??'待确认'}</p><p>导游：{task.guide_name??'未分配'}</p><h3>本车旅客</h3>{members.map(member=><p key={member.passenger_id}>{member.passenger_label}</p>)}<small>仅展示本车授权名单；此接口未提供联系电话，不编造号码。</small></section>}
    <div className="staff-chat-list" aria-label="本车聊天记录">
      {!loaded?<p role="status">正在读取本车消息…</p>:failed?<p role="alert">消息读取失败。<button onClick={()=>void refreshRef.current()}>重试</button></p>:messages.length===0?<p>暂无消息。</p>:messages.map(message=>{
        const original=message.original_content??message.content;
        const translation=message.author_id===currentUser?null:message.trip_room_message_translations?.find(item=>item.target_language===language)?.translated_content;
        return <article className={message.author_id===currentUser?'own':''} key={message.id}><header><b>{message.author_name??(message.important?'重要通知':'本车成员')}</b><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'})}</time></header><p>{translation&&!originals.has(message.id)?translation:original}</p>{translation&&<button onClick={()=>setOriginals(value=>{const next=new Set(value);if(next.has(message.id))next.delete(message.id);else next.add(message.id);return next})}>{originals.has(message.id)?'查看译文':'查看原文'}</button>}</article>;
      })}
    </div>
    <div className="staff-chat-compose-wrap">
      {notice&&<p role="status">{notice}</p>}
      {expanded&&<div className="staff-chat-tools" aria-label="更多聊天功能">
        {services&&task.room_id&&<><ChatPhotoUpload repository={services.tripRoom} roomId={task.room_id} locale={language} disabled={!open||busy} presentation="more" source="library" onSent={()=>{setExpanded(false);void refreshRef.current()}}/><ChatPhotoUpload repository={services.tripRoom} roomId={task.room_id} locale={language} disabled={!open||busy} presentation="more" source="camera" onSent={()=>{setExpanded(false);void refreshRef.current()}}/></>}
        <button disabled={!open||busy} onClick={locate}>开始／更新位置</button>
        <button disabled={!open||busy} onClick={()=>void stopLocation()}>停止位置共享</button>
        <Link to={`/staff/tasks/${task.staff_assignment_id}/support`}>联系运营</Link>
      </div>}
      <form className="staff-composer" onSubmit={event=>void send(event)}>
        <button type="button" aria-label="更多聊天功能" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>+</button>
        <textarea aria-label="发送到本车群组" value={draft} maxLength={1000} rows={2} disabled={!open||busy} placeholder={open?'输入本车消息':'当前群不可发送'} onChange={event=>{setDraft(event.target.value);requestKey.current=crypto.randomUUID()}}/>
        <button disabled={!open||busy||!draft.trim()}>{busy?'发送中':'发送'}</button>
      </form>
    </div>
  </section>;
}
