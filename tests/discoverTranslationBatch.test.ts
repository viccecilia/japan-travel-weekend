import {describe,expect,it} from 'vitest';
import type {DiscoverHero} from '../src/shared/discover';
import {
  DISCOVER_BATCH_SCHEMA,
  applyDiscoverBatchSelections,
  buildDiscoverTranslationBatch,
  discoverBatchEntryKey,
  parseDiscoverTranslationBatch,
  previewDiscoverTranslationBatch,
} from '../src/shared/discoverTranslationBatch';

const hero=(index:number,overrides:Partial<DiscoverHero>={}):DiscoverHero=>({
  id:`hero-${index}`,
  video_url:`https://media.test/video-${index}.mp4?signature=temporary`,
  poster_url:`https://media.test/poster-${index}.jpg?signature=temporary`,
  product_id:index%2?`route-${index}`:null,
  product_slug:index%2?`route-${index}`:null,
  translations:{'zh-CN':{title:`中文标题 ${index}`,subtitle:`中文副标题 ${index}`}},
  enabled:index%2===0,
  sort_order:index,
  version:3,
  ...overrides,
});

function translatedBatch(source:DiscoverHero[],fieldKeys:Array<'title'|'subtitle'>=['title','subtitle']){
  const built=buildDiscoverTranslationBatch(source);if(!built.batch)throw new Error('fixture build failed');
  const batch=structuredClone(built.batch);
  for(const video of batch.videos){
    for(const field of video.translation_package.fields){
      if(!fieldKeys.includes(field.field_key as 'title'|'subtitle'))continue;
      field.translations.en={text:`EN ${video.video_id} ${field.field_key}`,status:'draft',source_hash:field.source_hash};
    }
  }
  return batch;
}

