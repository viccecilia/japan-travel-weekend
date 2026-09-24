import {useMemo, useRef, useState} from 'react';
import type {OperationsProduct} from '../../shared/integrations/supabaseOperations';
import {applyRouteTranslationPackage, buildRouteContentTemplate, buildRouteTranslationPackage, downloadPackage, isRouteContentPackage, packageStatusSummary, parseJsonFile, pendingTranslationPackage, validateContentPackage, validateTranslationPackage, type ContentPackage, type PackageIssue, type TranslationPackage} from '../../shared/contentPackages';
import {draftContent, draftFromProduct, type ProductDraft} from './productDraft';

const statusName: Record<string, string> = {missing: '缺失', draft: '草稿', reviewed: '已复核', published: '已发布', stale: '需重译'};
const showIssues = (issues: PackageIssue[]) => issues.map(issue => `${issue.severity === 'error' ? '错误' : '提醒'} · ${issue.path}：${issue.message}`).join('\n');

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
  return <section className="product-editor-card content-workflow" aria-label="内容包与翻译工作流">
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
  </section>;
}
