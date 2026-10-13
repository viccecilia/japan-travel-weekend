import {describe, expect, it} from 'vitest';
import {strToU8} from 'fflate';
import {attractionGuideLocales} from '../src/shared/attractions/guideCorpus.generated';
import {attractionPackageSchema, buildAttractionChatGptTemplate, validateAttractionPackageEntries} from '../src/shared/attractionContentPackages';
import type {OperationsAttractionDetail} from '../src/shared/integrations/supabaseOperations';

const detail: OperationsAttractionDetail = {
  id: '', slug: 'sample-attraction', status: 'draft', catalogVersion: 0,
  guides: Object.fromEntries(attractionGuideLocales.map(locale => [locale, {title: locale === 'zh-CN' ? '示例景点' : '', body: locale === 'zh-CN' ? '已经确认的中文资料。' : ''}])),
  audio: {},
};

function validEntries() {
  const guides = Object.fromEntries(attractionGuideLocales.map(locale => [locale, {title: `${locale} title`, body: `${locale} body`, audio_script: `${locale} narration`} ]));
  const audio = Object.fromEntries(attractionGuideLocales.map(locale => [locale, {file: `audio/${locale}.mp3`, mime_type: 'audio/mpeg', voice: `${locale}-voice`} ]));
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify({schema_version: attractionPackageSchema, package_type: 'jtw-attraction-guide-bundle', attraction_slug: detail.slug, guide_file: 'attraction-guide.json', locales: attractionGuideLocales, audio})),
    'attraction-guide.json': strToU8(JSON.stringify({schema_version: attractionPackageSchema, package_type: 'jtw-attraction-guides', attraction_slug: detail.slug, source_locale: 'zh-CN', guides})),
  };
  for (const locale of attractionGuideLocales) files[`audio/${locale}.mp3`] = new Uint8Array([0x49, 0x44, 0x33, 4]);
  return files;
}

describe('attraction ChatGPT content packages', () => {
  it('exports the simplified two-stage workflow and exact seven-locale ZIP contract', () => {
    const template = buildAttractionChatGptTemplate(detail);
    expect(template.workflow_instructions.join(' ')).toContain('第一步');
    expect(template.workflow_instructions.join(' ')).toContain('用户明确确认中文后');
    expect(template.target_locales.map(item => item.locale)).toEqual(attractionGuideLocales);
    expect(template.attraction.current_chinese.body).toBe('已经确认的中文资料。');
    expect(template.final_zip_contract.required_files).toContain('audio/ne.mp3');
  });

  it('accepts a complete matching bundle and returns upload-ready files', () => {
    const result = validateAttractionPackageEntries(validEntries(), detail.slug);
    expect(result.issues).toHaveLength(0);
    expect(result.package?.guides.ja.audioScript).toBe('ja narration');
    expect(result.package?.audio.es.file.type).toBe('audio/mpeg');
    expect(result.package?.audio.es.file.name).toBe('es.mp3');
  });

  it('rejects a package for another attraction and reports the exact missing language audio', () => {
    const files = validEntries();
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as Record<string, unknown>;
    manifest.attraction_slug = 'another-attraction';
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    delete files['audio/ne.mp3'];
    const result = validateAttractionPackageEntries(files, detail.slug);
    expect(result.package).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({path: 'manifest.attraction_slug'}),
      expect.objectContaining({path: 'audio/ne.mp3', message: 'ne 音频文件不存在'}),
    ]));
  });

  it('rejects empty guide content, unsafe markup, and unsupported audio extensions', () => {
    const files = validEntries();
    const guide = JSON.parse(new TextDecoder().decode(files['attraction-guide.json'])) as {guides: Record<string, {title: string; body: string; audio_script: string}>};
    guide.guides.en.body = '<script>alert(1)</script>';
    guide.guides.ko.audio_script = '';
    files['attraction-guide.json'] = strToU8(JSON.stringify(guide));
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as {audio: Record<string, {file: string; mime_type: string}>};
    manifest.audio.vi = {file: 'audio/vi.wav', mime_type: 'audio/wav'};
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    files['audio/vi.wav'] = new Uint8Array([1, 2, 3]);
    files['audio/es.mp3'] = strToU8('this is not mp3 audio');
    const result = validateAttractionPackageEntries(files, detail.slug);
    expect(result.package).toBeNull();
    expect(result.issues.map(issue => issue.path)).toEqual(expect.arrayContaining(['guides.en', 'guides.ko.audio_script', 'audio/vi.wav', 'audio/es.mp3']));
  });
});
