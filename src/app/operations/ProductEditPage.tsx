import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Link, useLocation, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {useApp} from '../store';
import type {OperationsProduct, OperationsProductRevision} from '../../shared/integrations/supabaseOperations';
import {ProductPhonePreview, type PreviewMode} from './ProductPhonePreview';
import {draftContent, draftFromProduct, type ProductDraft, type ProductEditorLocale} from './productDraft';

type EditorTab = 'media' | 'itinerary' | 'rules' | 'locales';
const tabs: Array<{id: EditorTab; label: string}> = [
  {id: 'media', label: '图文与视频'}, {id: 'itinerary', label: '景点行程'},
  {id: 'rules', label: '费用须知'}, {id: 'locales', label: '多语言'},
];
const localeOptions = [{id: 'zh-CN', label: '简体中文'}, {id: 'ja', label: '日本語'}, {id: 'en', label: 'English'}];
const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const lineText = (value: string[]) => value.join('\n');

function statusLabel(item: OperationsProduct) {
  if (item.status === 'published' && item.publishedRevision != null && item.draftRevision != null && item.draftRevision > item.publishedRevision) return '有草稿更新';
  if (item.status === 'published') return '已发布';
  if (item.status === 'archived') return '已下架';
  return '草稿';
}
function returnUrl(searchParams: URLSearchParams) {
  const raw = searchParams.get('returnTo');
  if (!raw) return '/app/operations/products';
  try { const decoded = decodeURIComponent(raw); return decoded.startsWith('/app/operations/products') ? decoded : '/app/operations/products'; }
  catch { return '/app/operations/products'; }
}
function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    const linkGuard = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#') || target.getAttribute('target') === '_blank') return;
      if (!window.confirm('当前修改尚未保存，确定离开此页面吗？')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload); document.addEventListener('click', linkGuard, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', linkGuard, true); };
  }, [dirty]);
}
function Field({label, children}: {label: string; children: ReactNode}) { return <label className="product-editor-field"><span>{label}</span>{children}</label>; }

