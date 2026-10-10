import {useEffect,useRef,useState} from 'react';
import {useApp} from '../store';
import {initialDiscoverHeroes,type DiscoverHero} from '../../shared/discover';
import {passengerLocales,type PassengerLocale} from '../../shared/i18n/passengerLocale';
import type {OperationsProduct} from '../../shared/integrations/supabaseOperations';
import {prepareDiscoverVideo} from './discoverUpload';
import {downloadPackage} from '../../shared/contentPackages';
import {DISCOVER_BATCH_MAX_BYTES,applyDiscoverBatchSelections,buildDiscoverTranslationBatch,previewDiscoverTranslationBatch,type DiscoverBatchPreview} from '../../shared/discoverTranslationBatch';
import './discoverManager.css';

export function DiscoverManager() {
 const {services}=useApp();
 const [rows,setRows]=useState<DiscoverHero[]>([]);
 const [products,setProducts]=useState<OperationsProduct[]>([]);
 const [notice,setNotice]=useState('');
 const [loaded,setLoaded]=useState(false);
 const [selected,setSelected]=useState<string|null>(null);
 const [checkedIds,setCheckedIds]=useState<Set<string>>(new Set());
 const [dirty,setDirty]=useState(false);
 const [importPayload,setImportPayload]=useState<unknown|null>(null);
 const [preview,setPreview]=useState<DiscoverBatchPreview|null>(null);
 const [previewSelected,setPreviewSelected]=useState<Set<string>>(new Set());
 const [batchBusy,setBatchBusy]=useState(false);
 const importRef=useRef<HTMLInputElement>(null);
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
 const allChecked=rows.length>0&&rows.every(row=>checkedIds.has(row.id));
 const checkedRows=rows.filter(row=>checkedIds.has(row.id));
 function exportBatch(){
   if(dirty){setNotice('当前视频有未保存修改，请先保存后再导出翻译包。');return}
   if(!checkedRows.length){setNotice('请先选择要导出的 Discover 视频。');return}
   const result=buildDiscoverTranslationBatch(checkedRows,products);
   if(!result.batch){setNotice(result.issues.map(issue=>issue.message).join('；'));return}
   downloadPackage(`jtw-discover-translations-${checkedRows.length}.json`,result.batch);
   setNotice(`已导出 ${checkedRows.length} 条视频的翻译包；导出未写入数据库。`);
 }
 async function importBatch(file:File){
   if(dirty){setNotice('当前视频有未保存修改，请先保存后再导入翻译包。');return}
   if(file.size>DISCOVER_BATCH_MAX_BYTES){setNotice('翻译包超过 2MB，未读取。');return}
   try{
     const payload=JSON.parse(await file.text()) as unknown;
     const next=previewDiscoverTranslationBatch(payload,rows,products);
     setImportPayload(payload);setPreview(next);setPreviewSelected(new Set(next.entries.filter(item=>item.defaultSelected).map(item=>item.key)));
     setNotice(next.batch?'翻译包已读取；请检查差异后确认保存。':'翻译包校验失败，未写入数据库。');
   }catch{setImportPayload(null);setPreview(null);setPreviewSelected(new Set());setNotice('文件不是有效 JSON，未写入数据库。')}
 }
 async function confirmBatch(){
   if(!services||!importPayload||!preview||batchBusy)return;
   setBatchBusy(true);setNotice('正在重新校验当前数据…');
   try{
     const currentResult=await services.operations.listDiscoverHeroes(true);
     if(currentResult.error)throw new Error(currentResult.error);
     const currentRows=currentResult.data;
     const freshPreview=previewDiscoverTranslationBatch(importPayload,currentRows,products);
     const changed=[...previewSelected].filter(key=>{
       const before=preview.entries.find(item=>item.key===key);const now=freshPreview.entries.find(item=>item.key===key);
       return !before||!now||now.kind==='source_conflict'||before.currentText!==now.currentText||before.sourceText!==now.sourceText;
     });
     if(changed.length){setRows(currentRows);setPreview(freshPreview);setPreviewSelected(new Set());setNotice(`检测到 ${changed.length} 项并发或源文变化，已刷新预览；请重新选择，未保存任何译文。`);return}
     const selectedEntries=freshPreview.entries.filter(item=>previewSelected.has(item.key)&&(item.kind==='add'||item.kind==='overwrite'));
     const videoIds=[...new Set(selectedEntries.map(item=>item.videoId))];
     const saved:DiscoverHero[]=[];const failed:Array<{id:string;message:string}>=[];
     for(const videoId of videoIds){
       const current=currentRows.find(item=>item.id===videoId);if(!current){failed.push({id:videoId,message:'视频已删除或无权限'});continue}
       const next=applyDiscoverBatchSelections(current,freshPreview.batch!,previewSelected);
       const result=await services.operations.saveDiscoverHero(next);
       if(result.error||!result.data)failed.push({id:videoId,message:result.error||'保存失败'});else saved.push(result.data);
     }
     const latestRows=currentRows.map(item=>saved.find(savedItem=>savedItem.id===item.id)??item);
     setRows(latestRows);
     if(failed.length){
       const failedIds=new Set(failed.map(item=>item.id));const retryPreview=previewDiscoverTranslationBatch(importPayload,latestRows,products);
       setPreview(retryPreview);setPreviewSelected(new Set(retryPreview.entries.filter(item=>failedIds.has(item.videoId)&&previewSelected.has(item.key)).map(item=>item.key)));
       setNotice(`已保存 ${saved.length} 条，失败 ${failed.length} 条：${failed.map(item=>`${item.id}（${item.message}）`).join('；')}。仅保留失败项供重试。`);
     }else{
       setImportPayload(null);setPreview(null);setPreviewSelected(new Set());setNotice(`已保存 ${saved.length} 条视频的译文。启用视频的对应语言文案已更新到发现页。`);
     }
   }catch(error){setNotice(`批量保存失败：${error instanceof Error?error.message:String(error)}。未确认成功的内容不会显示为已保存。`)}
   finally{setBatchBusy(false)}
 }
 return <section className="operations-section discover-manager">
   <header><div><span>DISCOVER</span><h2>Discover 视频</h2><p>填写中文后可导出翻译包。导入检查通过并确认保存后，译文才会更新到发现页。</p></div>
   <div className="discover-batch-actions"><button type="button" disabled={!loaded} onClick={()=>{if(dirty&&!window.confirm('尚有未保存内容，确认新增视频？'))return;const row:DiscoverHero={id:crypto.randomUUID(),video_url:'',poster_url:'',product_id:null,product_slug:null,translations:{},enabled:false,sort_order:rows.length,version:0};setRows(current=>[...current,row]);setDirty(false);setSelected(row.id)}}>＋ 新增视频</button><button type="button" disabled={!loaded||checkedRows.length===0} title={checkedRows.length?'':'请先选择视频'} onClick={exportBatch}>导出翻译包</button><button type="button" disabled={!loaded||batchBusy} onClick={()=>dirty?setNotice('当前视频有未保存修改，请先保存后再导入翻译包。'):importRef.current?.click()}>导入翻译包</button><input ref={importRef} className="discover-import-input" aria-label="选择翻译包 JSON" type="file" accept="application/json,.json" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importBatch(file)}}/></div></header>
   {notice&&<p role="status">{notice}</p>}
   <div className="discover-selection-bar"><label><input type="checkbox" checked={allChecked} onChange={event=>setCheckedIds(event.target.checked?new Set(rows.map(row=>row.id)):new Set())}/> {allChecked?'取消全选':'全选'}</label><b>已选择 {checkedRows.length} 条</b>{!checkedRows.length&&<span>请选择要导出的一个或多个视频</span>}</div>
   <div className="discover-manager-list">{rows.map(row=><article key={row.id} aria-current={selected===row.id}>
     <label className="discover-row-check"><input aria-label={`选择 ${row.translations['zh-CN']?.title||row.id}`} type="checkbox" checked={checkedIds.has(row.id)} onChange={event=>setCheckedIds(current=>{const next=new Set(current);if(event.target.checked)next.add(row.id);else next.delete(row.id);return next})}/></label>
     <button type="button" onClick={()=>select(row.id)} aria-pressed={selected===row.id}><img src={row.poster_url} alt=""/><span><b>{row.translations['zh-CN']?.title||products.find(p=>p.id===row.product_id||p.slug===row.product_slug)?.title||row.product_slug||'未命名视频'}</b><small>{row.product_id||row.product_slug?'路线':'Soul'} · {row.enabled?'启用':'停用'} · 排序 {row.sort_order}</small></span></button>
   </article>)}</div>
   {preview&&<DiscoverBatchPreviewPanel preview={preview} selected={previewSelected} busy={batchBusy} onToggle={key=>setPreviewSelected(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next})} onCancel={()=>{setImportPayload(null);setPreview(null);setPreviewSelected(new Set());setNotice('已取消导入，未写入数据库。')}} onConfirm={()=>void confirmBatch()}/>}
   {edited&&<DiscoverEditor key={`${edited.id}-${edited.version}`} hero={edited} products={products} writable={loaded} onDirtyChange={setDirty} onDeleted={id=>{setRows(current=>current.filter(item=>item.id!==id));setCheckedIds(current=>{const next=new Set(current);next.delete(id);return next});setSelected(null);setDirty(false);setNotice('已删除')}} onSaved={row=>{setDirty(false);setRows(current=>current.map(item=>item.id===row.id?row:item));setNotice('已保存；刷新发现页可读取最新内容')}}/>}
 </section>;
}
function DiscoverBatchPreviewPanel({preview,selected,busy,onToggle,onCancel,onConfirm}:{preview:DiscoverBatchPreview;selected:Set<string>;busy:boolean;onToggle:(key:string)=>void;onCancel:()=>void;onConfirm:()=>void}){
 const grouped=new Map<string,typeof preview.entries>();for(const entry of preview.entries)grouped.set(entry.videoId,[...(grouped.get(entry.videoId)??[]),entry]);
 const blocking=preview.batch===null||preview.issues.some(issue=>issue.severity==='error');
 return <section className="discover-import-preview" role="dialog" aria-label="翻译包导入预览"><header><div><span>IMPORT PREVIEW</span><h3>翻译包差异预览</h3></div><small>只预览，尚未写入数据库</small></header>
   <div className="discover-preview-summary"><b>匹配视频 {preview.matchedVideoIds.length}</b><span>目标语言 {preview.targetLocales.join('、')||'—'}</span><span>新增 {preview.additions}</span><span>拟覆盖 {preview.overwrites}</span><span>源文冲突 {preview.sourceConflicts}</span><span>缺失译文 {preview.missingTranslations}</span><span>未知/已删除 {preview.unknownVideoIds.length}</span></div>
   {preview.issues.length>0&&<ul className="discover-preview-issues">{preview.issues.map((issue,index)=><li key={`${issue.code}-${index}`} data-severity={issue.severity}>{issue.message}</li>)}</ul>}
   {[...grouped.entries()].map(([videoId,entries])=><details key={videoId} open><summary>{entries[0]?.videoLabel??videoId} · {entries.length} 项</summary><div className="discover-preview-entries">{entries.map(entry=><article key={entry.key} data-kind={entry.kind}><label><input type="checkbox" checked={selected.has(entry.key)} disabled={entry.kind==='source_conflict'||entry.kind==='unchanged'} onChange={()=>onToggle(entry.key)}/><b>{entry.locale} · {entry.fieldKey==='title'?'标题':'副标题'}</b><span>{entry.kind==='add'?'新增':entry.kind==='overwrite'?`覆盖（当前 ${entry.currentStatus}）`:entry.kind==='unchanged'?'内容未变化':'中文源文已变化，需重新导出'}</span></label><div><p><small>原译文</small>{entry.currentText||'（空）'}</p><p><small>新译文</small>{entry.incomingText}</p></div></article>)}</div></details>)}
   <p className="discover-save-warning">确认保存后，启用视频的对应语言文案将更新到发现页；不会改变视频、封面、排序、关联或启用状态。</p>
   <div className="discover-preview-actions"><button type="button" disabled={busy} onClick={onCancel}>取消</button><button type="button" disabled={busy||blocking||selected.size===0} onClick={onConfirm}>{busy?'保存中…':'确认保存'}</button></div>
 </section>;
}
function DiscoverEditor({hero,products,writable,onSaved,onDeleted,onDirtyChange}:{hero:DiscoverHero;products:OperationsProduct[];writable:boolean;onSaved:(hero:DiscoverHero)=>void;onDeleted:(id:string)=>void;onDirtyChange:(dirty:boolean)=>void}) {
 const {services}=useApp();
 const [draft,setDraft]=useState(hero);
 const [saved,setSaved]=useState(JSON.stringify(hero));
 const [locale,setLocale]=useState<PassengerLocale>('zh-CN');
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState<number|null>(null);
 const [notice,setNotice]=useState('');
 const [retry,setRetry]=useState<File|null>(null);
 const dirty=JSON.stringify(draft)!==saved;
 useEffect(()=>{onDirtyChange(dirty)},[dirty,onDirtyChange]);
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
     <small>中文保存后可加入批量翻译包；译文只有在导入检查并确认保存后才更新到发现页。</small>
     <label>关联产品（可选）<select value={draft.product_id??products.find(p=>p.slug===draft.product_slug)?.id??''} onChange={event=>{const product=products.find(p=>p.id===event.target.value);setDraft({...draft,product_id:product?.id??null,product_slug:product?.slug??null})}}><option value="">不关联 · Soul 内容</option>{products.map(product=><option value={product.id} key={product.id}>{product.title} · {product.status==='published'?'已发布':'未公开'}</option>)}</select></label>
     <label>排序<input type="number" min={0} max={9999} value={draft.sort_order} onChange={event=>setDraft({...draft,sort_order:Number(event.target.value)})}/></label>
     <label><input type="checkbox" checked={draft.enabled} onChange={event=>setDraft({...draft,enabled:event.target.checked})}/> 启用</label>
     <p role="status">{notice||(!writable?'本地结构预览；数据库迁移未应用，不能保存':dirty?'未保存':'已保存')}</p>
     <button type="button" disabled={busy||!writable||!draft.video_url||!draft.poster_url} onClick={()=>void save()}>{busy?'处理中…':'保存内容'}</button>
     <button className="discover-delete" type="button" disabled={busy||!writable||draft.version<1} onClick={()=>void remove()}>删除此视频</button>
   </div>
 </div>;
}
