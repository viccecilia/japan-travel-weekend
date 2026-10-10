import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {useApp} from '../store';
import type {OperationsMeetingPointTemplate} from '../../shared/integrations/supabaseOperations';

const empty={name:'',address:'',latitude:'',longitude:'',meetingNote:'',active:true};

export function MeetingPointLibrary(){
  const {services}=useApp();
  const [items,setItems]=useState<OperationsMeetingPointTemplate[]>([]);
  const [editing,setEditing]=useState<OperationsMeetingPointTemplate|null>(null);
  const [creating,setCreating]=useState(false);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    if(!services)return;
    const result=await services.operations.listMeetingPointTemplates(true);
    setItems(result.data);setNotice(result.error?`读取失败：${result.error}`:'');
  },[services]);
  useEffect(()=>{void load()},[load]);
  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!services)return;
    const form=new FormData(event.currentTarget);
    const input={name:String(form.get('name')).trim(),address:String(form.get('address')).trim(),latitude:Number(form.get('latitude')),longitude:Number(form.get('longitude')),meetingNote:String(form.get('meetingNote')).trim()};
    setBusy(true);
    const result=editing
      ? await services.operations.updateMeetingPointTemplate({...input,id:editing.id,expectedVersion:editing.version})
      : await services.operations.createMeetingPointTemplate({...input,active:form.get('active')==='on'});
    setBusy(false);
    if(!result.ok){setNotice(`保存失败：${result.error}`);return;}
    setNotice(editing?'集合地点已更新；历史班次保存的集合快照不会改变。':'集合地点已新增，可用于创建新班次。');
    setEditing(null);setCreating(false);await load();
  };
  const toggle=async(item:OperationsMeetingPointTemplate)=>{
    if(!services)return;setBusy(true);
    const result=await services.operations.setMeetingPointTemplateActive(item.id,item.version,!item.active);
    setBusy(false);setNotice(result.ok?`集合地点已${item.active?'停用':'启用'}；历史班次不受影响。`:`操作失败：${result.error}`);
    if(result.ok)await load();
  };
  const selected=editing?{name:editing.name,address:editing.address,latitude:String(editing.latitude),longitude:String(editing.longitude),meetingNote:editing.meetingNote,active:editing.active}:empty;
  return <main className="operations-page">
    <header className="departure-calendar-page-head"><div><span>产品与班次 / 集合地点库</span><h1>集合地点库</h1><p>模板只用于新建班次；保存到班次后的名称、地址、经纬度和说明不会随模板修改。</p></div><Link className="button secondary" to="/app/operations/departures?action=create">返回创建班次</Link></header>
    <section className="operations-section">
      <header><div><span>MEETING POINTS</span><h2>集合地点模板</h2></div><button className="button" type="button" onClick={()=>{setEditing(null);setCreating(true);setNotice('')}}>＋ 新增集合地点</button></header>
      {notice&&<p className="operations-notice">{notice}</p>}
      <div className="operations-table-scroll"><table className="operations-table"><thead><tr><th>名称</th><th>地址</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><b>{item.name}</b><small>{item.latitude} / {item.longitude}</small></td><td>{item.address}</td><td>{item.active?'启用':'停用'}</td><td>{new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(new Date(item.updatedAt))}</td><td><div className="operations-task-actions"><button type="button" onClick={()=>{setEditing(item);setCreating(false);setNotice('')}}>编辑</button><button type="button" disabled={busy} onClick={()=>void toggle(item)}>{item.active?'停用':'启用'}</button></div></td></tr>)}</tbody></table></div>
      {!items.length&&!notice&&<p className="operations-empty">尚未建立集合地点。请先新增一个模板。</p>}
    </section>
    {(creating||editing)&&<section className="operations-section"><header><div><span>{editing?'EDIT':'CREATE'}</span><h2>{editing?'编辑集合地点':'新增集合地点'}</h2></div><button type="button" className="button secondary" onClick={()=>{setEditing(null);setCreating(false)}}>取消</button></header>
      <form className="operations-controls" onSubmit={save} key={editing?.id??'new'}>
        <label>名称 *<input name="name" defaultValue={selected.name} required minLength={2}/></label>
        <label>地址 *<input name="address" defaultValue={selected.address} required minLength={5}/></label>
        <label>纬度 *<input name="latitude" type="number" min="-90" max="90" step="0.000001" defaultValue={selected.latitude} required/></label>
        <label>经度 *<input name="longitude" type="number" min="-180" max="180" step="0.000001" defaultValue={selected.longitude} required/></label>
        <label className="operations-control-wide">集合说明<textarea name="meetingNote" defaultValue={selected.meetingNote} rows={3}/></label>
        {!editing&&<label className="operations-checkbox"><input name="active" type="checkbox" defaultChecked={selected.active}/>立即启用</label>}
        <button className="button" disabled={busy}>{busy?'正在保存…':'保存集合地点'}</button>
      </form>
    </section>}
  </main>;
}
