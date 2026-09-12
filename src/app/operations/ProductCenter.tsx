import {FormEvent, useEffect, useState} from 'react';
import {Link, useLocation, useNavigate, useSearchParams} from 'react-router-dom';
import {useApp} from '../store';
import type {OperationsProduct} from '../../shared/integrations/supabaseOperations';

type ProductStatusFilter = 'all' | 'published' | 'draft' | 'archived';

type CopyFormState = {
  sourceId: string | null;
  title: string;
  slug: string;
  catalogVersion: number;
};

const STATUS_OPTIONS: Array<{label: string; value: ProductStatusFilter}> = [
  {label: '全部', value: 'all'},
  {label: '已发布', value: 'published'},
  {label: '草稿', value: 'draft'},
  {label: '已下架', value: 'archived'},
];

function normalizeStatus(item: OperationsProduct): string {
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

export function ProductCenter() {
  const {services} = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<OperationsProduct[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const search = params.get('q') ?? '';
  const status = STATUS_OPTIONS.some((option) => option.value === params.get('status')) ? params.get('status') as ProductStatusFilter : 'all';
  const requestedPage = Number(params.get('page') ?? 1);
  const [loadError, setLoadError] = useState('');
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const [copyForm, setCopyForm] = useState<CopyFormState | null>(null);
  const [copySlug, setCopySlug] = useState('');
  const [copyTitle, setCopyTitle] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;

  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  const filtered = products.filter((item) => {
    const text = `${item.title} ${item.slug}`.toLowerCase();
    if (!text.includes(search.toLowerCase())) return false;
    if (status !== 'all' && item.status !== status) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(totalPages, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const pageStart = (page - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  const reload = async () => {
    if (!services) return;
    setBusy(true);
    setLoadError('');
    try {
      const result = await services.operations.listProducts();
      if (result.error) throw new Error(result.error);
      setProducts(result.data);
      setTotalCount(result.data.length);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '网络异常，请重试');
    } finally {
      setBusy(false);
    }
  };

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services || busy) return;
    const form = new FormData(event.currentTarget);
    const slug = String(form.get('slug') ?? '').trim();
    const title = String(form.get('title') ?? '').trim();
    if (!slug || !title) return;
    setBusy(true);
    try {
    const result = await services.operations.createProduct({slug, title});
    if (result.ok && result.id) {
      setNotice('新产品草稿已建立，请完善内容后发布。');
      setCreateOpen(false);
      setNewSlug('');
      setNewTitle('');
      navigate(`/app/operations/products/${encodeURIComponent(result.id)}/edit?returnTo=${returnTo}`);
    } else {
      setNotice(`新建失败：${result.error ?? '请检查输入后重试'}`);
    }
    } catch (error) {
      setNotice(`新建失败：${error instanceof Error ? error.message : '网络异常，请重试'}`);
    } finally {
      setBusy(false);
    }
  };

  const openCopy = (source: OperationsProduct) => {
    setCopyForm({
      sourceId: source.id,
      title: `${source.title} 副本`,
      slug: `${source.slug}-copy`,
      catalogVersion: source.catalogVersion,
    });
    setCopyTitle(`${source.title} 副本`);
    setCopySlug(`${source.slug}-copy`);
  };

  const closeCopy = () => {
    setCopyForm(null);
    setCopySlug('');
    setCopyTitle('');
  };

  const copyProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services || !copyForm || !copyForm.sourceId) return;
    if (busy) return;
    setBusy(true);
    try {
      const result = await services.operations.copyProduct({
        sourceId: copyForm.sourceId,
        sourceVersion: copyForm.catalogVersion,
        slug: copySlug.trim(),
        title: copyTitle.trim(),
      });
      setNotice(
        result.ok
          ? '已复制并进入新产品草稿。'
          : `复制失败：${result.error ?? '请检查网络后重试'}`,
      );
      if (result.ok && result.id) {
        closeCopy();
        navigate(`/app/operations/products/${encodeURIComponent(result.id)}/edit?returnTo=${returnTo}`);
      }
    } catch (error) {
      setNotice(`复制失败：${error instanceof Error ? error.message : '网络异常，请稍后重试'}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [services]);

  const hasData = filtered.length > 0;
  const activeItemsCount = products.filter((item) => item.status !== 'archived').length;

  return (
    <main className="operations-page">
      <header className="operations-hero">
        <div>
          <span>PRODUCT CENTER</span>
          <h1>产品管理</h1>
          <p>维护路线内容与版本；发布与下架仅变更游客端可见性。</p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setCreateOpen((value) => !value);
            setNotice('');
          }}
        >
          新建路线
        </button>
      </header>

      {notice && <p className="operations-notice">{notice}</p>}

      <section className="operations-section">
        <div className="operations-section-head">
          <div>
            <span>路线总览</span>
            <h2>路线产品</h2>
          </div>
          <small>{loadError ? '目录读取失败' : busy ? '正在读取…' : `共 ${totalCount} 条，当前显示 ${filtered.length} 条`}</small>
        </div>
        <div className="operations-toolbar" role="search">
          <label>
            搜索路线
            <input
              type="text"
              value={search}
              onChange={(event) => updateFilter('q', event.target.value)}
              placeholder="路线名称 / 标识"
              aria-label="搜索路线"
            />
          </label>
          <label>
            状态
            <select value={status} onChange={(event) => updateFilter('status', event.target.value)} aria-label="状态筛选">
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="operations-hint">草稿中可编辑，发布后游客页同步更新。</div>
        </div>
        {createOpen && (
          <form className="operations-controls" onSubmit={createProduct}>
            <label>
              路线英文标识（slug）
              <input
                name="slug"
                required
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="kyoto-autumn-day"
              />
            </label>
            <label>
              路线标题
              <input
                name="title"
                required
                minLength={3}
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
              />
            </label>
            <div className="operations-task-actions">
              <button className="button" disabled={busy}>
                新建产品草稿
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setNewSlug('');
                  setNewTitle('');
                }}
              >
                关闭
              </button>
            </div>
          </form>
        )}
        {copyForm && (
          <form className="operations-controls" aria-label="复制产品" onSubmit={copyProduct}>
            <header className="operations-inline-header">
              <span>复制为新路线</span>
              <p>
                固定来源：{copyForm.title}
                （版本 {copyForm.catalogVersion}）
              </p>
            </header>
            <label>
              新路线英文标识
              <input
                value={copySlug}
                onChange={(event) => setCopySlug(event.target.value)}
                name="slug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
            </label>
            <label>
              新路线标题
              <input value={copyTitle} onChange={(event) => setCopyTitle(event.target.value)} name="title" required minLength={3} />
            </label>
            <div className="operations-task-actions">
              <button className="button" disabled={busy}>
                确认复制
              </button>
              <button className="button secondary" type="button" disabled={busy} onClick={closeCopy}>
                取消
              </button>
            </div>
          </form>
        )}

        {busy && products.length === 0 && <p className="operations-hint">正在读取产品目录…</p>}
        {loadError && <div role="alert">读取失败：{loadError}<button type="button" disabled={busy} onClick={() => void reload()}>重试</button></div>}
        {!busy && !loadError && !hasData && (
          <p className="operations-empty">
            当前筛选下无匹配路线。可清空筛选条件后重试，或确认是否已存在权限内测试路线。
          </p>
        )}
        <div className="operations-table-scroll" role="region" aria-label="产品表格">
          <table className="operations-table">
            <thead>
              <tr>
                <th>封面</th>
                <th>路线名称 / 标识</th>
                <th>状态</th>
                <th>地区</th>
                <th>内容状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item) => {
                const region = String(item.content?.region ?? '未设置');
                const hero = item.heroImageUrl ?? '/placeholder-route.png';
                const label = normalizeStatus(item);
                return (
                  <tr key={item.id}>
                    <td>
                      <img
                        src={hero}
                        alt={item.title}
                        width={96}
                        height={64}
                        loading="lazy"
                        style={{width: 96, height: 64, objectFit: 'cover', borderRadius: 8}}
                      />
                    </td>
                    <td>
                      <b>{item.title}</b>
                      <small>{item.slug}</small>
                    </td>
                    <td>
                      {item.status === 'published' ? '已发布' : item.status === 'archived' ? '已下架' : '草稿'}
                    </td>
                    <td>{region}</td>
                    <td>{label}</td>
                    <td className="operations-task-actions">
                      <Link
                        className="button"
                        to={`/app/operations/products/${encodeURIComponent(item.id)}/edit?returnTo=${returnTo}`}
                      >
                        编辑
                      </Link>
                      {item.status === 'published' && item.publishedRevision != null && <a href={`/app/trips/${item.slug}`} target="_blank" rel="noreferrer" className="button secondary">
                        预览
                      </a>}
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => openCopy(item)}
                        aria-label={`${item.title} 复制`}
                      >
                        复制
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="operations-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => updateFilter('page', String(page - 1))}
            >
              上一页
            </button>
            <small>
              {page} / {totalPages}
            </small>
            <button type="button" disabled={page >= totalPages} onClick={() => updateFilter('page', String(page + 1))}>
              下一页
            </button>
          </div>
        )}
      </section>
      <section className="operations-section">
        <header>
          <div>
            <span>数据指标</span>
            <h2>当前状态说明</h2>
          </div>
          <small>仅供现场核对</small>
        </header>
        <div className="operations-attention-list">
          <article>
            <b>当前可派产品</b>
            <p>在用产品：{activeItemsCount} 条</p>
          </article>
          <article>
            <b>测试过滤</b>
            <p>搜索与筛选仅用于本页视图，不会更改数据库读取口径。</p>
          </article>
        </div>
      </section>
    </main>
  );
}

