import {FormEvent, useEffect, useMemo, useState} from 'react';
import {Link, NavigateFunction, useLocation, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {useApp} from '../store';
import type {OperationsProduct, OperationsProductRevision} from '../../shared/integrations/supabaseOperations';

type ItineraryStop = Record<string, unknown> & {
  title?: string;
  name?: string;
  description?: string;
  location?: string;
  time?: string;
  stayMinutes?: number;
  imageUrl?: string;
  tip?: string;
};

function toJsonString(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function ItineraryEditor({initial, onChange}: {initial: unknown; onChange: (value: ItineraryStop[]) => void}) {
  const [items, setItems] = useState<ItineraryStop[]>(Array.isArray(initial) ? (initial as ItineraryStop[]) : []);
  const update = (index: number, key: keyof ItineraryStop, value: string) =>
    setItems((current) => {
      const next = current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return {
          ...item,
          [key]:
            key === 'stayMinutes'
              ? Number(value) || 0
              : value,
        } as ItineraryStop;
      });
      onChange(next);
      return next;
    });

  const move = (index: number, offset: number) =>
    setItems((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
      return next;
    });

  const remove = (index: number) => {
    setItems((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      onChange(next);
      return next;
    });
  };

  const add = () =>
    setItems((current) => {
      const next = [...current, {title: '新景点', description: ''}];
      onChange(next);
      return next;
    });

  return (
    <fieldset className="operations-itinerary-editor">
      <legend>景点图文与展示顺序</legend>
      <input name="itinerary" type="hidden" value={JSON.stringify(items)} readOnly />
      {items.map((item, index) => (
        <article key={`${index}-${String(item.title ?? item.name ?? '')}`}>
          <header>
            <b>{index + 1}. {String(item.title ?? item.name ?? '未命名景点')}</b>
            <div className="operations-task-actions">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
                上移
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1}>
                下移
              </button>
              <button type="button" onClick={() => remove(index)}>
                删除
              </button>
            </div>
          </header>
          <label>景点名称
            <input value={String(item.title ?? item.name ?? '')} onChange={(event) => update(index, 'title', event.target.value)} required />
          </label>
          <label>地点
            <input value={String(item.location ?? '')} onChange={(event) => update(index, 'location', event.target.value)} />
          </label>
          <label>预计时间
            <input value={String(item.time ?? '')} onChange={(event) => update(index, 'time', event.target.value)} />
          </label>
          <label>停留分钟
            <input type="number" min="0" value={Number(item.stayMinutes ?? 0)} onChange={(event) => update(index, 'stayMinutes', event.target.value)} />
          </label>
          <label>景点介绍
            <textarea value={String(item.description ?? '')} onChange={(event) => update(index, 'description', event.target.value)} />
          </label>
          <label>图片 URL
            <input type="url" value={String(item.imageUrl ?? '')} onChange={(event) => update(index, 'imageUrl', event.target.value)} />
          </label>
          <label>游览提示
            <textarea value={String(item.tip ?? '')} onChange={(event) => update(index, 'tip', event.target.value)} />
          </label>
        </article>
      ))}
      <button className="button secondary" type="button" onClick={add}>
        添加景点
      </button>
      <small>可增删和调整顺序；原有 gallery、highlights 等扩展字段会原样保留。</small>
    </fieldset>
  );
}

function statusLabel(item: OperationsProduct) {
  if (
    item.status === 'published' &&
    item.publishedRevision != null &&
    item.draftRevision != null &&
    item.draftRevision > item.publishedRevision
  ) {
    return '有草稿更新';
  }
  if (item.status === 'published') return '已发布';
  if (item.status === 'archived') return '已下架';
  return '草稿';
}

function buildReturnUrl(searchParams: URLSearchParams, navigate: NavigateFunction, fallback: string, fallbackPath = '/app/operations/products') {
  const raw = searchParams.get('returnTo');
  if (!raw) return fallbackPath;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.startsWith('/app/') ? decoded : fallbackPath;
  } catch {
    return fallback;
  }
}

