import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../store";
import type { OperationsProduct, OperationsProductRevision } from "../../shared/integrations/supabaseOperations";

type ItineraryStop = Record<string, unknown> & { title?: string; name?: string; description?: string; location?: string; time?: string; stayMinutes?: number; imageUrl?: string; tip?: string };

function ItineraryEditor({ initial }: { initial: unknown }) {
  const [items, setItems] = useState<ItineraryStop[]>(Array.isArray(initial) ? initial as ItineraryStop[] : []);
  const update = (index: number, key: keyof ItineraryStop, value: string) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: key === "stayMinutes" ? Number(value) || 0 : value } : item));
  const move = (index: number, offset: number) => setItems((current) => { const target = index + offset; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  return <fieldset className="operations-itinerary-editor">
    <legend>景点图文与展示顺序</legend>
    <input name="itinerary" type="hidden" value={JSON.stringify(items)} readOnly />
    <input name="stops" type="hidden" value={items.map((item) => String(item.title ?? item.name ?? "")).filter(Boolean).join("\n")} readOnly />
    {items.map((item, index) => <article key={`${index}:${String(item.title ?? item.name ?? "stop")}`}>
      <header><b>{index + 1}. {String(item.title ?? item.name ?? "未命名景点")}</b><div className="operations-task-actions"><button type="button" onClick={() => move(index, -1)} disabled={index === 0}>上移</button><button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1}>下移</button><button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>删除</button></div></header>
      <label>景点名称<input value={String(item.title ?? item.name ?? "")} onChange={(event) => update(index, "title", event.target.value)} required /></label>
      <label>地点<input value={String(item.location ?? "")} onChange={(event) => update(index, "location", event.target.value)} /></label>
      <label>预计时间<input value={String(item.time ?? "")} onChange={(event) => update(index, "time", event.target.value)} /></label>
      <label>停留分钟<input type="number" min="0" value={Number(item.stayMinutes ?? 0)} onChange={(event) => update(index, "stayMinutes", event.target.value)} /></label>
      <label>景点介绍<textarea value={String(item.description ?? "")} onChange={(event) => update(index, "description", event.target.value)} /></label>
      <label>图片 URL<input type="url" value={String(item.imageUrl ?? "")} onChange={(event) => update(index, "imageUrl", event.target.value)} /></label>
      <label>游览提示<textarea value={String(item.tip ?? "")} onChange={(event) => update(index, "tip", event.target.value)} /></label>
    </article>)}
    <button className="button secondary" type="button" onClick={() => setItems((current) => [...current, { title: "新景点", description: "" }])}>添加景点</button>
    <small>可增删和调整顺序；原有 gallery、highlights 等扩展字段会原样保留。</small>
  </fieldset>;
}