describe('Discover batch translation packages',()=>{
  it.each([1,3,4,5])('exports a dynamic %i-video batch with stable fields and no media URLs',(count)=>{
    const selected=Array.from({length:count},(_,index)=>hero(index+1));
    const result=buildDiscoverTranslationBatch(selected);
    expect(result.issues).toEqual([]);expect(result.batch?.schema_version).toBe(DISCOVER_BATCH_SCHEMA);expect(result.batch?.videos).toHaveLength(count);
    expect(result.batch?.target_locales).toEqual(['zh-TW','ja','en','ko','vi','ne','es']);
    expect(result.batch?.translator_instructions.join('\n')).toContain('返回纯 JSON');
    expect(result.batch?.videos.every(item=>item.translation_package.fields.every(field=>['title','subtitle'].includes(field.field_key)&&field.id.includes(item.video_id)))).toBe(true);
    const json=JSON.stringify(result.batch);expect(json).not.toContain('video-1.mp4');expect(json).not.toContain('poster-1.jpg');expect(json).not.toContain('signature=temporary');
  });

  it('rejects a missing Chinese title and marks an empty subtitle as no-translation-required',()=>{
    const missing=buildDiscoverTranslationBatch([hero(1,{translations:{'zh-CN':{title:'',subtitle:'有副标题'}}})]);
    expect(missing.batch).toBeNull();expect(missing.issues[0]?.code).toBe('source_title_required');
    const emptySubtitle=buildDiscoverTranslationBatch([hero(2,{translations:{'zh-CN':{title:'只有标题',subtitle:''}}})]).batch!;
    expect(emptySubtitle.videos[0].no_translation_required).toEqual(['subtitle']);
    expect(emptySubtitle.videos[0].translation_package.fields.map(field=>field.field_key)).toEqual(['title']);
  });

  it('matches by stable video and field IDs after reorder and ignores videos added after export',()=>{
    const exported=translatedBatch([hero(1),hero(2),hero(3)]);
    const current=[hero(4),hero(3),hero(1),hero(2)];
    const preview=previewDiscoverTranslationBatch(exported,current);
    expect(preview.matchedVideoIds.sort()).toEqual(['hero-1','hero-2','hero-3']);expect(preview.unknownVideoIds).toEqual([]);
    expect(preview.entries.find(item=>item.videoId==='hero-2'&&item.fieldKey==='title'&&item.locale==='en')?.incomingText).toBe('EN hero-2 title');
    expect(preview.entries.some(item=>item.videoId==='hero-4')).toBe(false);
  });

  it('accepts the existing single-Hero package format without changing route-package behavior',()=>{
    const current=hero(1);const batch=translatedBatch([current]);const single=batch.videos[0].translation_package;
    const preview=previewDiscoverTranslationBatch(single,[current]);
    expect(preview.batch?.videos).toHaveLength(1);expect(preview.matchedVideoIds).toEqual(['hero-1']);expect(preview.entries.some(item=>item.locale==='en'&&item.fieldKey==='title')).toBe(true);
  });

  it('skips a deleted video and reports invalid IDs, fields, hashes and JSON shapes',()=>{
    const exported=translatedBatch([hero(1),hero(2)]);
    expect(previewDiscoverTranslationBatch(exported,[hero(1)]).unknownVideoIds).toEqual(['hero-2']);
    const duplicate=structuredClone(exported);duplicate.videos.push(structuredClone(duplicate.videos[0]));
    expect(parseDiscoverTranslationBatch(duplicate).issues.some(issue=>issue.code==='duplicate_video')).toBe(true);
    const illegal=structuredClone(exported);illegal.videos[0].translation_package.fields[0].field_key='price';
    expect(parseDiscoverTranslationBatch(illegal).issues.some(issue=>issue.code==='field_allowlist')).toBe(true);
    const hash=structuredClone(exported);hash.videos[0].translation_package.fields[0].source_hash='tampered';
    expect(parseDiscoverTranslationBatch(hash).issues.some(issue=>issue.code==='source_hash')).toBe(true);
    expect(parseDiscoverTranslationBatch({schema_version:'bad'}).batch).toBeNull();
  });

  it('blocks only the changed Chinese field while retaining an unchanged subtitle import',()=>{
    const original=hero(1);const exported=translatedBatch([original]);
    const changed=hero(1,{version:4,translations:{'zh-CN':{title:'中文标题已修改',subtitle:'中文副标题 1'}}});
    const preview=previewDiscoverTranslationBatch(exported,[changed]);
    expect(preview.entries.find(item=>item.fieldKey==='title'&&item.locale==='en')?.kind).toBe('source_conflict');
    expect(preview.entries.find(item=>item.fieldKey==='subtitle'&&item.locale==='en')?.kind).toBe('add');
  });

  it('does not clear an existing translation for empty input and requires explicit selection for overwrite',()=>{
    const original=hero(1);const exported=translatedBatch([original],['title']);
    const title=exported.videos[0].translation_package.fields.find(field=>field.field_key==='title')!;
    const subtitle=exported.videos[0].translation_package.fields.find(field=>field.field_key==='subtitle')!;
    subtitle.translations.en={text:'',status:'missing',source_hash:subtitle.source_hash};
    const current=hero(1,{translations:{...original.translations,en:{title:'Confirmed title',subtitle:'Existing subtitle',_content_package:{fields:{title:{source_hash:title.source_hash,status:'reviewed'},subtitle:{source_hash:subtitle.source_hash,status:'draft'}}}}}});
    const preview=previewDiscoverTranslationBatch(exported,[current]);const overwrite=preview.entries.find(item=>item.fieldKey==='title'&&item.locale==='en')!;
    expect(overwrite.kind).toBe('overwrite');expect(overwrite.currentStatus).toBe('reviewed');expect(overwrite.defaultSelected).toBe(false);expect(preview.entries.some(item=>item.fieldKey==='subtitle'&&item.locale==='en')).toBe(false);
    const untouched=applyDiscoverBatchSelections(current,exported,new Set());expect(untouched.translations.en?.title).toBe('Confirmed title');expect(untouched.translations.en?.subtitle).toBe('Existing subtitle');
    const applied=applyDiscoverBatchSelections(current,exported,new Set([overwrite.key]));expect(applied.translations.en?.title).toBe('EN hero-1 title');expect(applied.translations.en?.subtitle).toBe('Existing subtitle');expect(applied.translations.en?._content_package?.fields?.title?.status).toBe('draft');
  });

  it('incrementally changes translations without restoring exported media, order, association or enabled state',()=>{
    const original=hero(1);const exported=translatedBatch([original],['title']);
    const current=hero(1,{video_url:'/new-video.mp4',poster_url:'/new-poster.jpg',product_id:'new-route',product_slug:'new-route',sort_order:99,enabled:false,version:8});
    const preview=previewDiscoverTranslationBatch(exported,[current]);const entry=preview.entries.find(item=>item.fieldKey==='title'&&item.locale==='en')!;
    const applied=applyDiscoverBatchSelections(current,exported,new Set([discoverBatchEntryKey(current.id,entry.fieldId,'en')]));
    expect(applied).toMatchObject({video_url:'/new-video.mp4',poster_url:'/new-poster.jpg',product_id:'new-route',product_slug:'new-route',sort_order:99,enabled:false,version:8});
    expect(applied.translations.en?.title).toBe('EN hero-1 title');
  });
});
