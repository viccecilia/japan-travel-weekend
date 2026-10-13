import {strFromU8, unzipSync} from 'fflate';
import {attractionGuideLocales} from './attractions/guideCorpus.generated';
import type {OperationsAttractionDetail} from './integrations/supabaseOperations';

export const attractionPackageSchema = 'jtw-attraction-guide-bundle/v1' as const;
export const attractionTemplateSchema = 'jtw-attraction-chatgpt-template/v1' as const;
export type AttractionGuideLocale = typeof attractionGuideLocales[number];

const localeNames: Record<AttractionGuideLocale, string> = {
  'zh-CN': '简体中文', ja: '日语', en: '英语', ko: '韩语', vi: '越南语', ne: '尼泊尔语', es: '西班牙语',
};
const audioMimeByExtension: Record<string, string> = {mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg'};
const maxBundleBytes = 220 * 1024 * 1024;
const maxJsonBytes = 1024 * 1024;
const maxAudioBytes = 30 * 1024 * 1024;

export type AttractionPackageIssue = {severity: 'error' | 'warning'; path: string; message: string};
export type AttractionPackageGuide = {title: string; body: string; audioScript: string};
export type AttractionPackageAudio = {locale: AttractionGuideLocale; path: string; file: File; voice: string | null};
export type ValidatedAttractionPackage = {
  slug: string;
  guides: Record<AttractionGuideLocale, AttractionPackageGuide>;
  audio: Record<AttractionGuideLocale, AttractionPackageAudio>;
  issues: AttractionPackageIssue[];
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function hasUnsafeMarkup(value: string) { return /<(?:script|iframe|object|embed)\b|javascript:/i.test(value); }
function safeArchivePath(value: string) { return value.replace(/\\/g, '/').replace(/^\.\//, ''); }
function isUnsafeArchivePath(value: string) { return value.startsWith('/') || /^[a-z]:\//i.test(value) || value.split('/').includes('..'); }
function audioSignatureMatches(bytes: Uint8Array, extension: string) {
  if (extension === 'mp3') return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (extension === 'm4a') return bytes.length >= 8 && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp';
  if (extension === 'aac') return bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
  if (extension === 'ogg') return bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'OggS';
  return false;
}

export function buildAttractionChatGptTemplate(detail: OperationsAttractionDetail) {
  return {
    schema_version: attractionTemplateSchema,
    task: '为 JTW 景点库生成可直接导入的七语言文字与语音包',
    workflow_instructions: [
      '第一步只根据 verified_facts 和 operator_notes 生成简体中文 title、body、audio_script，并在对话中展示，等待用户修改。',
      '用户明确确认中文后，才执行第二步。不得把首次中文草稿直接当作最终内容。',
      '第二步以用户最终确认的中文为唯一事实来源，生成 zh-CN、ja、en、ko、vi、ne、es 共七套内容。不得增加原文没有的历史、票价、营业时间、交通或礼仪事实。',
      'body 用于游客阅读并保留自然分段；audio_script 用于朗读，信息必须与 body 一致，可将数字、括号和外语名称改写为自然读法。',
      '为每种语言生成一个独立音频文件。最终不要只返回 JSON；必须生成符合 final_zip_contract 的 ZIP。',
      '无法确认的事实留在 operator_notes，不得写入游客正文。所有文字和音频都作为后台草稿导入，不得声称已经发布。',
    ],
    attraction: {
      slug: detail.slug,
      verified_facts: [] as string[],
      operator_notes: '',
      current_chinese: {
        title: detail.guides['zh-CN']?.title ?? '',
        body: detail.guides['zh-CN']?.body ?? '',
        audio_script: '',
      },
    },
    target_locales: attractionGuideLocales.map(locale => ({locale, name: localeNames[locale]})),
    final_zip_contract: {
      filename: `${detail.slug || 'attraction'}-guide-package.zip`,
      required_files: ['manifest.json', 'attraction-guide.json', ...attractionGuideLocales.map(locale => `audio/${locale}.mp3`)],
      manifest_example: {
        schema_version: attractionPackageSchema,
        package_type: 'jtw-attraction-guide-bundle',
        attraction_slug: detail.slug,
        guide_file: 'attraction-guide.json',
        locales: attractionGuideLocales,
        audio: Object.fromEntries(attractionGuideLocales.map(locale => [locale, {file: `audio/${locale}.mp3`, mime_type: 'audio/mpeg', voice: ''}])),
      },
      guide_example: {
        schema_version: attractionPackageSchema,
        package_type: 'jtw-attraction-guides',
        attraction_slug: detail.slug,
        source_locale: 'zh-CN',
        guides: Object.fromEntries(attractionGuideLocales.map(locale => [locale, {title: '', body: '', audio_script: ''}])),
      },
      limits: {json_max_bytes: maxJsonBytes, audio_max_bytes_each: maxAudioBytes, bundle_max_bytes: maxBundleBytes},
    },
  };
}

export function downloadAttractionTemplate(detail: OperationsAttractionDetail) {
  const payload = buildAttractionChatGptTemplate(detail);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${detail.slug || 'new-attraction'}-chatgpt-template.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function parseJsonEntry(files: Record<string, Uint8Array>, path: string, issues: AttractionPackageIssue[]) {
  const bytes = files[path];
  if (!bytes) { issues.push({severity: 'error', path, message: '压缩包中缺少此文件'}); return null; }
  if (bytes.byteLength > maxJsonBytes) { issues.push({severity: 'error', path, message: 'JSON 文件超过 1MB'}); return null; }
  try { return JSON.parse(strFromU8(bytes)) as unknown; }
  catch { issues.push({severity: 'error', path, message: '不是有效的 UTF-8 JSON'}); return null; }
}

export function validateAttractionPackageEntries(rawFiles: Record<string, Uint8Array>, expectedSlug = ''): {package: ValidatedAttractionPackage | null; issues: AttractionPackageIssue[]} {
  const issues: AttractionPackageIssue[] = [];
  const files: Record<string, Uint8Array> = {};
  let expandedBytes = 0;
  for (const [rawPath, bytes] of Object.entries(rawFiles)) {
    const path = safeArchivePath(rawPath);
    if (isUnsafeArchivePath(path)) { issues.push({severity: 'error', path: rawPath, message: '压缩包包含不安全路径'}); continue; }
    expandedBytes += bytes.byteLength;
    files[path] = bytes;
  }
  if (expandedBytes > maxBundleBytes) issues.push({severity: 'error', path: 'file', message: '解压后总大小超过 220MB'});
  const manifestValue = parseJsonEntry(files, 'manifest.json', issues);
  if (!isRecord(manifestValue)) return {package: null, issues};
  if (manifestValue.schema_version !== attractionPackageSchema || manifestValue.package_type !== 'jtw-attraction-guide-bundle') issues.push({severity: 'error', path: 'manifest.json', message: '模板版本或包类型不正确'});
  const slug = text(manifestValue.attraction_slug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) issues.push({severity: 'error', path: 'manifest.attraction_slug', message: '景点 slug 格式不正确'});
  if (expectedSlug && slug !== expectedSlug) issues.push({severity: 'error', path: 'manifest.attraction_slug', message: `压缩包属于 ${slug || '未知景点'}，当前编辑的是 ${expectedSlug}`});
  const declaredLocales = Array.isArray(manifestValue.locales) ? manifestValue.locales.map(String) : [];
  for (const locale of attractionGuideLocales) if (!declaredLocales.includes(locale)) issues.push({severity: 'error', path: `manifest.locales.${locale}`, message: '缺少必要语言'});
  if (declaredLocales.some(locale => !attractionGuideLocales.includes(locale as AttractionGuideLocale))) issues.push({severity: 'warning', path: 'manifest.locales', message: '包含系统不支持的语言，导入时会忽略'});
  const guidePath = safeArchivePath(text(manifestValue.guide_file) || 'attraction-guide.json');
  if (isUnsafeArchivePath(guidePath)) issues.push({severity: 'error', path: 'manifest.guide_file', message: '导览文件路径不安全'});
  const guideValue = parseJsonEntry(files, guidePath, issues);
  const guideRecord = isRecord(guideValue) ? guideValue : {};
  if (guideRecord.schema_version !== attractionPackageSchema || guideRecord.package_type !== 'jtw-attraction-guides') issues.push({severity: 'error', path: guidePath, message: '导览文件版本或类型不正确'});
  if (text(guideRecord.attraction_slug) !== slug) issues.push({severity: 'error', path: `${guidePath}.attraction_slug`, message: '导览文件与 manifest 的景点 slug 不一致'});
  if (guideRecord.source_locale !== 'zh-CN') issues.push({severity: 'error', path: `${guidePath}.source_locale`, message: '源语言必须是 zh-CN'});
  const guideValues = isRecord(guideRecord.guides) ? guideRecord.guides : {};
  const guides = {} as Record<AttractionGuideLocale, AttractionPackageGuide>;
  for (const locale of attractionGuideLocales) {
    const row = isRecord(guideValues[locale]) ? guideValues[locale] : {};
    const title = text(row.title); const body = text(row.body); const audioScript = text(row.audio_script);
    if (!title) issues.push({severity: 'error', path: `guides.${locale}.title`, message: '景点名称为空'});
    if (!body) issues.push({severity: 'error', path: `guides.${locale}.body`, message: '完整导览文字为空'});
    if (!audioScript) issues.push({severity: 'error', path: `guides.${locale}.audio_script`, message: '语音稿为空'});
    if ([title, body, audioScript].some(hasUnsafeMarkup)) issues.push({severity: 'error', path: `guides.${locale}`, message: '包含不允许的脚本或嵌入式 HTML'});
    guides[locale] = {title, body, audioScript};
  }
  const audioManifest = isRecord(manifestValue.audio) ? manifestValue.audio : {};
  const audio = {} as Record<AttractionGuideLocale, AttractionPackageAudio>;
  for (const locale of attractionGuideLocales) {
    const row = isRecord(audioManifest[locale]) ? audioManifest[locale] : {};
    const path = safeArchivePath(text(row.file));
    const bytes = files[path];
    const extension = path.split('.').pop()?.toLowerCase() ?? '';
    const inferredMime = audioMimeByExtension[extension];
    const declaredMime = text(row.mime_type);
    if (!path) issues.push({severity: 'error', path: `manifest.audio.${locale}.file`, message: '未声明音频文件'});
    else if (isUnsafeArchivePath(path)) issues.push({severity: 'error', path: `manifest.audio.${locale}.file`, message: '音频文件路径不安全'});
    else if (!bytes) issues.push({severity: 'error', path, message: `${locale} 音频文件不存在`});
    else if (!inferredMime) issues.push({severity: 'error', path, message: '仅支持 MP3、M4A、AAC 或 OGG'});
    else if (bytes.byteLength <= 0 || bytes.byteLength > maxAudioBytes) issues.push({severity: 'error', path, message: '音频必须大于 0 且不超过 30MB'});
    else if (!audioSignatureMatches(bytes, extension)) issues.push({severity: 'error', path, message: `文件内容不是有效的 ${extension.toUpperCase()} 音频，请重新导出，不要只修改扩展名`});
    else if (declaredMime && declaredMime !== inferredMime) issues.push({severity: 'error', path: `manifest.audio.${locale}.mime_type`, message: `声明格式与文件扩展名不一致，应为 ${inferredMime}`});
    if (bytes && inferredMime) {
      const audioBytes = new Uint8Array(bytes.byteLength); audioBytes.set(bytes);
      audio[locale] = {locale, path, file: new File([audioBytes.buffer], path.split('/').pop() || `${locale}.${extension}`, {type: inferredMime}), voice: text(row.voice) || null};
    }
  }
  if (issues.some(issue => issue.severity === 'error')) return {package: null, issues};
  return {package: {slug, guides, audio, issues}, issues};
}

function readFileBytes(file: File) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('invalid file result'));
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'));
    reader.readAsArrayBuffer(file);
  });
}

export async function parseAttractionPackageFile(file: File, expectedSlug = '') {
  if (!file.name.toLowerCase().endsWith('.zip') || file.size <= 0 || file.size > maxBundleBytes) return {package: null, issues: [{severity: 'error', path: 'file', message: '请选择不超过 220MB 的 ZIP 压缩包'}] as AttractionPackageIssue[]};
  try {
    const archive = new Uint8Array(await readFileBytes(file));
    const files = unzipSync(archive);
    return validateAttractionPackageEntries(files, expectedSlug);
  } catch {
    return {package: null, issues: [{severity: 'error', path: 'file', message: 'ZIP 无法解压，可能损坏或使用了不支持的加密方式'}] as AttractionPackageIssue[]};
  }
}