export function ProductEditPage() {
  const {services, refreshCatalog} = useApp();
  const {productId = ''} = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [product, setProduct] = useState<OperationsProduct | null>(null);
  const [revisions, setRevisions] = useState<OperationsProductRevision[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [itinerary, setItinerary] = useState<ItineraryStop[]>([]);
  const returnTo = buildReturnUrl(searchParams, navigate, '/app/operations/products');
  const [dirty, setDirty] = useState(false);

  const reload = async (targetId?: string) => {
    if (!services) return;
    setBusy(true);
    const list = await services.operations.listProducts();
    if (list.error) {
      setNotice(list.error);
      setBusy(false);
      return;
    }
    const target = list.data.find((item) => item.id === (targetId ?? productId));
    if (!target) {
      setProduct(null);
      setNotice('路线不存在或无访问权限');
      setBusy(false);
      return;
    }
    setNotice('');
    setProduct(target);
    setItinerary(Array.isArray(target.content?.itinerary) ? [...(target.content.itinerary as ItineraryStop[])] : []);
    setRevisions([]);
    setDirty(false);
    const history = await services.operations.listProductRevisions(target.id);
    if (!history.error) setRevisions(history.data);
    setBusy(false);
  };

  useEffect(() => {
    const release = () => {
      const hasDraft = dirty;
      if (!hasDraft) return;
      const message = '有未保存修改，确定离开本页？';
      if (!window.confirm(message)) return false;
      return true;
    };
    window.addEventListener('beforeunload', release);
    return () => {
      window.removeEventListener('beforeunload', release);
    };
  }, [dirty]);

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services || !product) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const lines = (name: string) =>
      String(form.get(name) ?? '')
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean);

    let locales: Record<string, unknown>;
    try {
      locales = JSON.parse(String(form.get('locales') ?? '{}')) as Record<string, unknown>;
    } catch {
      setBusy(false);
      setNotice('保存失败：多语言 JSON 格式不正确');
      return;
    }

    let heroImageUrl = String(form.get('hero') ?? '').trim() || null;
    const gallery = lines('gallery');
    const heroFile = form.get('heroFile');
    if (heroFile instanceof File && heroFile.size > 0) {
      const upload = await services.operations.uploadProductImage(product.id, heroFile);
      if (upload.error) {
        setBusy(false);
        setNotice(`主图上传失败：${upload.error}`);
        return;
      }
      heroImageUrl = upload.url;
    }

    const galleryFiles = form.getAll('galleryFiles').filter((item): item is File => item instanceof File && item.size > 0);
    for (const [index, file] of galleryFiles.entries()) {
      const upload = await services.operations.uploadProductImage(product.id, file);
      if (upload.error) {
        setBusy(false);
        setNotice(`图库上传失败：${upload.error}`);
        return;
      }
      if (upload.url) gallery.push(upload.url);
    }

    const content = {
      ...product.content,
      summary: String(form.get('summary') ?? ''),
      description: String(form.get('description') ?? ''),
      region: String(form.get('region') ?? ''),
      duration: String(form.get('duration') ?? ''),
      walkingLevel: String(form.get('walkingLevel') ?? ''),
      languages: lines('languages'),
      stops: itinerary
        .map((item) => String(item.title ?? item.name ?? ''))
        .filter(Boolean),
      itinerary,
      highlights: lines('highlights'),
      included: lines('included'),
      excluded: lines('excluded'),
      notices: lines('notices'),
      locales,
    };
    const result = await services.operations.saveProductDraft({
      id: product.id,
      expectedVersion: product.catalogVersion,
      title: String(form.get('title') ?? ''),
      content,
      heroImageUrl,
      gallery,
    });
    setBusy(false);
    setNotice(result.ok ? '草稿已保存，游客仍看到原公开版本' : `保存失败：${result.error}`);
    if (result.ok) {
      await reload(product.id);
    }
  };

  const publish = async () => {
    if (!services || !product) return;
    setBusy(true);
    const result = await services.operations.publishProduct(product.id, product.catalogVersion);
    if (result.ok) {
      const refreshError = await refreshCatalog();
      setNotice(refreshError ? `发布成功，但游客目录刷新失败：${refreshError}` : '已发布并重新读取游客公开目录');
    } else {
      setNotice(`发布失败：${result.error}`);
    }
    setBusy(false);
    if (result.ok) await reload(product.id);
  };

  const setStatus = async (action: 'archive' | 'restore', revision?: number) => {
    if (!services || !product) return;
    if (
      !window.confirm(
        action === 'archive'
          ? '下架后游客端将立即不可见，确认继续？'
          : `确认把历史版本 v${revision} 恢复为新草稿？`
      )
    ) {
      return;
    }
    setBusy(true);
    const result = await services.operations.setProductStatus({
      id: product.id,
      expectedVersion: product.catalogVersion,
      action,
      restoreRevision: revision,
    });
    setNotice(result.ok ? (action === 'archive' ? '产品已下架，历史订单不受影响。' : '历史版本已复制为新草稿。') : `操作失败：${result.error}`);
    setBusy(false);
    if (result.ok) await reload(product.id);
  };

  const titleText = useMemo(() => `${product?.title ?? ''}${product ? '（' : ''}${product ? statusLabel(product) : ''}${product ? '）' : ''}`, [product]);
  useEffect(() => {
    void reload();
  }, [services, productId]);

  if (!productId) {
    return <main className="operations-page"><section className="operations-section"><p>路径不完整</p></section></main>;
  }

  if (busy && !product) {
    return <main className="operations-page"><section className="operations-section"><p>正在读取路线信息…</p></section></main>;
  }

  if (!product) {
    return (
      <main className="operations-page">
        <section className="operations-section">
          <p>{notice || '路线不存在或无访问权限。'}</p>
          <Link to="/app/operations/products">返回产品列表</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="operations-page">
      <header className="operations-hero">
        <div>
          <span>PRODUCT CENTER</span>
          <h1>产品编辑</h1>
          <p>{titleText}</p>
        </div>
        <div className="operations-task-actions">
          <Link className="button secondary" to={returnTo}>
            返回产品列表
          </Link>
          <Link className="button secondary" to={`/app/trips/${product.slug}`} target="_blank">
            查看当前公开页
          </Link>
        </div>
      </header>
      {notice && <p className="operations-notice">{notice}</p>}
      <section className="operations-section">
        <header>
          <div>
            <span>草稿操作</span>
            <h2>编辑内容</h2>
          </div>
          <small>版本 {product.catalogVersion}；冲突时拒绝覆盖</small>
        </header>
        <form
          key={`${product.id}:${product.catalogVersion}`}
          className="operations-controls"
          onSubmit={(event) => {
            setDirty(false);
            void createProduct(event);
          }}
        >
          <label>标题
            <input name="title" defaultValue={product.title} required onChange={() => setDirty(true)} />
          </label>
          <label>摘要
            <textarea name="summary" defaultValue={String(product.content?.summary ?? '')} required onChange={() => setDirty(true)} />
          </label>
          <label>详细介绍
            <textarea name="description" defaultValue={String(product.content?.description ?? '')} onChange={() => setDirty(true)} />
          </label>
          <label>地区
            <input name="region" defaultValue={String(product.content?.region ?? '')} onChange={() => setDirty(true)} />
          </label>
          <label>行程时长
            <input name="duration" defaultValue={String(product.content?.duration ?? '')} onChange={() => setDirty(true)} />
          </label>
          <label>步行强度
            <input name="walkingLevel" defaultValue={String(product.content?.walkingLevel ?? '')} onChange={() => setDirty(true)} />
          </label>
          <label>服务语言（每行一种）
            <textarea
              name="languages"
              defaultValue={Array.isArray(product.content?.languages) ? product.content.languages.join('\n') : ''}
              onChange={() => setDirty(true)}
            />
          </label>
          <ItineraryEditor initial={product.content?.itinerary} onChange={(next) => {
            setItinerary(next);
            setDirty(true);
          }} />
          <label>亮点（每行一项）
            <textarea
              name="highlights"
              defaultValue={Array.isArray(product.content?.highlights) ? product.content.highlights.join('\n') : ''}
              onChange={() => setDirty(true)}
            />
          </label>
          <label>费用包含（每行一项）
            <textarea
              name="included"
              defaultValue={Array.isArray(product.content?.included) ? product.content.included.join('\n') : ''}
              onChange={() => setDirty(true)}
            />
          </label>
          <label>费用不含（每行一项）
            <textarea
              name="excluded"
              defaultValue={Array.isArray(product.content?.excluded) ? product.content.excluded.join('\n') : ''}
              onChange={() => setDirty(true)}
            />
          </label>
          <label>注意事项（每行一项）
            <textarea
              name="notices"
              defaultValue={Array.isArray(product.content?.notices) ? product.content.notices.join('\n') : ''}
              onChange={() => setDirty(true)}
            />
          </label>
          <label>多语言内容 JSON（语言键下可填写 title、region、duration、stops）
            <textarea
              name="locales"
              defaultValue={toJsonString(product.content?.locales)}
              onChange={() => setDirty(true)}
            />
          </label>
          <label>主图 URL
            <input name="hero" defaultValue={product.heroImageUrl ?? ''} onChange={() => setDirty(true)} />
          </label>
          <label>
            或上传主图（JPG / PNG / WebP，最大 10MB）
            <input name="heroFile" type="file" accept="image/jpeg,image/png,image/webp" onChange={() => setDirty(true)} />
          </label>
          <label>图库（每行一张）
            <textarea name="gallery" defaultValue={product.gallery.join('\n')} onChange={() => setDirty(true)} />
          </label>
          <label>追加图库文件
            <input name="galleryFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={() => setDirty(true)} />
          </label>
          <div className="operations-task-actions">
            <button className="button" disabled={busy}>
              保存草稿
            </button>
            <button className="button" type="button" disabled={busy || product.draftRevision == null} onClick={() => void publish()}>
              发布草稿
            </button>
            {product.status !== 'archived' && (
              <button className="button secondary" type="button" disabled={busy} onClick={() => void setStatus('archive')}>
                下架产品
              </button>
            )}
            <button className="button secondary" type="button" disabled={busy} onClick={() => void navigate(-1)}>
              返回
            </button>
          </div>
          <small className="operations-hint">版本冲突时会返回当前最新版本，请按返回按钮或刷新后继续。</small>
        </form>
      </section>
      <section className="operations-section">
        <header>
          <div><span>历史版本</span><h2>版本记录</h2></div>
          <small>仅对该产品进行恢复操作</small>
        </header>
        <div className="operations-dispatch-list" aria-label="版本历史">
          {revisions.map((revision) => (
            <article key={revision.revisionNumber}>
              <div>
                <b>v{revision.revisionNumber} · {revision.state}</b>
                <span>{revision.title}</span>
              </div>
              <small>{new Date(revision.createdAt).toLocaleString('zh-CN')}</small>
              <button
                type="button"
                disabled={busy || revision.revisionNumber === product.draftRevision}
                onClick={() => void setStatus('restore', revision.revisionNumber)}
              >
                恢复为新草稿
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

