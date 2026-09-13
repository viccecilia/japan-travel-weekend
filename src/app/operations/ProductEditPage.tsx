import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Link, useLocation, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {useApp} from '../store';
import type {OperationsProduct, OperationsProductRevision} from '../../shared/integrations/supabaseOperations';
import {ProductPhonePreview, type PreviewMode} from './ProductPhonePreview';
import {draftContent, draftFromProduct, type ProductDraft, type ProductEditorLocale, type ProductEditorStop} from './productDraft';

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

type UploadTarget = {kind: 'hero'} | {kind: 'gallery'; index?: number} | {kind: 'stop'; editorId: string};

function MediaPanel({draft, update, upload, uploadBusy, uploadNotice}: {draft: ProductDraft; update: (patch: Partial<ProductDraft>) => void; upload: (file: File, target: UploadTarget) => Promise<void>; uploadBusy: boolean; uploadNotice: string}) {
  const images = [...new Set([draft.heroImageUrl, ...draft.gallery].filter(Boolean))];
  const moveGallery = (index: number, offset: number) => {
    const target = index + offset; if (target < 0 || target >= draft.gallery.length) return;
    const gallery = [...draft.gallery]; [gallery[index], gallery[target]] = [gallery[target], gallery[index]]; update({gallery});
  };
  const setCover = (url: string) => update({heroImageUrl: url, gallery: draft.gallery.filter((item) => item !== url)});
  return <div className="product-editor-stack">
    <section className="product-editor-card"><header><div><h2>封面与相册</h2><p>上传成功后才会写入持久地址；本地预览不会进入数据库。</p></div><span>{images.length} 张图片</span></header>
      <label className="product-media-drop"><b>＋ 上传路线图片</b><span>JPG / PNG / WebP，单张最大 10MB</span><input aria-label="上传路线图片" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploadBusy} onChange={(event) => { const files = [...(event.target.files ?? [])]; event.currentTarget.value = ''; void (async () => { for (const [index, file] of files.entries()) await upload(file, !draft.heroImageUrl && index === 0 ? {kind: 'hero'} : {kind: 'gallery'}); })(); }} /></label>
      {uploadNotice && <p className={uploadNotice.startsWith('上传失败') ? 'product-upload-error' : 'product-upload-status'} role="status">{uploadNotice}</p>}
      <div className="product-media-grid">{images.map((url) => { const isHero = url === draft.heroImageUrl; const galleryIndex = draft.gallery.indexOf(url); return <article key={url}><img src={url} alt={isHero ? '当前路线封面' : '路线图库预览'} /><span>{url.startsWith('blob:') ? '本地预览 · 尚未上传' : isHero ? '封面' : '图库'}</span><div>{!isHero && <button type="button" onClick={() => setCover(url)}>设为封面</button>}{galleryIndex >= 0 && <><button type="button" disabled={galleryIndex === 0} onClick={() => moveGallery(galleryIndex, -1)}>前移</button><button type="button" disabled={galleryIndex === draft.gallery.length - 1} onClick={() => moveGallery(galleryIndex, 1)}>后移</button></>}<button type="button" onClick={() => update(isHero ? {heroImageUrl: ''} : {gallery: draft.gallery.filter((item) => item !== url)})}>移除</button></div></article>; })}</div>
      <details><summary>兼容旧图片地址</summary><div className="product-editor-stack"><Field label="主图地址"><input value={draft.heroImageUrl} onChange={(event) => update({heroImageUrl: event.target.value})} placeholder="/images/... 或已上传地址" /></Field><Field label="图库地址（每行一张）"><textarea value={lineText(draft.gallery)} onChange={(event) => update({gallery: lines(event.target.value)})} /></Field></div></details>
    </section>
    <section className="product-editor-card"><header><div><h2>让游客想出发的介绍</h2><p>中文草稿是其他语言版本的来源。</p></div><span>中文原文</span></header><Field label="路线标题"><input value={draft.title} required onChange={(event) => update({title: event.target.value})} /></Field><Field label="一句话简介"><textarea value={draft.summary} required onChange={(event) => update({summary: event.target.value})} /></Field><Field label="详细介绍"><textarea value={draft.description} onChange={(event) => update({description: event.target.value})} /></Field><div className="product-editor-fields-two"><Field label="地区"><input value={draft.region} onChange={(event) => update({region: event.target.value})} /></Field><Field label="行程时长"><input value={draft.duration} onChange={(event) => update({duration: event.target.value})} /></Field></div><div className="product-editor-fields-two"><Field label="步行强度"><input value={draft.walkingLevel} onChange={(event) => update({walkingLevel: event.target.value})} /></Field><Field label="服务语言（每行一种）"><textarea value={lineText(draft.languages)} onChange={(event) => update({languages: lines(event.target.value)})} /></Field></div><Field label="路线亮点（每行一项）"><textarea value={lineText(draft.highlights)} onChange={(event) => update({highlights: lines(event.target.value)})} /></Field></section>
    <section className="product-editor-card product-video-unavailable"><header><div><h2>路线视频</h2><p>当前服务没有可验证的视频持久化与转码接口，本批不提供无效上传按钮。</p></div><span>尚未接入</span></header></section>
  </div>;
}
function ItineraryPanel({draft, update, upload, uploadBusy}: {draft: ProductDraft; update: (patch: Partial<ProductDraft>) => void; upload: (file: File, target: UploadTarget) => Promise<void>; uploadBusy: boolean}) {
  const change = (editorId: string, patch: Partial<ProductEditorStop>) => update({itinerary: draft.itinerary.map((item) => item.editorId === editorId ? {...item, ...patch} : item)});
  const move = (index: number, offset: number) => { const target = index + offset; if (target < 0 || target >= draft.itinerary.length) return; const itinerary = [...draft.itinerary]; [itinerary[index], itinerary[target]] = [itinerary[target], itinerary[index]]; update({itinerary}); };
  const add = () => update({itinerary: [...draft.itinerary, {editorId: `new-${crypto.randomUUID()}`, title: '新景点', description: ''}]});
  return <section className="product-editor-card"><header><div><h2>景点行程</h2><p>稳定景点标识保证改名不丢焦点；排序会同步到游客预览。</p></div><span>{draft.itinerary.length} 个景点</span></header>
    <div className="product-itinerary-list">{draft.itinerary.map((item, index) => <details key={item.editorId} open={index === 0}><summary><span>{index + 1}</span><b>{String(item.title ?? item.name ?? '未命名景点')}</b><small>{Number(item.stayMinutes) > 0 ? `${Number(item.stayMinutes)} 分钟` : '未设置停留时间'}</small></summary><div className="product-itinerary-fields"><div className="product-editor-fields-two"><Field label="景点名称"><input value={String(item.title ?? item.name ?? '')} onChange={(event) => change(item.editorId, {title: event.target.value})} /></Field><Field label="地点"><input value={String(item.location ?? '')} onChange={(event) => change(item.editorId, {location: event.target.value})} /></Field></div><div className="product-editor-fields-two"><Field label="预计时间"><input value={String(item.time ?? '')} onChange={(event) => change(item.editorId, {time: event.target.value})} /></Field><Field label="停留分钟"><input type="number" min="0" value={Number(item.stayMinutes ?? 0)} onChange={(event) => change(item.editorId, {stayMinutes: Number(event.target.value) || 0})} /></Field></div><Field label="景点介绍"><textarea value={String(item.description ?? '')} onChange={(event) => change(item.editorId, {description: event.target.value})} /></Field><Field label="游览提示"><textarea value={String(item.tip ?? '')} onChange={(event) => change(item.editorId, {tip: event.target.value})} /></Field><div className="product-stop-media">{item.imageUrl && <img src={String(item.imageUrl)} alt="景点图片预览" />}<label className="button secondary">上传该景点图片<input aria-label={`上传${String(item.title ?? item.name ?? '景点')}图片`} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file, {kind: 'stop', editorId: item.editorId}); event.currentTarget.value = ''; }} /></label><Field label="或使用已有图片地址"><input value={String(item.imageUrl ?? '')} onChange={(event) => change(item.editorId, {imageUrl: event.target.value})} /></Field></div><div className="operations-task-actions"><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>上移</button><button type="button" disabled={index === draft.itinerary.length - 1} onClick={() => move(index, 1)}>下移</button><button type="button" onClick={() => update({itinerary: draft.itinerary.filter((entry) => entry.editorId !== item.editorId)})}>删除景点</button><button type="button" onClick={() => document.getElementById(`preview-${item.editorId}`)?.scrollIntoView({block: 'center'})}>定位预览</button></div></div></details>)}</div>
    <button className="button secondary" type="button" onClick={add}>添加景点</button>
  </section>;
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
  const [product, setProduct] = useState<OperationsProduct | null>(null); const [draft, setDraft] = useState<ProductDraft | null>(null); const [revisions, setRevisions] = useState<OperationsProductRevision[]>([]); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [uploadBusy, setUploadBusy] = useState(false); const [uploadNotice, setUploadNotice] = useState(''); const [dirty, setDirty] = useState(false); const [tab, setTab] = useState<EditorTab>('media'); const [previewMode, setPreviewMode] = useState<PreviewMode>('detail'); const [previewLocale, setPreviewLocale] = useState('zh-CN'); const [editingLocale, setEditingLocale] = useState('ja'); const requestVersion = useRef(0); const objectUrls = useRef(new Set<string>()); const backTo = returnUrl(searchParams); useUnsavedGuard(dirty);
  const reload = async (targetId = productId, successNotice = '') => {
    if (!services) return; const request = ++requestVersion.current; setBusy(true); setNotice('');
    try { const list = await services.operations.listProducts(); if (request !== requestVersion.current) return; if (list.error) throw new Error(list.error); const target = list.data.find((item) => item.id === targetId); if (!target) { setProduct(null); setDraft(null); setRevisions([]); setNotice('路线不存在或无访问权限'); return; } setProduct(target); setDraft(draftFromProduct(target)); setDirty(false); const history = await services.operations.listProductRevisions(target.id); if (request !== requestVersion.current) return; setRevisions(history.error ? [] : history.data); if (history.error) setNotice(`版本记录读取失败：${history.error}`); else if (successNotice) setNotice(successNotice); }
    catch (error) { if (request === requestVersion.current) { setProduct(null); setDraft(null); setRevisions([]); setNotice(`读取失败：${error instanceof Error ? error.message : '网络异常，请重试'}`); } }
    finally { if (request === requestVersion.current) setBusy(false); }
  };
  useEffect(() => { void reload(); return () => { requestVersion.current += 1; objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); objectUrls.current.clear(); }; }, [services, productId]);
  const update = (patch: Partial<ProductDraft>) => { setDraft((current) => current ? {...current, ...patch} : current); setDirty(true); setNotice(''); };
  const upload = async (file: File, target: UploadTarget) => {
    if (!services || !product || uploadBusy) return;
    const localUrl = URL.createObjectURL(file); objectUrls.current.add(localUrl); setUploadBusy(true); setUploadNotice('正在上传，当前显示本地预览…');
    setDraft((current) => {
      if (!current) return current;
      if (target.kind === 'hero') return {...current, heroImageUrl: localUrl};
      if (target.kind === 'gallery') return {...current, gallery: target.index == null ? [...current.gallery, localUrl] : current.gallery.map((item, index) => index === target.index ? localUrl : item)};
      return {...current, itinerary: current.itinerary.map((item) => item.editorId === target.editorId ? {...item, imageUrl: localUrl} : item)};
    }); setDirty(true);
    let uploaded = false;
    try {
      const result = await services.operations.uploadProductImage(product.id, file);
      if (result.error || !result.url) { setUploadNotice(`上传失败：${result.error ?? '未返回持久地址'}；输入已保留，可重新选择文件重试。`); return; }
      setDraft((current) => {
        if (!current) return current;
        if (target.kind === 'hero') return {...current, heroImageUrl: current.heroImageUrl === localUrl ? result.url! : current.heroImageUrl};
        if (target.kind === 'gallery') return {...current, gallery: current.gallery.map((item) => item === localUrl ? result.url! : item)};
        return {...current, itinerary: current.itinerary.map((item) => item.editorId === target.editorId && item.imageUrl === localUrl ? {...item, imageUrl: result.url!} : item)};
      });
      uploaded = true; setUploadNotice('图片上传成功，持久地址已加入当前草稿；请保存草稿完成关联。');
    } catch (error) { setUploadNotice(`上传失败：${error instanceof Error ? error.message : '网络异常'}；输入已保留，可重新选择文件重试。`); }
    finally { setUploadBusy(false); if (uploaded) { URL.revokeObjectURL(localUrl); objectUrls.current.delete(localUrl); } }
  };
  const save = async () => {
    if (!services || !product || !draft || busy || uploadBusy) return false; if (!draft.title.trim() || !draft.summary.trim()) { setNotice('保存失败：标题和一句话简介不能为空'); return false; } if ([draft.heroImageUrl, ...draft.gallery, ...draft.itinerary.map((item) => String(item.imageUrl ?? ''))].some((url) => url.startsWith('blob:'))) { setNotice('保存失败：仍有图片只存在于本地预览，请重新上传成功后再保存。'); return false; } setBusy(true);
    try { const result = await services.operations.saveProductDraft({id: product.id, expectedVersion: product.catalogVersion, title: draft.title.trim(), content: draftContent(product, draft), heroImageUrl: draft.heroImageUrl.trim() || null, gallery: draft.gallery}); if (!result.ok) { setNotice(`保存失败：${result.error}`); return false; } await reload(product.id, '草稿已保存，尚未发布；游客仍看到原公开版本'); return true; }
    catch (error) { setNotice(`保存失败：${error instanceof Error ? error.message : '网络异常，请重试'}`); return false; }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!services || !product || busy) return; if (dirty) { setNotice('当前还有未保存修改，请先保存草稿，确认保存成功后再发布。'); return; } setBusy(true);
    try { const result = await services.operations.publishProduct(product.id, product.catalogVersion); if (!result.ok) { setNotice(`发布失败：${result.error}`); return; } const refreshError = await refreshCatalog(); await reload(product.id, refreshError ? `发布成功，但游客目录刷新失败：${refreshError}` : '已发布并重新读取游客公开目录'); }
    catch (error) { setNotice(`发布失败：${error instanceof Error ? error.message : '网络异常，请重试'}`); }
    finally { setBusy(false); }
  };
  const setStatus = async (action: 'archive' | 'restore', revision?: number) => {
    if (!services || !product || busy || dirty) { if (dirty) setNotice('请先保存或放弃当前修改，再执行下架或历史恢复。'); return; }
    const message = action === 'archive' ? '下架后游客端将立即不可见，历史订单不会改变。确认继续？' : `确认把历史版本 v${revision} 复制为新的草稿？`;
    if (!window.confirm(message)) return;
    setBusy(true);
    try { const result = await services.operations.setProductStatus({id: product.id, expectedVersion: product.catalogVersion, action, restoreRevision: revision}); const message = result.ok ? (action === 'archive' ? '产品已下架，历史订单不受影响。' : '历史版本已恢复为新草稿，尚未发布。') : `操作失败：${result.error}`; if (result.ok) await reload(product.id, message); else setNotice(message); }
    catch (error) { setNotice(`操作失败：${error instanceof Error ? error.message : '网络异常，请重试'}`); }
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
    <div className="product-editor-layout"><section className="product-editor-main"><nav className="product-editor-tabs" aria-label="产品编辑分区">{tabs.map((item) => <button type="button" aria-current={tab === item.id ? 'page' : undefined} className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>{tab === 'media' && <MediaPanel draft={draft} update={update} upload={upload} uploadBusy={uploadBusy} uploadNotice={uploadNotice} />}{tab === 'itinerary' && <ItineraryPanel draft={draft} update={update} upload={upload} uploadBusy={uploadBusy} />}{tab === 'rules' && <RulesPanel draft={draft} update={update} />}{tab === 'locales' && <LocalesPanel draft={draft} update={update} locale={editingLocale} setLocale={setEditingLocale} />}<details className="product-revisions"><summary>历史版本（{revisions.length}）</summary>{revisions.map((revision) => <div key={revision.revisionNumber}><span><b>v{revision.revisionNumber} · {revision.state}</b>　{revision.title}</span><button type="button" disabled={busy || dirty || revision.revisionNumber === product.draftRevision} onClick={() => void setStatus('restore', revision.revisionNumber)}>恢复为新草稿</button></div>)}</details></section><div className="product-editor-preview-column"><div className="product-preview-controls"><div><button type="button" className={previewMode === 'detail' ? 'active' : ''} onClick={() => setPreviewMode('detail')}>路线详情</button><button type="button" className={previewMode === 'card' ? 'active' : ''} onClick={() => setPreviewMode('card')}>列表卡片</button></div><select aria-label="预览语言" value={previewLocale} onChange={(event) => setPreviewLocale(event.target.value)}>{localeOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><ProductPhonePreview draft={draft} locale={previewLocale} mode={previewMode} dirty={dirty} /></div></div>
    <footer className="product-editor-savebar"><div><b>{uploadBusy ? '图片正在上传' : dirty ? '有未保存修改' : '草稿内容已保存'}</b><small>版本 {product.catalogVersion}；并发冲突时不会覆盖他人修改</small></div><div><button className="button secondary" type="button" disabled={busy || uploadBusy || !dirty} onClick={() => void reload(product.id)}>放弃修改</button><button className="button" type="button" disabled={busy || uploadBusy || !dirty} onClick={() => void save()}>{busy ? '正在保存…' : '保存草稿'}</button><button className="button" type="button" disabled={busy || uploadBusy || dirty || product.draftRevision == null} onClick={() => void publish()}>发布草稿</button>{product.status !== 'archived' && <button className="button secondary" type="button" disabled={busy || uploadBusy || dirty} onClick={() => void setStatus('archive')}>下架</button>}<button className="button secondary" type="button" disabled={busy || uploadBusy} onClick={() => { if (!dirty || window.confirm('当前修改尚未保存，确定返回吗？')) navigate(-1); }}>返回</button></div></footer>
  </main>;
}