export function ProductCenter() {
  const { services, refreshCatalog } = useApp();
  const [products, setProducts] = useState<OperationsProduct[]>([]);
  const [selected, setSelected] = useState<OperationsProduct | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revisions,setRevisions]=useState<OperationsProductRevision[]>([]);
  const reload = async () => {
    if (!services) return;
    const result = await services.operations.listProducts();
    setProducts(result.data);
    setNotice(result.error ?? "");
    setSelected(
      (current) =>
        result.data.find((item) => item.id === current?.id) ??
        result.data[0] ??
        null,
    );
  };
  useEffect(()=>{let active=true;if(services&&selected)void services.operations.listProductRevisions(selected.id).then(result=>{if(active)setRevisions(result.data)});return()=>{active=false}},[services,selected]);
  const createProduct=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!services)return;const form=new FormData(event.currentTarget);setBusy(true);const result=await services.operations.createProduct({slug:String(form.get('newSlug')),title:String(form.get('newTitle'))});setBusy(false);setNotice(result.ok?'新产品草稿已建立，请完善内容后发布。':`新建失败：${result.error}`);if(result.ok){event.currentTarget.reset();await reload()}};
  const copyProduct=async()=>{if(!services||!selected)return;const slug=window.prompt('新路线英文标识（例如 kyoto-autumn-day）');if(!slug)return;const title=window.prompt('新路线标题',`${selected.title} 副本`);if(!title)return;setBusy(true);const result=await services.operations.copyProduct({sourceId:selected.id,slug,title});setBusy(false);setNotice(result.ok?'已复制为独立草稿。':`复制失败：${result.error}`);if(result.ok)await reload()};
  const lifecycle=async(action:'archive'|'restore',revision?:number)=>{if(!services||!selected)return;if(!window.confirm(action==='archive'?'下架后游客端将立即不可见，确认继续？':`确认把历史版本 v${revision} 恢复为新草稿？`))return;setBusy(true);const result=await services.operations.setProductStatus({id:selected.id,expectedVersion:selected.catalogVersion,action,restoreRevision:revision});setBusy(false);setNotice(result.ok?(action==='archive'?'产品已下架，历史订单不受影响。':'历史版本已复制为新草稿。'):`操作失败：${result.error}`);if(result.ok)await reload()};
  useEffect(() => {
    let active = true;
    if (services)
      void services.operations.listProducts().then((result) => {
        if (!active) return;
        setProducts(result.data);
        setNotice(result.error ?? "");
        setSelected(result.data[0] ?? null);
      });
    return () => {
      active = false;
    };
  }, [services]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services || !selected) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const lines = (name: string) =>
      String(form.get(name) ?? "")
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);
    let locales: Record<string, unknown>;
    let itinerary: unknown[];
    try {
      locales = JSON.parse(String(form.get("locales") ?? "{}")) as Record<
        string,
        unknown
      >;
      itinerary = JSON.parse(
        String(form.get("itinerary") ?? "[]"),
      ) as unknown[];
      if (
        !Array.isArray(itinerary) ||
        itinerary.some(
          (item) =>
            !item ||
            typeof item !== "object" ||
            (!("title" in item) && !("name" in item)),
        )
      )
        throw new Error("invalid itinerary");
    } catch {
      setBusy(false);
      setNotice("保存失败：多语言或景点图文 JSON 格式不正确");
      return;
    }
    let heroImageUrl = String(form.get("hero") ?? "").trim() || null;
    const gallery = lines("gallery");
    const heroFile = form.get("heroFile");
    if (heroFile instanceof File && heroFile.size > 0) {
      setNotice("正在上传主图…");
      const upload = await services.operations.uploadProductImage(selected.id, heroFile);
      if (upload.error) { setBusy(false); setNotice(`主图上传失败：${upload.error}`); return; }
      heroImageUrl = upload.url;
    }
    const galleryFiles = form.getAll("galleryFiles").filter((item): item is File => item instanceof File && item.size > 0);
    for (const [index, file] of galleryFiles.entries()) {
      setNotice(`正在上传图库 ${index + 1}/${galleryFiles.length}…`);
      const upload = await services.operations.uploadProductImage(selected.id, file);
      if (upload.error) { setBusy(false); setNotice(`图库上传失败：${upload.error}`); return; }
      if (upload.url) gallery.push(upload.url);
    }
    const content = {
      ...selected.content,
      summary: String(form.get("summary") ?? ""),
      description: String(form.get("description") ?? ""),
      region: String(form.get("region") ?? ""),
      duration: String(form.get("duration") ?? ""),
      walkingLevel: String(form.get("walkingLevel") ?? ""),
      languages: lines("languages"),
      stops: itinerary
        .map((item) =>
          String(
            (item as { title?: string; name?: string }).title ??
              (item as { name?: string }).name ??
              "",
          ),
        )
        .filter(Boolean),
      itinerary,
      highlights: lines("highlights"),
      included: lines("included"),
      excluded: lines("excluded"),
      notices: lines("notices"),
      locales,
    };
    const result = await services.operations.saveProductDraft({
      id: selected.id,
      expectedVersion: selected.catalogVersion,
      title: String(form.get("title") ?? ""),
      content,
      heroImageUrl,
      gallery,
    });
    setBusy(false);
    setNotice(
      result.ok
        ? "草稿已保存，游客仍看到原公开版本"
        : `保存失败：${result.error}`,
    );
    if (result.ok) await reload();
  };
  const publish = async () => {
    if (!services || !selected) return;
    setBusy(true);
    const result = await services.operations.publishProduct(
      selected.id,
      selected.catalogVersion,
    );
    if (result.ok) {
      const refreshError = await refreshCatalog();
      setNotice(
        refreshError
          ? `发布成功，但游客目录刷新失败：${refreshError}`
          : "已发布并重新读取游客公开目录",
      );
    } else setNotice(`发布失败：${result.error}`);
    setBusy(false);
    if (result.ok) await reload();
  };
  return (
    <main className="operations-page">
      <header className="operations-hero">
        <div>
          <span>PRODUCT CENTER</span>
          <h1>产品管理</h1>
          <p>草稿与公开版本分离；发布后立即重新读取游客目录。</p>
        </div>
        <Link className="button secondary" to="/app/operations">
          返回工作台
        </Link>
      </header>
      {notice && <p className="operations-notice">{notice}</p>}
      <section className="operations-section"><header><div><span>新产品</span><h2>建立路线草稿</h2></div><small>建立后不会直接出现在游客端</small></header><form className="operations-controls" onSubmit={createProduct}><label>路线英文标识<input name="newSlug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="kyoto-autumn-day" required/></label><label>路线标题<input name="newTitle" minLength={3} required/></label><button className="button" disabled={busy}>新建产品草稿</button></form></section>
      <section className="operations-section">
        <header>
          <div>
            <span>路线产品</span>
            <h2>产品列表</h2>
          </div>
          <small>公开版本 / 草稿版本 / 数据版本</small>
        </header>
        <div className="operations-dispatch-list">
          {products.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setSelected(item)}
              className={selected?.id === item.id ? "selected" : ""}
            >
              <b>{item.title}</b>
              <span>{item.slug}</span>
              <small>
                {item.status} · 公开 v{item.publishedRevision ?? "—"} · 草稿 v
                {item.draftRevision ?? "—"} · 数据 {item.catalogVersion}
              </small>
            </button>
          ))}
        </div>
      </section>
      {selected && (
        <section className="operations-section">
          <header>
            <div>
              <span>编辑草稿</span>
              <h2>{selected.title}</h2>
            </div>
            <small>版本 {selected.catalogVersion}；冲突时拒绝覆盖</small>
          </header>
          <form
            key={`${selected.id}:${selected.catalogVersion}`}
            className="operations-controls"
            onSubmit={save}
          >
            <label>
              标题
              <input name="title" defaultValue={selected.title} required />
            </label>
            <label>
              摘要
              <textarea
                name="summary"
                defaultValue={String(selected.content.summary ?? "")}
                required
              />
            </label>
            <label>
              详细介绍
              <textarea
                name="description"
                defaultValue={String(selected.content.description ?? "")}
              />
            </label>
            <label>
              地区
              <input
                name="region"
                defaultValue={String(selected.content.region ?? "")}
              />
            </label>
            <label>
              行程时长
              <input
                name="duration"
                defaultValue={String(selected.content.duration ?? "")}
              />
            </label>
            <label>
              步行强度
              <input
                name="walkingLevel"
                defaultValue={String(selected.content.walkingLevel ?? "")}
              />
            </label>
            <label>
              服务语言（每行一种）
              <textarea
                name="languages"
                defaultValue={
                  Array.isArray(selected.content.languages)
                    ? selected.content.languages.join("\n")
                    : ""
                }
              />
            </label>
            <ItineraryEditor initial={selected.content.itinerary} />
            <label>
              亮点（每行一项）
              <textarea
                name="highlights"
                defaultValue={
                  Array.isArray(selected.content.highlights)
                    ? selected.content.highlights.join("\n")
                    : ""
                }
              />
            </label>
            <label>
              费用包含（每行一项）
              <textarea
                name="included"
                defaultValue={
                  Array.isArray(selected.content.included)
                    ? selected.content.included.join("\n")
                    : ""
                }
              />
            </label>
            <label>
              费用不含（每行一项）
              <textarea
                name="excluded"
                defaultValue={
                  Array.isArray(selected.content.excluded)
                    ? selected.content.excluded.join("\n")
                    : ""
                }
              />
            </label>
            <label>
              注意事项（每行一项）
              <textarea
                name="notices"
                defaultValue={
                  Array.isArray(selected.content.notices)
                    ? selected.content.notices.join("\n")
                    : ""
                }
              />
            </label>
            <label>
              多语言内容 JSON（语言键下可填写 title、region、duration、stops）
              <textarea
                name="locales"
                defaultValue={JSON.stringify(
                  selected.content.locales ?? {},
                  null,
                  2,
                )}
              />
            </label>
            <label>
              主图 URL
              <input name="hero" defaultValue={selected.heroImageUrl ?? ""} />
            </label>
            <label>或上传主图（JPG / PNG / WebP，最大 10MB）<input name="heroFile" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            <label>
              图库（每行一张）
              <textarea
                name="gallery"
                defaultValue={selected.gallery.join("\n")}
              />
            </label>
            <label>追加图库文件<input name="galleryFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple /></label>
            <div className="operations-task-actions">
              <button className="button" disabled={busy}>
                保存草稿
              </button>
              <Link
                className="button secondary"
                to={`/app/trips/${selected.slug}`}
              >
                查看当前公开页
              </Link>
              <button
                className="button"
                type="button"
                disabled={busy || selected.draftRevision == null}
                onClick={() => void publish()}
              >
                发布草稿
              </button>
              <button className="button secondary" type="button" disabled={busy} onClick={()=>void copyProduct()}>复制为新产品</button>
              {selected.status!=='archived'&&<button className="button secondary" type="button" disabled={busy} onClick={()=>void lifecycle('archive')}>下架产品</button>}
            </div>
          </form>
          <div className="operations-dispatch-list" aria-label="版本历史">{revisions.map(revision=><article key={revision.revisionNumber}><b>v{revision.revisionNumber} · {revision.state}</b><span>{revision.title}</span><small>{new Date(revision.createdAt).toLocaleString('zh-CN')}</small><button type="button" disabled={busy||revision.revisionNumber===selected.draftRevision} onClick={()=>void lifecycle('restore',revision.revisionNumber)}>恢复为新草稿</button></article>)}</div>
        </section>
      )}
    </main>
  );
}
