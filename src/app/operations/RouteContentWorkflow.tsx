import {useMemo, useRef, useState, type ReactNode} from 'react';
import type {OperationsProduct} from '../../shared/integrations/supabaseOperations';
import {applyRouteTranslationPackage, buildRouteContentTemplate, buildRouteTranslationPackage, downloadPackage, isRouteContentPackage, packageStatusSummary, parseJsonFile, pendingTranslationPackage, validateContentPackage, validateTranslationPackage, type ContentPackage, type PackageIssue, type TranslationPackage} from '../../shared/contentPackages';
import {draftContent, draftFromProduct, type ProductDraft} from './productDraft';

const statusName: Record<string, string> = {missing: '缺失', draft: '草稿', reviewed: '已复核', published: '已发布', stale: '需重译'};
const showIssues = (issues: PackageIssue[]) => issues.map(issue => `${issue.severity === 'error' ? '错误' : '提醒'} · ${issue.path}：${issue.message}`).join('\n');
function Field({label,children}:{label:string;children:ReactNode}){return <label className="product-editor-field"><span>{label}</span>{children}</label>}

export function RouteContentWorkflow({product, draft, update, onImportChinese, onReviewLocale}: {product: OperationsProduct; draft: ProductDraft; update: (patch: Partial<ProductDraft>) => void; onImportChinese: (content: ContentPackage) => void; onReviewLocale: (locale: string) => void}) {
  const chineseInput = useRef<HTMLInputElement>(null); const translationInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState(''); const [issues, setIssues] = useState<PackageIssue[]>([]);
  const [reviewLocale, setReviewLocale] = useState('en');
  const draftProduct = useMemo(() => ({...product, title: draft.title, content: draftContent(product, draft)}), [product, draft]);
  const translation = useMemo(() => buildRouteTranslationPackage(draftProduct), [draftProduct]);
  const summary = packageStatusSummary(translation);
  const readChinese = async (file: File) => {
    try { const result = validateContentPackage(await parseJsonFile(file)); setIssues(result.issues); if (!result.package || !isRouteContentPackage(result.package)) { setNotice('中文内容包未导入：请先修正上述错误。'); return; } if (result.package.entity.entity_id && result.package.entity.entity_id !== product.id) { setNotice('中文内容包对应的是另一条路线；请从产品列表使用“导入中文内容包”新建或更新正确路线。'); return; } onImportChinese(result.package); setNotice(`已载入中文草稿：${result.package.route.title}。请检查后保存草稿，游客公开页不会立即改变。`); }
    catch { setIssues([{severity: 'error', code: 'json', path: 'file', message: '文件不是有效 JSON 内容包'}]); setNotice('中文内容包读取失败。'); }
  };
  const readTranslation = async (file: File) => {
    try { const validated = validateTranslationPackage(await parseJsonFile(file)); setIssues(validated.issues); if (!validated.package) { setNotice('译文包未导入：请先修正上述错误。'); return; } if (validated.package.entity.entity_type !== 'route' || validated.package.entity.entity_id !== product.id) { setNotice('译文包不属于当前路线，已拒绝导入。'); return; } const applied = applyRouteTranslationPackage(draftProduct, validated.package); const next = draftFromProduct({...product, title: draftProduct.title, content: applied.content}); update(next); setIssues([...validated.issues, ...applied.warnings]); setNotice(`已导入 ${applied.imported} 条译文，跳过 ${applied.skipped} 条。当前为未发布草稿，请检查预览后保存。`); }
    catch { setIssues([{severity: 'error', code: 'json', path: 'file', message: '文件不是有效 JSON 翻译包'}]); setNotice('译文包读取失败。'); }
  };
  const locales=['zh-CN','ja','en','ko','vi','ne','es'];
  const [contentLocale,setContentLocale]=useState('zh-CN');
  const localized=draft.locales[contentLocale]??{};
  const setLocalized=(key:'title'|'tagline'|'summary'|'description'|'highlights',value:string)=>{
    if(contentLocale==='zh-CN'){
      if(key==='title') update({title:value});
      else if(key==='tagline') update({tagline:value});
      else if(key==='summary') update({summary:value});
      else if(key==='description') update({description:value});
      else update({highlights:value.split('\n').map(item=>item.trim()).filter(Boolean)});
      return;
    }
    const next={...draft.locales,[contentLocale]:{...localized,[key]:key==='highlights'?value.split('\n').map(item=>item.trim()).filter(Boolean):value}};
    update({locales:next});
  };
  const value=(key:'title'|'tagline'|'summary'|'description'|'highlights')=>{
    if(contentLocale==='zh-CN') return key==='title'?draft.title:key==='tagline'?draft.tagline:key==='summary'?draft.summary:key==='description'?draft.description:draft.highlights.join('\n');
    const current=localized[key]; return Array.isArray(current)?current.join('\n'):String(current??'');
  };
  const addReminder=()=>update({routeReminders:[...draft.routeReminders,{id:crypto.randomUUID(),type:'other',sortOrder:draft.routeReminders.length,enabled:true,locales:{}}]});
  const updateReminder=(id:string,patch:Partial<ProductDraft['routeReminders'][number]>)=>update({routeReminders:draft.routeReminders.map(item=>item.id===id?{...item,...patch}:item)});
  const moveReminder=(index:number,offset:number)=>{const target=index+offset;if(target<0||target>=draft.routeReminders.length)return;const next=[...draft.routeReminders];[next[index],next[target]]=[next[target],next[index]];update({routeReminders:next});};
  return <><section className="product-editor-card content-workflow" aria-label="内容包与翻译工作流">
    <header><div><h2>内容包与多语言翻译</h2><p>中文内容先进入草稿；译文包只写入可翻译字段，价格、班次、坐标、媒体和路线排序不会从翻译文件改变。</p></div><span>版本 {product.catalogVersion}</span></header>
    <ol className="content-workflow-steps"><li>导出中文模板</li><li>导入中文内容包</li><li>检查并保存中文草稿</li><li>导出翻译包</li><li>导入 ChatGPT 译文</li><li>预览、复核、发布</li></ol>
    <div className="operations-task-actions">
      <button type="button" className="button secondary" onClick={() => downloadPackage('jtw-route-zh-CN-template.json', buildRouteContentTemplate())}>导出中文模板</button>
      <button type="button" className="button secondary" onClick={() => chineseInput.current?.click()}>导入中文内容包</button>
      <button type="button" className="button secondary" onClick={() => downloadPackage(`${product.slug}-translation-package.json`, pendingTranslationPackage(translation))}>导出翻译包</button>
      <button type="button" className="button secondary" onClick={() => translationInput.current?.click()}>导入译文</button>
      <input ref={chineseInput} hidden type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void readChinese(file); }}/>
      <input ref={translationInput} hidden type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void readTranslation(file); }}/>
    </div>
    <p className="content-workflow-prompt">给 ChatGPT：按照文件内规则完成所有缺失语言，并保持 JSON schema 不变。</p>
    <div className="content-language-status">{Object.entries(summary).map(([locale, counts]) => <span key={locale}><b>{locale}</b> {Object.entries(counts).filter(([, count]) => count).map(([state, count]) => `${statusName[state]} ${count}`).join(' · ') || '缺失'}</span>)}</div>
    <div className="operations-task-actions"><label>人工复核语言<select aria-label="人工复核语言" value={reviewLocale} onChange={event => setReviewLocale(event.target.value)}>{Object.keys(summary).map(locale => <option key={locale} value={locale}>{locale}</option>)}</select></label><button type="button" className="button secondary" onClick={() => { onReviewLocale(reviewLocale); setNotice(`${reviewLocale} 已标记为人工复核；仍需保存草稿，之后才可随产品发布。`); }}>标记已复核</button></div>
    {notice && <p role="status">{notice}</p>}{issues.length > 0 && <pre className="content-workflow-issues" role="alert">{showIssues(issues)}</pre>}
  </section>
  <section className="product-editor-card" aria-label="路线内容与特别提醒">
    <header><div><h2>路线内容与特别提醒</h2><p>只填写路线独有内容；景点导览和通用规则不复制到这里。缺少语言内容将保持缺失，不会自动翻译。</p></div><select aria-label="路线内容语言" value={contentLocale} onChange={event=>setContentLocale(event.target.value)}>{locales.map(locale=><option key={locale} value={locale}>{locale}</option>)}</select></header>
    <Field label="路线标题"><input value={value('title')} onChange={event=>setLocalized('title',event.target.value)}/></Field>
    <Field label="一句话卖点"><textarea value={value('tagline')} onChange={event=>setLocalized('tagline',event.target.value)}/></Field>
    <Field label="路线总体介绍"><textarea value={value('description')} onChange={event=>setLocalized('description',event.target.value)}/></Field>
    <Field label="路线亮点（每行一项）"><textarea value={value('highlights')} onChange={event=>setLocalized('highlights',event.target.value)}/></Field>
    <div className="product-editor-stack"><header><div><h3>本路线特别提醒</h3><p>可选；每项独立排序、启用或删除。只用于这条路线。</p></div><button className="button secondary" type="button" onClick={addReminder}>添加提醒</button></header>{draft.routeReminders.map((item,index)=>{const localizedReminder=item.locales[contentLocale]??{};return <article key={item.id} className="product-editor-card"><div className="operations-task-actions"><b>提醒 {index+1}</b><label>类型<select value={item.type} onChange={event=>updateReminder(item.id,{type:event.target.value})}><option value="other">其他</option><option value="weather">天气／海况</option><option value="walking">步行</option><option value="seasonal">季节</option></select></label><label><input type="checkbox" checked={item.enabled} onChange={event=>updateReminder(item.id,{enabled:event.target.checked})}/> 启用</label><button type="button" onClick={()=>moveReminder(index,-1)} disabled={index===0}>上移</button><button type="button" onClick={()=>moveReminder(index,1)} disabled={index===draft.routeReminders.length-1}>下移</button><button type="button" onClick={()=>update({routeReminders:draft.routeReminders.filter(entry=>entry.id!==item.id)})}>删除</button></div><Field label={`${contentLocale} 标题（可选）`}><input value={localizedReminder.title??''} onChange={event=>updateReminder(item.id,{locales:{...item.locales,[contentLocale]:{...localizedReminder,title:event.target.value}}})}/></Field><Field label={`${contentLocale} 内容`}><textarea value={localizedReminder.body??''} onChange={event=>updateReminder(item.id,{locales:{...item.locales,[contentLocale]:{...localizedReminder,body:event.target.value}}})}/></Field></article>})}</div>
  </section></>;
}