function MediaPanel({draft, update}: {draft: ProductDraft; update: (patch: Partial<ProductDraft>) => void}) {
  return <div className="product-editor-stack">
    <section className="product-editor-card"><header><div><h2>封面与相册</h2><p>现有图片地址继续可用，真实上传在下一阶段接回。</p></div><span>{draft.gallery.length + (draft.heroImageUrl ? 1 : 0)} 张图片</span></header><Field label="主图地址"><input value={draft.heroImageUrl} onChange={(event) => update({heroImageUrl: event.target.value})} placeholder="/images/... 或已上传地址" /></Field><Field label="图库地址（每行一张）"><textarea value={lineText(draft.gallery)} onChange={(event) => update({gallery: lines(event.target.value)})} /></Field></section>
    <section className="product-editor-card"><header><div><h2>让游客想出发的介绍</h2><p>中文草稿是其他语言版本的来源。</p></div><span>中文原文</span></header><Field label="路线标题"><input value={draft.title} required onChange={(event) => update({title: event.target.value})} /></Field><Field label="一句话简介"><textarea value={draft.summary} required onChange={(event) => update({summary: event.target.value})} /></Field><Field label="详细介绍"><textarea value={draft.description} onChange={(event) => update({description: event.target.value})} /></Field><div className="product-editor-fields-two"><Field label="地区"><input value={draft.region} onChange={(event) => update({region: event.target.value})} /></Field><Field label="行程时长"><input value={draft.duration} onChange={(event) => update({duration: event.target.value})} /></Field></div><div className="product-editor-fields-two"><Field label="步行强度"><input value={draft.walkingLevel} onChange={(event) => update({walkingLevel: event.target.value})} /></Field><Field label="服务语言（每行一种）"><textarea value={lineText(draft.languages)} onChange={(event) => update({languages: lines(event.target.value)})} /></Field></div><Field label="路线亮点（每行一项）"><textarea value={lineText(draft.highlights)} onChange={(event) => update({highlights: lines(event.target.value)})} /></Field></section>
    <section className="product-editor-card product-video-unavailable"><header><div><h2>路线视频</h2><p>当前服务没有可验证的视频持久化与转码接口，本批不提供无效上传按钮。</p></div><span>尚未接入</span></header></section>
  </div>;
}
function ItineraryPanel({draft}: {draft: ProductDraft}) {
  return <section className="product-editor-card"><header><div><h2>景点行程</h2><p>景点名称与介绍会同步到右侧草稿预览。</p></div><span>{draft.itinerary.length} 个景点</span></header>{draft.itinerary.length ? draft.itinerary.map((item, index) => <article className="product-itinerary-summary" key={item.editorId}><b>{index + 1}. {String(item.title ?? item.name ?? '未命名景点')}</b><p>{String(item.description ?? '尚未填写介绍')}</p></article>) : <p className="operations-empty">尚未添加景点。</p>}<p className="operations-hint">景点增删、排序、图片上传与折叠编辑在 B2 接入。</p></section>;
}
function RulesPanel({draft, update}: {draft: ProductDraft; update: (patch: Partial<ProductDraft>) => void}) {
  return <div className="product-editor-stack"><section className="product-editor-card"><header><div><h2>费用说明</h2><p>每行录入一项，预览与公开版本沿用同一内容字段。</p></div></header><Field label="费用包含"><textarea value={lineText(draft.included)} onChange={(event) => update({included: lines(event.target.value)})} /></Field><Field label="费用不含"><textarea value={lineText(draft.excluded)} onChange={(event) => update({excluded: lines(event.target.value)})} /></Field></section><section className="product-editor-card"><header><div><h2>出行须知</h2></div></header><Field label="注意事项"><textarea value={lineText(draft.notices)} onChange={(event) => update({notices: lines(event.target.value)})} /></Field></section></div>;
}
function LocalesPanel({draft, update, locale, setLocale}: {draft: ProductDraft; update: (patch: Partial<ProductDraft>) => void; locale: string; setLocale: (value: string) => void}) {
  const current = draft.locales[locale] ?? {};
  const set = (patch: Partial<ProductEditorLocale>) => update({locales: {...draft.locales, [locale]: {...current, ...patch}}});
  return <section className="product-editor-card"><header><div><h2>多语言内容</h2><p>只编辑现有白名单展示字段；其他语言和扩展字段原样保留。</p></div><select aria-label="编辑语言" value={locale} onChange={(event) => setLocale(event.target.value)}>{localeOptions.filter((item) => item.id !== 'zh-CN').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></header><div className="product-editor-locale-note">MD 翻译导出与导入尚未实现，本页不展示假按钮。</div><Field label="路线标题"><input value={String(current.title ?? '')} onChange={(event) => set({title: event.target.value})} /></Field><Field label="一句话简介"><textarea value={String(current.summary ?? '')} onChange={(event) => set({summary: event.target.value})} /></Field><Field label="详细介绍"><textarea value={String(current.description ?? '')} onChange={(event) => set({description: event.target.value})} /></Field><div className="product-editor-fields-two"><Field label="地区"><input value={String(current.region ?? '')} onChange={(event) => set({region: event.target.value})} /></Field><Field label="行程时长"><input value={String(current.duration ?? '')} onChange={(event) => set({duration: event.target.value})} /></Field></div></section>;
}

export function ProductEditPage() {
  const {services, refreshCatalog} = useApp(); const {productId = ''} = useParams(); const navigate = useNavigate(); const location = useLocation(); const [searchParams] = useSearchParams();
  const [product, setProduct] = useState<OperationsProduct | null>(null); const [draft, setDraft] = useState<ProductDraft | null>(null); const [revisions, setRevisions] = useState<OperationsProductRevision[]>([]); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false); const [tab, setTab] = useState<EditorTab>('media'); const [previewMode, setPreviewMode] = useState<PreviewMode>('detail'); const [previewLocale, setPreviewLocale] = useState('zh-CN'); const [editingLocale, setEditingLocale] = useState('ja'); const requestVersion = useRef(0); const backTo = returnUrl(searchParams); useUnsavedGuard(dirty);
  const reload = async (targetId = productId) => {
    if (!services) return; const request = ++requestVersion.current; setBusy(true); setNotice('');
    try { const list = await services.operations.listProducts(); if (request !== requestVersion.current) return; if (list.error) throw new Error(list.error); const target = list.data.find((item) => item.id === targetId); if (!target) { setProduct(null); setDraft(null); setRevisions([]); setNotice('路线不存在或无访问权限'); return; } setProduct(target); setDraft(draftFromProduct(target)); setDirty(false); const history = await services.operations.listProductRevisions(target.id); if (request !== requestVersion.current) return; setRevisions(history.error ? [] : history.data); if (history.error) setNotice(`版本记录读取失败：${history.error}`); }
    catch (error) { if (request === requestVersion.current) { setProduct(null); setDraft(null); setRevisions([]); setNotice(`读取失败：${error instanceof Error ? error.message : '网络异常，请重试'}`); } }
    finally { if (request === requestVersion.current) setBusy(false); }
  };
  useEffect(() => { void reload(); return () => { requestVersion.current += 1; }; }, [services, productId]);
  const update = (patch: Partial<ProductDraft>) => { setDraft((current) => current ? {...current, ...patch} : current); setDirty(true); setNotice(''); };
  const save = async () => {
    if (!services || !product || !draft || busy) return false; if (!draft.title.trim() || !draft.summary.trim()) { setNotice('保存失败：标题和一句话简介不能为空'); return false; } setBusy(true);
    try { const result = await services.operations.saveProductDraft({id: product.id, expectedVersion: product.catalogVersion, title: draft.title.trim(), content: draftContent(product, draft), heroImageUrl: draft.heroImageUrl.trim() || null, gallery: draft.gallery}); if (!result.ok) { setNotice(`保存失败：${result.error}`); return false; } setNotice('草稿已保存，尚未发布；游客仍看到原公开版本'); await reload(product.id); return true; }
    catch (error) { setNotice(`保存失败：${error instanceof Error ? error.message : '网络异常，请重试'}`); return false; }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!services || !product || busy) return; if (dirty) { setNotice('当前还有未保存修改，请先保存草稿，确认保存成功后再发布。'); return; } setBusy(true);
    try { const result = await services.operations.publishProduct(product.id, product.catalogVersion); if (!result.ok) { setNotice(`发布失败：${result.error}`); return; } const refreshError = await refreshCatalog(); setNotice(refreshError ? `发布成功，但游客目录刷新失败：${refreshError}` : '已发布并重新读取游客公开目录'); await reload(product.id); }
    catch (error) { setNotice(`发布失败：${error instanceof Error ? error.message : '网络异常，请重试'}`); }
    finally { setBusy(false); }
  };
  const titleText = useMemo(() => product ? `${product.title}（${statusLabel(product)}）` : '', [product]);
  if (!productId) return <main className="operations-page"><section className="operations-section"><p>路径不完整</p></section></main>;
  if (busy && !product) return <main className="operations-page"><section className="operations-section"><p>正在读取路线信息…</p></section></main>;
  if (!product || !draft) return <main className="operations-page"><section className="operations-section"><p>{notice || '路线不存在或无访问权限。'}</p><button type="button" onClick={() => void reload()}>重新读取</button><Link to={backTo}>返回产品列表</Link></section></main>;
  return <main className="operations-page product-editor-page" data-location={location.pathname}>
    <header className="product-editor-heading"><div><span>CONTENT STUDIO</span><h1>产品编辑</h1><p>{titleText}</p></div><div className="operations-task-actions"><Link className="button secondary" to={backTo}>返回产品列表</Link>{product.status === 'published' && <Link className="button secondary" target="_blank" to={`/app/trips/${product.slug}`}>查看当前公开页</Link>}</div></header>
    {notice && <p className="operations-notice" role="status">{notice}</p>}
    <div className="product-editor-preview-toggle" aria-label="移动端编辑预览切换"><button className="active" type="button">编辑</button><button type="button" onClick={() => document.querySelector('.product-phone-preview')?.scrollIntoView()}>预览</button></div>
    <div className="product-editor-layout"><section className="product-editor-main"><nav className="product-editor-tabs" aria-label="产品编辑分区">{tabs.map((item) => <button type="button" aria-current={tab === item.id ? 'page' : undefined} className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>{tab === 'media' && <MediaPanel draft={draft} update={update} />}{tab === 'itinerary' && <ItineraryPanel draft={draft} />}{tab === 'rules' && <RulesPanel draft={draft} update={update} />}{tab === 'locales' && <LocalesPanel draft={draft} update={update} locale={editingLocale} setLocale={setEditingLocale} />}<details className="product-revisions"><summary>历史版本（{revisions.length}）</summary>{revisions.map((revision) => <div key={revision.revisionNumber}><b>v{revision.revisionNumber} · {revision.state}</b><span>{revision.title}</span></div>)}</details></section><div className="product-editor-preview-column"><div className="product-preview-controls"><div><button type="button" className={previewMode === 'detail' ? 'active' : ''} onClick={() => setPreviewMode('detail')}>路线详情</button><button type="button" className={previewMode === 'card' ? 'active' : ''} onClick={() => setPreviewMode('card')}>列表卡片</button></div><select aria-label="预览语言" value={previewLocale} onChange={(event) => setPreviewLocale(event.target.value)}>{localeOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><ProductPhonePreview draft={draft} locale={previewLocale} mode={previewMode} dirty={dirty} /></div></div>
    <footer className="product-editor-savebar"><div><b>{dirty ? '有未保存修改' : '草稿内容已保存'}</b><small>版本 {product.catalogVersion}；并发冲突时不会覆盖他人修改</small></div><div><button className="button secondary" type="button" disabled={busy || !dirty} onClick={() => void reload(product.id)}>放弃修改</button><button className="button" type="button" disabled={busy || !dirty} onClick={() => void save()}>{busy ? '正在保存…' : '保存草稿'}</button><button className="button" type="button" disabled={busy || dirty || product.draftRevision == null} onClick={() => void publish()}>发布草稿</button><button className="button secondary" type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm('当前修改尚未保存，确定返回吗？')) navigate(-1); }}>返回</button></div></footer>
  </main>;
}
