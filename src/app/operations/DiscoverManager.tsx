import {useEffect,useState} from 'react';
import {useApp} from '../store';
import {initialDiscoverHeroes,type DiscoverHero} from '../../shared/discover';
import {passengerLocales,type PassengerLocale} from '../../shared/i18n/passengerLocale';
import type {OperationsProduct} from '../../shared/integrations/supabaseOperations';
import {prepareDiscoverVideo} from './discoverUpload';
import './discoverManager.css';

export function DiscoverManager() {
 const {services}=useApp();
 const [rows,setRows]=useState<DiscoverHero[]>([]);
 const [products,setProducts]=useState<OperationsProduct[]>([]);
 const [notice,setNotice]=useState('');
 const [loaded,setLoaded]=useState(false);
 const [selected,setSelected]=useState<string|null>(null);
 const [dirty,setDirty]=useState(false);
 const select=(id:string)=>{if(id===selected)return;if(dirty&&!window.confirm('尚有未保存内容，确认切换视频？'))return;setDirty(false);setSelected(id)};
 useEffect(()=>{
   let alive=true;
   void Promise.all([services?.operations.listDiscoverHeroes(true),services?.operations.listProducts()]).then(([result,list])=>{
     if(!alive)return;
     setProducts(list?.data??[]);
     setRows(result?.error?initialDiscoverHeroes:result?.data??[]);
     setNotice(result?.error?'Discover 存储尚不可用：'+result.error+'。以下为初始内容参考，尚未从数据库读取。':list?.error??'');
     setLoaded(!result?.error&&!!result);
   }).catch(error=>{if(alive)setNotice(String(error))});
   return ()=>{alive=false};
 },[services]);
 const edited=rows.find(row=>row.id===selected);
 return <section className="operations-section discover-manager">
   <header><div><span>DISCOVER</span><h2>Discover 视频</h2><p>只维护视频内容，不包含价格、班次或库存。保存后用于发现页展示。</p></div>
   <button type="button" disabled={!loaded} onClick={()=>{if(dirty&&!window.confirm('尚有未保存内容，确认新增视频？'))return;const row:DiscoverHero={id:crypto.randomUUID(),video_url:'',poster_url:'',product_id:null,product_slug:null,translations:{},enabled:false,sort_order:rows.length,version:0};setRows(current=>[...current,row]);setDirty(false);setSelected(row.id)}}>新增视频</button></header>
   {notice&&<p role="status">{notice}</p>}
   <div className="discover-manager-list">{rows.map(row=><button type="button" key={row.id} onClick={()=>select(row.id)} aria-pressed={selected===row.id}>
     <img src={row.poster_url} alt=""/><span><b>{row.translations['zh-CN']?.title||products.find(p=>p.id===row.product_id||p.slug===row.product_slug)?.title||row.product_slug||'未命名视频'}</b><small>{row.product_id||row.product_slug?'路线':'Soul'} · {row.enabled?'启用':'停用'} · 排序 {row.sort_order}</small></span>
   </button>)}</div>
   {edited&&<div onChangeCapture={()=>setDirty(true)}><DiscoverEditor key={edited.id} hero={edited} products={products} writable={loaded} onDeleted={id=>{setRows(current=>current.filter(item=>item.id!==id));setSelected(null);setDirty(false);setNotice('已删除')}} onSaved={row=>{setDirty(false);setRows(current=>current.map(item=>item.id===row.id?row:item));setNotice('已保存；刷新发现页可读取最新内容')}}/></div>}
 </section>;
}
function DiscoverEditor({hero,products,writable,onSaved,onDeleted}:{hero:DiscoverHero;products:OperationsProduct[];writable:boolean;onSaved:(hero:DiscoverHero)=>void;onDeleted:(id:string)=>void}) {
 const {services}=useApp();
 const [draft,setDraft]=useState(hero);
 const [saved,setSaved]=useState(JSON.stringify(hero));
 const [locale,setLocale]=useState<PassengerLocale>('zh-CN');
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState<number|null>(null);
 const [notice,setNotice]=useState('');
 const [retry,setRetry]=useState<File|null>(null);
 const dirty=JSON.stringify(draft)!==saved;
 useEffect(()=>{
   if(!dirty)return;
   const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};
   window.addEventListener('beforeunload',guard);
   // Existing router is declarative; protect link exits without replacing it.
   const click=(event:MouseEvent)=>{if((event.target as Element)?.closest('a[href]')&&!window.confirm('尚有未保存内容，确认离开？')){event.preventDefault();event.stopPropagation()}};
   document.addEventListener('click',click,true);
   return()=>{window.removeEventListener('beforeunload',guard);document.removeEventListener('click',click,true)};
 },[dirty]);
 async function upload(file:File) {
   if(!services||busy||!writable)return;
   setBusy(true);setProgress(0);setNotice('正在校验视频并生成封面…');setRetry(file);
   try{
     const poster=await prepareDiscoverVideo(file);
     const videoResult=await services.operations.uploadProductSpotVideo('discover',draft.id,file,setProgress);
     if(videoResult.error||!videoResult.url)throw new Error(videoResult.error||'视频上传失败');
     const posterResult=await services.operations.uploadProductImage('discover',poster);
     if(posterResult.error||!posterResult.url)throw new Error(posterResult.error||'封面上传失败');
     setDraft(current=>({...current,video_url:videoResult.url!,poster_url:posterResult.url!}));
     setNotice('视频及封面已上传，尚未保存内容');setRetry(null);
   }catch(error){setNotice(error instanceof Error?error.message:String(error))}
   finally{setBusy(false);setProgress(null)}
 }
 async function save(){
   if(!services||busy||!writable)return;
   setBusy(true);setNotice('');
   try{const result=await services.operations.saveDiscoverHero(draft);if(result.error||!result.data)throw new Error(result.error||'保存失败');
     setDraft(result.data);setSaved(JSON.stringify(result.data));onSaved(result.data);setNotice('已保存');
   }catch(error){setNotice((error instanceof Error?error.message:String(error))+'；输入已保留。版本冲突请先核对另一位运营的修改。')}
   finally{setBusy(false)}
 }
 async function remove(){
   if(!services||busy||!writable||draft.version<1)return;
   if(!window.confirm('确定删除这个 Discover 视频吗？删除后游客端将不再显示。'))return;
   setBusy(true);setNotice('');
   try{
     const result=await services.operations.deleteDiscoverHero(draft.id,draft.version);
     if(result.error)throw new Error(result.error);
     onDeleted(draft.id);
   }catch(error){setNotice((error instanceof Error?error.message:String(error))+'；删除失败，输入已保留。')}
   finally{setBusy(false)}
 }
 const text=draft.translations[locale]??{title:'',subtitle:''};
 return <div className="discover-editor">
   <video src={draft.video_url||undefined} poster={draft.poster_url||undefined} controls playsInline preload="metadata"/>
   <div className="discover-editor-fields">
     <label>上传／更换视频（H.264/AAC MP4，最大50MB）<input type="file" accept="video/mp4,.mp4" disabled={busy||!writable} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file)}}/></label>
     {progress!==null&&<progress max={100} value={progress}/>}
     {retry&&!busy&&<button type="button" onClick={()=>void upload(retry)}>重试上传</button>}
     <label>语言<select value={locale} onChange={event=>setLocale(event.target.value as PassengerLocale)}>{passengerLocales.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
     <label>标题<textarea maxLength={240} value={text.title} onChange={event=>setDraft({...draft,translations:{...draft.translations,[locale]:{...text,title:event.target.value}}})}/></label>
     <label>副标题<textarea maxLength={500} value={text.subtitle} onChange={event=>setDraft({...draft,translations:{...draft.translations,[locale]:{...text,subtitle:event.target.value}}})}/></label>
     <small>缺少译文时使用中文；路线标题为空时使用已发布产品名称。</small>
     <label>关联产品（可选）<select value={draft.product_id??products.find(p=>p.slug===draft.product_slug)?.id??''} onChange={event=>{const product=products.find(p=>p.id===event.target.value);setDraft({...draft,product_id:product?.id??null,product_slug:product?.slug??null})}}><option value="">不关联 · Soul 内容</option>{products.map(product=><option value={product.id} key={product.id}>{product.title} · {product.status==='published'?'已发布':'未公开'}</option>)}</select></label>
     <label>排序<input type="number" min={0} max={9999} value={draft.sort_order} onChange={event=>setDraft({...draft,sort_order:Number(event.target.value)})}/></label>
     <label><input type="checkbox" checked={draft.enabled} onChange={event=>setDraft({...draft,enabled:event.target.checked})}/> 启用</label>
     <p role="status">{notice||(!writable?'本地结构预览；数据库迁移未应用，不能保存':dirty?'未保存':'已保存')}</p>
     <button type="button" disabled={busy||!writable||!draft.video_url||!draft.poster_url} onClick={()=>void save()}>{busy?'处理中…':'保存内容'}</button>
     <button className="discover-delete" type="button" disabled={busy||!writable||draft.version<1} onClick={()=>void remove()}>删除此视频</button>
   </div>
 </div>;
}
