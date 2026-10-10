import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Link, useLocation, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {useApp} from '../store';
import type {OperationsAttraction, OperationsPolicyTemplate, OperationsProduct, OperationsProductRevision} from '../../shared/integrations/supabaseOperations';
import {ProductPhonePreview, type AttractionPreviewContent, type PreviewMode} from './ProductPhonePreview';
import {draftContent, draftFromProduct, type ProductDraft, type ProductEditorLocale, type ProductEditorStop} from './productDraft';
import {validateWebReadySpotVideo} from './productSpotVideo';
import {RouteContentWorkflow} from './RouteContentWorkflow';
import {isRouteContentPackage, sanitizeRouteContent, type ContentPackage} from '../../shared/contentPackages';
import {attractionGuideCorpus,type AttractionRecord} from '../../shared/attractions/guideCorpus.generated';
import {policyLocalizationText} from './policyLocalization';

type EditorTab = 'media' | 'itinerary' | 'rules' | 'locales';
const tabs: Array<{id: EditorTab; label: string}> = [
  {id: 'media', label: '图文与视频'}, {id: 'itinerary', label: '景点行程'},
  {id: 'rules', label: '费用须知'}, {id: 'locales', label: '多语言'},
];
const localeOptions = [{id: 'zh-CN', label: '简体中文'}, {id: 'zh-TW', label: '繁體中文'}, {id: 'ja', label: '日本語'}, {id: 'en', label: 'English'}, {id: 'ko', label: '한국어'}, {id: 'es', label: 'Español'}, {id: 'vi', label: 'Tiếng Việt'}, {id: 'ne', label: 'नेपाली'}];
const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const lineText = (value: string[]) => value.join('\n');
type AttractionOption={id:string;label:string;status:OperationsAttraction['status']|'bundled';textComplete:number;audioComplete:number};
const bundledAttractionOptions:AttractionOption[]=(attractionGuideCorpus as AttractionRecord[]).map(attraction=>({id:attraction.id,label:`${attraction.guides['zh-CN'].title} · ${attraction.id}`,status:'bundled',textComplete:Object.keys(attraction.guides).length,audioComplete:0}));
const bundledAttractionPreviewContent:AttractionPreviewContent=Object.fromEntries((attractionGuideCorpus as AttractionRecord[]).map(attraction=>[attraction.id,{status:'bundled',guides:attraction.guides,audio:attraction.audio}]));

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

type UploadTarget = {kind: 'hero'} | {kind: 'heroVideoPoster'} | {kind: 'gallery'; index?: number} | {kind: 'stopGallery'; editorId: string};
type VideoUploadState = {progress: number; message: string; failed: boolean; localUrl?: string};

