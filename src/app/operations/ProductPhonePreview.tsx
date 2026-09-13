import {localizedDraft, type ProductDraft} from './productDraft';

export type PreviewMode = 'detail' | 'card';

export function ProductPhonePreview({draft, locale, mode, dirty}: {draft: ProductDraft; locale: string; mode: PreviewMode; dirty: boolean}) {
  const view = localizedDraft(draft, locale);
  const hero = view.heroImageUrl || view.gallery[0] || '/placeholder-route.png';
  return (
    <aside className="product-phone-preview" aria-label="游客手机草稿预览">
      <header>
        <div><b>游客手机预览</b><small>{dirty ? '未保存修改' : '草稿预览'}</small></div>
        <span aria-live="polite">{dirty ? '未保存' : '已保存'}</span>
      </header>
      <div className="product-preview-phone">
        <div className="product-preview-status"><span>9:41</span><span>▮▮ ▰</span></div>
        {mode === 'card' ? (
          <article className="product-preview-card">
            <img src={hero} alt="路线封面预览" />
            <div><small>{view.region || '地区未设置'} · {view.duration || '时长未设置'}</small><h2>{view.title || '未命名路线'}</h2><p>{view.summary || '尚未填写路线简介'}</p><b>价格以可售班次为准</b></div>
          </article>
        ) : (
          <div className="product-preview-detail">
            <div className="product-preview-appbar">‹ 路线介绍 <b>Japan Travel Weekend</b></div>
            <img className="product-preview-hero" src={hero} alt="路线封面预览" />
            <div className="product-preview-copy">
              <small>{view.region || '地区未设置'} · {view.duration || '时长未设置'}</small>
              <h2>{view.title || '未命名路线'}</h2>
              <p>{view.summary || '尚未填写路线简介'}</p>
              {view.description && <p className="product-preview-description">{view.description}</p>}
              <b className="product-preview-price">价格以可售班次为准</b>
              <h3>这一天，去这些地方</h3>
              {view.itinerary.length ? view.itinerary.map((item, index) => (
                <article key={item.editorId} id={`preview-${item.editorId}`}>
                  {item.imageUrl && <img src={String(item.imageUrl)} alt="" />}
                  <div><b>{index + 1}. {String(item.title ?? item.name ?? '未命名景点')}</b>{Number(item.stayMinutes) > 0 && <small>{Number(item.stayMinutes)} 分钟</small>}</div>
                  {item.description && <p>{String(item.description)}</p>}
                </article>
              )) : <p className="product-preview-empty">尚未添加景点</p>}
              <h3>费用说明</h3>
              <p>{view.included.length ? view.included.join('、') : '尚未填写费用包含内容'}</p>
            </div>
          </div>
        )}
        <footer><span>草稿效果 · 仅预览</span><button type="button" disabled>选择日期</button></footer>
      </div>
      <p>修改即时可见，不影响已发布内容</p>
    </aside>
  );
}