function MediaPanel({draft, update, upload, uploadHeroVideo, uploadBusy, uploadNotice, heroVideoState}: {draft: ProductDraft; update: (patch: Partial<ProductDraft>) => void; upload: (file: File, target: UploadTarget) => Promise<void>; uploadHeroVideo: (file: File) => Promise<void>; uploadBusy: boolean; uploadNotice: string; heroVideoState?: VideoUploadState}) {
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
    <section className="product-editor-card"><header><div><h2>让游客想出发的介绍</h2><p>中文草稿是其他语言版本的来源；Hero 标题与强调词会同步到路线详情 V2。</p></div><span>中文原文</span></header><Field label="路线标题"><input value={draft.title} required onChange={(event) => update({title: event.target.value})} /></Field><div className="product-editor-fields-two"><Field label="Hero 标题"><input value={draft.heroTitle} onChange={(event) => update({heroTitle: event.target.value})} /></Field><Field label="Hero 标题强调词"><input value={draft.heroHighlightPhrase} onChange={(event) => update({heroHighlightPhrase: event.target.value})} /></Field></div><Field label="Hero 副标题"><textarea value={draft.heroSubtitle} onChange={(event) => update({heroSubtitle: event.target.value})} /></Field><Field label="一句话简介"><textarea value={draft.summary} required onChange={(event) => update({summary: event.target.value})} /></Field><Field label="详细介绍"><textarea value={draft.description} onChange={(event) => update({description: event.target.value})} /></Field><div className="product-editor-fields-two"><Field label="出发城市"><input value={draft.departureCity} onChange={(event) => update({departureCity: event.target.value})} /></Field><Field label="地区"><input value={draft.region} onChange={(event) => update({region: event.target.value})} /></Field></div><div className="product-editor-fields-two"><Field label="行程时长"><input value={draft.duration} onChange={(event) => update({duration: event.target.value})} /></Field><Field label="Hero 媒体比例"><select value={draft.heroAspectRatio} onChange={(event) => update({heroAspectRatio: event.target.value})}><option value="16:9">16:9 横版（推荐）</option><option value="3:2">3:2 横版</option><option value="4:3">4:3 横版</option><option value="9:16">9:16 视频在横版框裁切</option></select></Field></div><div className="product-editor-fields-two"><Field label="步行强度"><input value={draft.walkingLevel} onChange={(event) => update({walkingLevel: event.target.value})} /></Field><Field label="服务语言（每行一种）"><textarea value={lineText(draft.languages)} onChange={(event) => update({languages: lines(event.target.value)})} /></Field></div><Field label="路线亮点（每行一项）"><textarea value={lineText(draft.highlights)} onChange={(event) => update({highlights: lines(event.target.value)})} /></Field></section>
    <section className="product-editor-card product-spot-video-editor" aria-label="路线 Hero 视频"><header><div><h2>路线 Hero 视频</h2><p>MP4（H.264/AAC）最多 50MB；游客端静音自动播放并循环，不允许自动播放声音。</p></div><span>草稿媒体</span></header>
      {draft.heroVideo?.url && <video controls preload="metadata" playsInline poster={draft.heroVideo.posterUrl || draft.heroImageUrl || undefined} src={draft.heroVideo.url} />}
      {heroVideoState && <><div className="product-video-progress" aria-label={`上传进度 ${heroVideoState.progress}%`}><i style={{width: `${heroVideoState.progress}%`}} /></div><p className={heroVideoState.failed ? 'product-video-error' : 'product-video-note'} role="status">{heroVideoState.message}</p></>}
      {!heroVideoState && <p className="product-video-note">上传成功后才写入持久地址；保存草稿前不会改变游客公开页面。</p>}
      <div className="product-spot-video-actions"><label className="button secondary">{draft.heroVideo ? '更换 Hero 视频' : '上传 Hero 视频'}<input aria-label={draft.heroVideo ? '更换 Hero 视频' : '上传 Hero 视频'} type="file" accept="video/mp4" disabled={uploadBusy || (!!heroVideoState && !heroVideoState.failed && heroVideoState.progress < 100)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadHeroVideo(file); event.currentTarget.value = ''; }} /></label>
        <label className="button secondary">上传 Hero 封面<input aria-label="上传 Hero 视频封面" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadBusy || !draft.heroVideo} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, {kind: 'heroVideoPoster'}); event.currentTarget.value = ''; }} /></label>
        {draft.heroVideo && <button type="button" onClick={() => update({heroVideo: undefined})}>移除视频引用</button>}</div>
    </section>
  </div>;
}
function ItineraryPanel({draft, update, upload, uploadBusy, attractions}: {draft: ProductDraft; update: (patch: Partial<ProductDraft>) => void; upload: (file: File, target: UploadTarget) => Promise<void>; uploadBusy: boolean; attractions:AttractionOption[]}) {
  const change = (editorId: string, patch: Partial<ProductEditorStop>) => update({itinerary: draft.itinerary.map((item) => item.editorId === editorId ? {...item, ...patch} : item)});
  const move = (index: number, offset: number) => { const target = index + offset; if (target < 0 || target >= draft.itinerary.length) return; const itinerary = [...draft.itinerary]; [itinerary[index], itinerary[target]] = [itinerary[target], itinerary[index]]; update({itinerary}); };
  const add = (kind:'attraction'|'normal') => { const id = crypto.randomUUID(); update({itinerary: [...draft.itinerary, {id, editorId: `stop-${id}`, title: kind==='normal'?'新行程节点':'', type:kind==='normal'?'route-node':'spot', gallery:[]}]}); };
  const movePhoto=(item:ProductEditorStop,index:number,offset:number)=>{const gallery=[...(item.gallery??[])];const target=index+offset;if(target<0||target>=gallery.length)return;[gallery[index],gallery[target]]=[gallery[target],gallery[index]];change(item.editorId,{gallery,imageUrl:gallery[0]||undefined});};
  const removePhoto=(item:ProductEditorStop,index:number)=>{const gallery=(item.gallery??[]).filter((_,photoIndex)=>photoIndex!==index);change(item.editorId,{gallery,imageUrl:gallery[0]||undefined});};
  const setCover=(item:ProductEditorStop,index:number)=>{const gallery=[...(item.gallery??[])];const [cover]=gallery.splice(index,1);gallery.unshift(cover);change(item.editorId,{gallery,imageUrl:cover});};
  return <section className="product-editor-card"><header><div><h2>景点行程</h2><p>稳定景点标识保证改名不丢焦点；排序会同步到游客预览。</p></div><span>{draft.itinerary.length} 个景点</span></header>
    <div className="product-itinerary-list">{draft.itinerary.map((item, index) => {
      const title = String(item.title ?? item.name ?? '未命名景点');
      const attraction=attractions.find(option=>option.id===item.attractionId);const suggestion=attractions.find(option=>option.id===item.suggestedAttractionId);
      const gallery=[...new Set([...(item.gallery??[]),String(item.imageUrl??'')].filter(Boolean))];
      return <details key={item.editorId} open={index === 0}><summary><span>{index + 1}</span><b>{title||attraction?.label||'未选择景点'}</b><small>{Number(item.stayMinutes) > 0 ? `${Number(item.stayMinutes)} 分钟` : '未设置停留时间'}</small></summary><div className="product-itinerary-fields">
        <div className="product-editor-fields-two"><Field label="景点名称"><input value={String(item.title ?? item.name ?? '')} onChange={(event) => change(item.editorId, {title: event.target.value})} /></Field><Field label="地点"><input value={String(item.location ?? '')} onChange={(event) => change(item.editorId, {location: event.target.value})} /></Field></div><Field label="景点库引用（公共导览文字 / 音频）"><select value={String(item.attractionId ?? '')} onChange={(event) => change(item.editorId, {attractionId:event.target.value || undefined,suggestedAttractionId:undefined})}><option value="">普通行程节点（不关联景点）</option>{attractions.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>{attraction?<p className="product-video-note">Canonical: {attraction.id} · 状态 {attraction.status} · 文字 {attraction.textComplete}/7 · 音频 {attraction.audioComplete}/7。路线仅保存 attractionId、时间、备注与照片。</p>:suggestion?<p className="product-video-note">待确认建议：{suggestion.label}。应用后仍需保存草稿，系统不会自动写入数据库。</p>:<p className="product-video-note">集合、返回、自由活动及组合行程可以保留为普通节点；系统不会模糊匹配。</p>}
        <div className="product-editor-fields-two"><Field label="预计时间"><input value={String(item.time ?? '')} onChange={(event) => change(item.editorId, {time: event.target.value})} /></Field><Field label="停留分钟"><input type="number" min="0" value={Number(item.stayMinutes ?? 0)} onChange={(event) => change(item.editorId, {stayMinutes: Number(event.target.value) || 0})} /></Field></div>
        <Field label="路线特有说明"><textarea value={String(item.tip ?? '')} onChange={(event) => change(item.editorId, {tip: event.target.value})} /></Field>{!item.attractionId&&<Field label="普通节点介绍"><textarea value={String(item.description ?? '')} onChange={(event) => change(item.editorId, {description:event.target.value,shortDescription:event.target.value})}/></Field>}
        <section className="product-stop-gallery"><header><h3>本路线景点照片</h3><span>{gallery.length} 张 · 第一张为封面</span></header><label className="button secondary">上传照片<input aria-label={`上传${title||'景点'}照片`} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploadBusy} onChange={(event)=>{const files=[...(event.target.files??[])];event.currentTarget.value='';void(async()=>{for(const file of files)await upload(file,{kind:'stopGallery',editorId:item.editorId});})();}}/></label><div className="product-media-grid">{gallery.map((url,photoIndex)=><article key={`${url}-${photoIndex}`}><img src={url} alt="景点图片预览"/><span>{photoIndex===0?'封面':'图库'}</span><div>{photoIndex>0&&<button type="button" onClick={()=>setCover(item,photoIndex)}>设为封面</button>}<button type="button" disabled={photoIndex===0} onClick={()=>movePhoto(item,photoIndex,-1)}>前移</button><button type="button" disabled={photoIndex===gallery.length-1} onClick={()=>movePhoto(item,photoIndex,1)}>后移</button><button type="button" onClick={()=>removePhoto(item,photoIndex)}>移除</button></div></article>)}</div></section>
        <div className="operations-task-actions"><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>上移</button><button type="button" disabled={index === draft.itinerary.length - 1} onClick={() => move(index, 1)}>下移</button><button type="button" onClick={() => update({itinerary: draft.itinerary.filter((entry) => entry.editorId !== item.editorId)})}>删除景点</button><button type="button" onClick={() => document.getElementById(`preview-${item.editorId}`)?.scrollIntoView({block: 'center'})}>定位预览</button></div>
      </div></details>;
    })}</div>
    <div className="operations-task-actions"><button className="button secondary" type="button" onClick={()=>add('attraction')}>＋ 新增景点</button><button className="button secondary" type="button" onClick={()=>add('normal')}>＋ 新增普通节点</button></div>
  </section>;
}
const policyLabel=(template:OperationsPolicyTemplate)=>template.templateKey==='standard-10h-v1'?'标准10小时服务规则':template.templateKey==='standard-24h-v1'?'标准24小时退改规则':'JTW旅游通用规则';
function InheritedPolicies({items,locale}: {items:OperationsPolicyTemplate[];locale:string}) {
  const ordered=['jtw-day-trip-standard','standard-10h-v1','standard-24h-v1'];
  return <section className="product-editor-card product-inherited-policies"><header><div><h2>本路线继承的规则</h2><p>规则正文由共享 Policy 管理；路线只保存引用/版本关系，不复制正文。</p></div></header>{ordered.map(key=>{const item=items.find(value=>value.templateKey===key);const sections=Object.entries((item?.localizations[locale]??item?.localizations['zh-CN']??{}) as Record<string,unknown>).map(([name,value])=>[name,policyLocalizationText(value)] as const).filter(([,value])=>Boolean(value));return <article key={key}><b>{item?policyLabel(item):key}</b><small>{item?.versionNumber==null?'未读取版本':`v${item.versionNumber} · ${item.versionState} · ${Object.values(item.localizations).filter(value=>Object.values(value).some(Boolean)).length}/7`}</small>{item?<details><summary>查看内容（{locale}）</summary>{sections.length?sections.map(([name,value])=><p key={name}><b>{name}</b>：{value}</p>):<p>POLICY_CONTENT_GAP：当前语言没有已确认的规则正文。</p>}</details>:<p>POLICY_CONTENT_GAP：未找到该共享规则模块。</p>}</article>})}</section>;
}
function RulesPanel({draft, update, policies, locale}: {draft: ProductDraft; update: (patch: Partial<ProductDraft>) => void; policies:OperationsPolicyTemplate[]; locale:string}) {
  return <div className="product-editor-stack"><section className="product-editor-card"><header><div><h2>本路线费用与提醒</h2><p>仅维护路线专属内容；通用预订、退改、参加、安全及行李规则不在路线内重复录入。</p></div></header><Field label="费用包含"><textarea value={lineText(draft.included)} onChange={(event) => update({included: lines(event.target.value)})} /></Field><Field label="费用不包含"><textarea value={lineText(draft.excluded)} onChange={(event) => update({excluded: lines(event.target.value)})} /></Field><Field label="出发准备"><textarea value={lineText(draft.preparation)} onChange={(event) => update({preparation: lines(event.target.value)})} /></Field><Field label="路线特别提醒（每行一项）"><textarea value={lineText(draft.notices)} onChange={(event) => update({notices: lines(event.target.value)})} /></Field></section><InheritedPolicies items={policies} locale={locale}/></div>;
}
function LocalesPanel({draft, update, locale, setLocale}: {draft: ProductDraft; update: (patch: Partial<ProductDraft>) => void; locale: string; setLocale: (value: string) => void}) {
  const current = draft.locales[locale] ?? {};
  const set = (patch: Partial<ProductEditorLocale>) => update({locales: {...draft.locales, [locale]: {...current, ...patch}}});
  const itinerary=current.itinerary&&typeof current.itinerary==='object'&&!Array.isArray(current.itinerary)?current.itinerary as Record<string,Record<string,unknown>>:{};
  const setStop=(id:string,patch:Record<string,string>)=>set({itinerary:{...itinerary,[id]:{...(itinerary[id]??{}),...patch}}});
  return <section className="product-editor-card"><header><div><h2>7语言标题 / 简介</h2><p>路线自身文案使用统一 locale 结构；景点正文和音频仍由 Attraction CMS 提供。</p></div><select aria-label="编辑语言" value={locale} onChange={(event) => setLocale(event.target.value)}>{localeOptions.filter((item) => item.id !== 'zh-CN'&&item.id!=='zh-TW').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></header><div className="product-editor-locale-note">中文原文在“图文与视频”维护；当前编辑 {locale}。历史扩展字段会原样保留。</div><Field label="路线标题"><input value={String(current.title ?? '')} onChange={(event) => set({title: event.target.value})} /></Field><Field label="一句话简介"><textarea value={String(current.summary ?? '')} onChange={(event) => set({summary: event.target.value})} /></Field><Field label="详细介绍"><textarea value={String(current.description ?? '')} onChange={(event) => set({description: event.target.value})} /></Field><div className="product-editor-fields-two"><Field label="地区"><input value={String(current.region ?? '')} onChange={(event) => set({region: event.target.value})} /></Field><Field label="行程时长"><input value={String(current.duration ?? '')} onChange={(event) => set({duration: event.target.value})} /></Field></div><h3>普通行程节点</h3>{draft.itinerary.filter(item=>!item.attractionId).map(item=>{const id=String(item.id??item.stopId??item.placeId??item.editorId);const translated=itinerary[id]??{};return <div className="product-editor-fields-two" key={item.editorId}><Field label={`${String(item.title??'普通节点')} · 标题`}><input value={String(translated.stop_title??translated.title??'')} onChange={event=>setStop(id,{stop_title:event.target.value})}/></Field><Field label="路线特有说明"><input value={String(translated.tip??'')} onChange={event=>setStop(id,{tip:event.target.value})}/></Field></div>})}</section>;
}

export function ProductEditPage() {
  const {services, refreshCatalog} = useApp(); const {productId = ''} = useParams(); const navigate = useNavigate(); const location = useLocation(); const [searchParams] = useSearchParams();
  const [product, setProduct] = useState<OperationsProduct | null>(null); const [draft, setDraft] = useState<ProductDraft | null>(null); const [revisions, setRevisions] = useState<OperationsProductRevision[]>([]); const [attractions,setAttractions]=useState<AttractionOption[]>(bundledAttractionOptions); const [attractionContent,setAttractionContent]=useState<AttractionPreviewContent>(bundledAttractionPreviewContent); const [attractionReload,setAttractionReload]=useState(0); const [policies,setPolicies]=useState<OperationsPolicyTemplate[]>([]); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [uploadBusy, setUploadBusy] = useState(false); const [uploadNotice, setUploadNotice] = useState(''); const [videoUploads, setVideoUploads] = useState<Record<string, VideoUploadState>>({}); const [dirty, setDirty] = useState(false); const [tab, setTab] = useState<EditorTab>('media'); const [previewMode, setPreviewMode] = useState<PreviewMode>('detail'); const [previewLocale, setPreviewLocale] = useState('zh-CN'); const [editingLocale, setEditingLocale] = useState('ja'); const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit'); const [mobileMoreOpen, setMobileMoreOpen] = useState(false); const requestVersion = useRef(0); const attractionRequestVersion=useRef(0); const objectUrls = useRef(new Set<string>()); const backTo = returnUrl(searchParams); const videoUploadBusy = Object.values(videoUploads).some((state) => !state.failed && state.progress < 100); useUnsavedGuard(dirty);
  const attractionGuideKey=useMemo(()=>[...new Set((draft?.itinerary??[]).map(item=>String(item.attractionId??'')).filter(Boolean))].sort().join('|'),[draft?.itinerary]);
  const pendingAssociations=useMemo(()=>(draft?.itinerary??[]).filter(item=>!item.attractionId&&item.suggestedAttractionId),[draft?.itinerary]);
  const reload = async (targetId = productId, successNotice = '') => {
    if (!services) return; const request = ++requestVersion.current; setBusy(true); setNotice('');
    try { const list = await services.operations.listProducts(); if (request !== requestVersion.current) return; if (list.error) throw new Error(list.error); const target = list.data.find((item) => item.id === targetId); if (!target) { setProduct(null); setDraft(null); setRevisions([]); setNotice('路线不存在或无访问权限'); return; } setProduct(target); setDraft(draftFromProduct(target)); setVideoUploads({}); setDirty(false); const history = await services.operations.listProductRevisions(target.id); if (request !== requestVersion.current) return; setRevisions(history.error ? [] : history.data); if (history.error) setNotice(`版本记录读取失败：${history.error}`); else if (successNotice) setNotice(successNotice); }
    catch (error) { if (request === requestVersion.current) { setProduct(null); setDraft(null); setRevisions([]); setNotice(`读取失败：${error instanceof Error ? error.message : '网络异常，请重试'}`); } }
    finally { if (request === requestVersion.current) setBusy(false); }
  };
  useEffect(() => { void reload(); return () => { requestVersion.current += 1; objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); objectUrls.current.clear(); }; }, [services, productId]);
  useEffect(()=>{if(!services||typeof services.operations.listAttractions!=='function')return;void services.operations.listAttractions().then(result=>{if(result.error)return;setAttractions(current=>{const remote=result.data.map(item=>{const bundled=current.find(existing=>existing.id===item.slug);return {id:item.slug,label:bundled?.label??item.slug,status:item.status,textComplete:item.textComplete,audioComplete:item.audioComplete};});return [...remote,...current.filter(item=>!remote.some(existing=>existing.id===item.id))];});});},[services]);
  useEffect(()=>{const request=++attractionRequestVersion.current;const ids=attractionGuideKey.split('|').filter(Boolean);if(!services||!ids.length||typeof services.operations.getAttraction!=='function'){setAttractionContent(bundledAttractionPreviewContent);return;}void Promise.all(ids.map(async id=>{const result=await services.operations.getAttraction(id);return [id,result] as const;})).then(rows=>{if(request!==attractionRequestVersion.current)return;setAttractionContent(Object.fromEntries(rows.map(([id,result])=>[id,result.data?{status:result.data.status,guides:result.data.guides,audio:result.data.audio,error:null}:{status:'draft',guides:{},audio:{},error:result.error??'读取失败'}])));});return()=>{attractionRequestVersion.current+=1};},[services,attractionGuideKey,attractionReload]);
  useEffect(()=>{if(!services||typeof services.operations.listPolicyTemplates!=='function')return;void services.operations.listPolicyTemplates().then(result=>{if(!result.error)setPolicies(result.data);});},[services]);
  const update = (patch: Partial<ProductDraft>) => { setDraft((current) => current ? {...current, ...patch} : current); setDirty(true); setNotice(''); };
  const applySuggestedAssociations=()=>{if(!draft||!pendingAssociations.length)return;update({itinerary:draft.itinerary.map(item=>!item.attractionId&&item.suggestedAttractionId?{...item,attractionId:item.suggestedAttractionId,suggestedAttractionId:undefined}:item)});setNotice(`已应用 ${pendingAssociations.length} 个明确景点关联；请保存草稿后再发布。`);};
  const importChinesePackage = (contentPackage: ContentPackage) => {
    if (!product || !isRouteContentPackage(contentPackage)) return;
    const imported = contentPackage.route;
    const next = draftFromProduct({...product, title: imported.title, content: {...product.content, ...sanitizeRouteContent(imported.content).content}, heroImageUrl: imported.hero_image_url ?? product.heroImageUrl, gallery: imported.gallery ?? product.gallery});
    setDraft(next); setDirty(true); setNotice('中文内容包已载入当前草稿；请核对后保存，尚未影响已发布路线。');
  };
  const reviewTranslationLocale = (locale: string) => {
    setDraft(current => {
      if (!current) return current;
      const local = current.locales[locale] ?? {}; const packageMeta = local._content_package && typeof local._content_package === 'object' ? local._content_package as Record<string, unknown> : {}; const fields = packageMeta.fields && typeof packageMeta.fields === 'object' ? packageMeta.fields as Record<string, Record<string, unknown>> : {};
      const reviewed = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.status === 'draft' ? {...value, status: 'reviewed'} : value]));
      return {...current, locales: {...current.locales, [locale]: {...local, _content_package: {...packageMeta, fields: reviewed}}}};
    }); setDirty(true);
  };
  const upload = async (file: File, target: UploadTarget) => {
    if (!services || !product || uploadBusy) return;
    const localUrl = URL.createObjectURL(file); objectUrls.current.add(localUrl); setUploadBusy(true); setUploadNotice('正在上传，当前显示本地预览…');
    setDraft((current) => {
      if (!current) return current;
      if (target.kind === 'hero') return {...current, heroImageUrl: localUrl};
      if (target.kind === 'heroVideoPoster') return current.heroVideo ? {...current, heroVideo: {...current.heroVideo, posterUrl: localUrl}} : current;
      if (target.kind === 'gallery') return {...current, gallery: target.index == null ? [...current.gallery, localUrl] : current.gallery.map((item, index) => index === target.index ? localUrl : item)};
      return {...current, itinerary: current.itinerary.map((item) => item.editorId === target.editorId ? {...item, gallery:[...(item.gallery??[]),localUrl], imageUrl:item.imageUrl||localUrl} : item)};
    }); setDirty(true);
    let uploaded = false;
    try {
      const result = await services.operations.uploadProductImage(product.id, file);
      if (result.error || !result.url) { setUploadNotice(`上传失败：${result.error ?? '未返回持久地址'}；输入已保留，可重新选择文件重试。`); return; }
      setDraft((current) => {
        if (!current) return current;
        if (target.kind === 'hero') return {...current, heroImageUrl: current.heroImageUrl === localUrl ? result.url! : current.heroImageUrl};
        if (target.kind === 'heroVideoPoster') return current.heroVideo?.posterUrl === localUrl ? {...current, heroVideo: {...current.heroVideo, posterUrl: result.url!}} : current;
        if (target.kind === 'gallery') return {...current, gallery: current.gallery.map((item) => item === localUrl ? result.url! : item)};
        return {...current, itinerary: current.itinerary.map((item) => item.editorId === target.editorId ? {...item,gallery:(item.gallery??[]).map(url=>url===localUrl?result.url!:url),imageUrl:item.imageUrl===localUrl?result.url!:item.imageUrl} : item)};
      });
      uploaded = true; setUploadNotice('图片上传成功，持久地址已加入当前草稿；请保存草稿完成关联。');
    } catch (error) { setUploadNotice(`上传失败：${error instanceof Error ? error.message : '网络异常'}；输入已保留，可重新选择文件重试。`); }
    finally { setUploadBusy(false); if (uploaded) { URL.revokeObjectURL(localUrl); objectUrls.current.delete(localUrl); } }
  };
  const uploadHeroVideo = async (file: File) => {
    if (!services || !product || videoUploadBusy) return;
    const validationError = await validateWebReadySpotVideo(file);
    if (validationError) { setVideoUploads((current) => ({...current, __hero__: {progress: 0, message: `上传失败：${validationError}`, failed: true}})); return; }
    const previousLocal = videoUploads.__hero__?.localUrl;
    if (previousLocal) { URL.revokeObjectURL(previousLocal); objectUrls.current.delete(previousLocal); }
    const localUrl = URL.createObjectURL(file); objectUrls.current.add(localUrl);
    setVideoUploads((current) => ({...current, __hero__: {progress: 0, message: '正在直传 Hero 视频到素材存储…', failed: false, localUrl}}));
    try {
      const result = await services.operations.uploadProductSpotVideo(product.id, 'hero', file, (progress) => setVideoUploads((current) => ({...current, __hero__: {...current.__hero__, progress, message: progress < 100 ? `正在上传 ${progress}%…` : '上传完成，等待写入草稿'}})));
      if (result.error || !result.url || !result.storagePath) { setVideoUploads((current) => ({...current, __hero__: {progress: current.__hero__?.progress ?? 0, message: `上传失败：${result.error ?? '未返回持久地址'}；可重新选择文件重试。`, failed: true, localUrl}})); return; }
      setDraft((current) => current ? {...current, heroVideo: {url: result.url!, storagePath: result.storagePath!, posterUrl: current.heroVideo?.posterUrl || current.heroImageUrl || undefined, mimeType: 'video/mp4', sizeBytes: file.size, aspectRatio: current.heroAspectRatio}} : current);
      setDirty(true); setVideoUploads((current) => ({...current, __hero__: {progress: 100, message: 'Hero 视频上传成功，已加入当前草稿；请保存草稿完成关联。', failed: false}}));
      URL.revokeObjectURL(localUrl); objectUrls.current.delete(localUrl);
    } catch (error) { setVideoUploads((current) => ({...current, __hero__: {progress: current.__hero__?.progress ?? 0, message: `上传失败：${error instanceof Error ? error.message : '网络异常'}；可重试。`, failed: true, localUrl}})); }
  };
  const save = async () => {
    if (!services || !product || !draft || busy || uploadBusy || videoUploadBusy) return false; if (!draft.title.trim() || !draft.summary.trim()) { setNotice('保存失败：标题和一句话简介不能为空'); return false; } if ([draft.heroImageUrl, ...draft.gallery, draft.heroVideo?.url ?? '', draft.heroVideo?.posterUrl ?? '', ...draft.itinerary.flatMap((item) => [String(item.imageUrl ?? ''), ...(item.gallery??[])])].some((url) => url.startsWith('blob:'))) { setNotice('保存失败：仍有图片或视频只存在于本地预览，请重新上传成功后再保存。'); return false; } setBusy(true);
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
    <div className="product-editor-preview-toggle" aria-label="移动端编辑预览切换"><button className={mobileView === 'edit' ? 'active' : ''} type="button" onClick={() => setMobileView('edit')}>编辑</button><button className={mobileView === 'preview' ? 'active' : ''} type="button" onClick={() => setMobileView('preview')}>预览</button></div>
    {pendingAssociations.length>0&&<aside className="operations-notice" role="status">发现 {pendingAssociations.length} 个景点关联待确认保存。<button type="button" onClick={applySuggestedAssociations}>应用关联</button></aside>}
    <div className="product-editor-layout" data-mobile-view={mobileView}><section className="product-editor-main"><nav className="product-editor-tabs" aria-label="产品编辑分区">{tabs.map((item) => <button type="button" aria-current={tab === item.id ? 'page' : undefined} className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>{tab === 'media' && <MediaPanel draft={draft} update={update} upload={upload} uploadHeroVideo={uploadHeroVideo} uploadBusy={uploadBusy} uploadNotice={uploadNotice} heroVideoState={videoUploads.__hero__} />}{tab === 'itinerary' && <ItineraryPanel draft={draft} update={update} upload={upload} uploadBusy={uploadBusy} attractions={attractions} />}{tab === 'rules' && <RulesPanel draft={draft} update={update} policies={policies} locale={previewLocale} />}{tab === 'locales' && <><RouteContentWorkflow product={product} draft={draft} update={update} onImportChinese={importChinesePackage} onReviewLocale={reviewTranslationLocale}/><LocalesPanel draft={draft} update={update} locale={editingLocale} setLocale={setEditingLocale} /></>}<details className="product-revisions"><summary>历史版本（{revisions.length}）</summary>{revisions.map((revision) => <div key={revision.revisionNumber}><span><b>v{revision.revisionNumber} · {revision.state}</b> {revision.title}</span><button type="button" disabled={busy || dirty || revision.revisionNumber === product.draftRevision} onClick={() => void setStatus('restore', revision.revisionNumber)}>恢复为新草稿</button></div>)}</details></section><div className="product-editor-preview-column"><div className="product-preview-controls"><div><button type="button" className={previewMode === 'detail' ? 'active' : ''} onClick={() => setPreviewMode('detail')}>路线详情</button><button type="button" className={previewMode === 'card' ? 'active' : ''} onClick={() => setPreviewMode('card')}>列表卡片</button></div><select aria-label="预览语言" value={previewLocale} onChange={(event) => setPreviewLocale(event.target.value)}>{localeOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><ProductPhonePreview draft={draft} locale={previewLocale} mode={previewMode} dirty={dirty} attractionContent={attractionContent} pendingAssociationCount={pendingAssociations.length} onRetryAttractions={()=>setAttractionReload(value=>value+1)}/>{tab==='rules'&&<InheritedPolicies items={policies} locale={previewLocale}/>}</div></div>
    <footer className="product-editor-savebar"><div><b>{videoUploadBusy ? '视频正在上传' : uploadBusy ? '图片正在上传' : dirty ? '有未保存修改' : pendingAssociations.length ? `发现 ${pendingAssociations.length} 个景点关联待确认保存` : '草稿内容已保存'}</b><small>版本 {product.catalogVersion}；并发冲突时不会覆盖他人修改</small></div><div className="product-editor-save-actions"><button className="button product-editor-save-primary" type="button" disabled={busy || uploadBusy || videoUploadBusy || !dirty} onClick={() => void save()}>{busy ? '正在保存…' : '保存草稿'}</button><button className="button product-editor-save-primary" type="button" disabled={busy || uploadBusy || videoUploadBusy || dirty || product.draftRevision == null} onClick={() => void publish()}>发布草稿</button><button className="button secondary product-editor-more-toggle" type="button" aria-expanded={mobileMoreOpen} aria-controls="product-editor-more-actions" onClick={() => setMobileMoreOpen((value) => !value)}>更多</button><div id="product-editor-more-actions" className="product-editor-more-actions" data-open={mobileMoreOpen ? 'true' : 'false'}><button className="button secondary" type="button" disabled={busy || uploadBusy || videoUploadBusy || !dirty} onClick={() => { setMobileMoreOpen(false); void reload(product.id); }}>放弃修改</button>{product.status !== 'archived' && <button className="button secondary" type="button" disabled={busy || uploadBusy || videoUploadBusy || dirty} onClick={() => { setMobileMoreOpen(false); void setStatus('archive'); }}>下架</button>}<button className="button secondary" type="button" disabled={busy || uploadBusy || videoUploadBusy} onClick={() => { setMobileMoreOpen(false); if (!dirty || window.confirm('当前修改尚未保存，确定返回吗？')) navigate(-1); }}>返回</button></div></div></footer>
  </main>;
}
