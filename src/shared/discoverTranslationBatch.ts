import type {DiscoverHero,DiscoverHeroTranslation,DiscoverTranslationStatus} from './discover';
import type {OperationsProduct} from './integrations/supabaseOperations';
import {
  SOURCE_LOCALE,
  TARGET_LOCALES,
  TRANSLATION_PACKAGE_SCHEMA,
  applyHeroTranslationPackage,
  buildHeroTranslationPackage,
  contentHash,
  type PackageField,
  type PackageIssue,
  type TargetLocale,
  type TranslationPackage,
} from './contentPackages';

export const DISCOVER_BATCH_SCHEMA='jtw-discover-translation-batch/v1' as const;
export const DISCOVER_BATCH_TYPE='discover_video_translation_batch' as const;
export const DISCOVER_BATCH_MAX_BYTES=2_000_000;
export const DISCOVER_TRANSLATABLE_FIELDS=['title','subtitle'] as const;
export const DISCOVER_TARGET_LOCALES=['zh-TW','ja','en','ko','vi','ne','es'] as const satisfies readonly TargetLocale[];
export type DiscoverTranslatableField=typeof DISCOVER_TRANSLATABLE_FIELDS[number];

export const discoverBatchTranslatorInstructions=[
  '请将本 JSON 指定的中文标题与副标题翻译为 target_locales 中的语言，并返回完整、合法、可回导的 JSON。',
  '用途：Japan Travel Weekend 的 Discover 视频封面文案。',
  '只填写 videos[].translation_package.fields[].translations 中由 videos[].needs_translation 指定的 locale；可将新译文 status 设为 draft。',
  '不修改 source_text、video_id、fields[].id、fields[].path、source_version、source_hash、package_id、scene、route_reference 或其他结构。',
  'Soul 文案自然、有感染力，不机械直译。',
  '路线文案保留正确景点名称，不新增目的地、价格、优惠、服务或保证。',
  '标题简短，适合手机首屏；副标题精炼，不强制照搬中文换行。',
  'zh-TW 使用自然的繁体表达。',
  '不改动已有已确认译文；只处理 needs_translation 指定的待翻译内容。',
  'no_translation_required 中的空副标题保持为空，不自行补写。',
  '新生成译文属于待审核内容，不标记为 reviewed 或 published。',
  '保留完整包结构和全部 videos 条目，不遗漏。',
  '返回纯 JSON；支持文件输出时返回 JSON 文件，否则仅返回 JSON 内容，不添加解释。',
];

export type DiscoverBatchRequirement={field_id:string;field_key:DiscoverTranslatableField;locales:TargetLocale[]};
export type DiscoverBatchVideo={
  video_id:string;
  scene:'soul'|'route';
  route_reference?:{product_id:string|null;product_slug:string|null;name:string};
  source_version:number;
  no_translation_required:DiscoverTranslatableField[];
  needs_translation:DiscoverBatchRequirement[];
  translation_package:TranslationPackage;
};
export type DiscoverTranslationBatch={
  package_type:typeof DISCOVER_BATCH_TYPE;
  schema_version:typeof DISCOVER_BATCH_SCHEMA;
  package_id:string;
  source_locale:typeof SOURCE_LOCALE;
  target_locales:TargetLocale[];
  translator_instructions:string[];
  videos:DiscoverBatchVideo[];
};

export type DiscoverBatchPreviewEntry={
  key:string;
  videoId:string;
  videoLabel:string;
  locale:TargetLocale;
  fieldId:string;
  fieldKey:DiscoverTranslatableField;
  sourceText:string;
  currentText:string;
  incomingText:string;
  currentStatus:DiscoverTranslationStatus;
  kind:'add'|'overwrite'|'unchanged'|'source_conflict';
  defaultSelected:boolean;
};
export type DiscoverBatchPreview={
  batch:DiscoverTranslationBatch|null;
  issues:PackageIssue[];
  entries:DiscoverBatchPreviewEntry[];
  matchedVideoIds:string[];
  unknownVideoIds:string[];
  targetLocales:TargetLocale[];
  missingTranslations:number;
  sourceConflicts:number;
  additions:number;
  overwrites:number;
};

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==='string'?value:'';
const supportedField=(value:unknown):value is DiscoverTranslatableField=>DISCOVER_TRANSLATABLE_FIELDS.includes(value as DiscoverTranslatableField);
const supportedLocale=(value:unknown):value is TargetLocale=>TARGET_LOCALES.includes(value as TargetLocale);
const status=(value:unknown):DiscoverTranslationStatus=>['missing','draft','reviewed','published','stale'].includes(String(value))?value as DiscoverTranslationStatus:'missing';
export const discoverBatchEntryKey=(videoId:string,fieldId:string,locale:TargetLocale)=>`${videoId}\u0000${fieldId}\u0000${locale}`;

function fieldMetadata(translation:DiscoverHeroTranslation|undefined,fieldKey:DiscoverTranslatableField){
  return translation?._content_package?.fields?.[fieldKey]??translation?._content_package;
}

function routeReference(hero:DiscoverHero,products:OperationsProduct[]){
  const product=products.find(item=>item.id===hero.product_id||Boolean(hero.product_slug)&&item.slug===hero.product_slug);
  if(!hero.product_id&&!hero.product_slug)return undefined;
  return {product_id:hero.product_id,product_slug:hero.product_slug,name:product?.title??hero.product_slug??'关联路线'};
}

export function buildDiscoverTranslationBatch(heroes:DiscoverHero[],products:OperationsProduct[]=[]){
  const issues:PackageIssue[]=[];
  const videos=heroes.flatMap((hero):DiscoverBatchVideo[]=>{
    const source=hero.translations[SOURCE_LOCALE];
    if(!source?.title.trim()){
      issues.push({severity:'error',code:'source_title_required',path:`videos.${hero.id}.translations.${SOURCE_LOCALE}.title`,message:`视频「${hero.id}」缺少中文标题，请先填写并保存。`});
      return [];
    }
    const base=buildHeroTranslationPackage(hero);
    const fields=base.fields.filter(item=>supportedField(item.field_key));
    const noTranslationRequired:DiscoverTranslatableField[]=source.subtitle.trim()?[]:['subtitle'];
    const needsTranslation=fields.map(item=>({
      field_id:item.id,
      field_key:item.field_key as DiscoverTranslatableField,
      locales:DISCOVER_TARGET_LOCALES.filter(locale=>{
        const value=item.translations[locale];
        return !value?.text.trim()||value.status==='missing'||value.status==='stale';
      }),
    })).filter(item=>item.locales.length>0);
    const reference=routeReference(hero,products);
    return [{
      video_id:hero.id,
      scene:reference?'route':'soul',
      ...(reference?{route_reference:reference}:{}),
      source_version:hero.version,
      no_translation_required:noTranslationRequired,
      needs_translation:needsTranslation,
      translation_package:{...base,target_locales:[...DISCOVER_TARGET_LOCALES],locked:{},fields},
    }];
  });
  const fingerprint=heroes.map(hero=>`${hero.id}:${hero.version}`).join('|');
  const batch:DiscoverTranslationBatch={package_type:DISCOVER_BATCH_TYPE,schema_version:DISCOVER_BATCH_SCHEMA,package_id:`discover-batch-${contentHash(fingerprint)}`,source_locale:SOURCE_LOCALE,target_locales:[...DISCOVER_TARGET_LOCALES],translator_instructions:[...discoverBatchTranslatorInstructions],videos};
  return {batch:issues.some(issue=>issue.severity==='error')?null:batch,issues};
}

function normalizeLegacy(input:unknown):DiscoverTranslationBatch|null{
  const value=record(input);
  if(value.schema_version!==TRANSLATION_PACKAGE_SCHEMA)return null;
  const entity=record(value.entity);
  if(entity.entity_type!=='discover_hero'||!text(entity.entity_id))return null;
  const translationPackage=input as TranslationPackage;
  const fields=Array.isArray(translationPackage.fields)?translationPackage.fields.filter(item=>supportedField(item.field_key)):[];
  const needs_translation=fields.map(item=>({field_id:item.id,field_key:item.field_key as DiscoverTranslatableField,locales:DISCOVER_TARGET_LOCALES.filter(locale=>Boolean(item.translations[locale]?.text.trim()))})).filter(item=>item.locales.length);
  return {package_type:DISCOVER_BATCH_TYPE,schema_version:DISCOVER_BATCH_SCHEMA,package_id:`legacy-${translationPackage.package_id}`,source_locale:SOURCE_LOCALE,target_locales:[...DISCOVER_TARGET_LOCALES],translator_instructions:[...discoverBatchTranslatorInstructions],videos:[{video_id:entity.entity_id as string,scene:'soul',source_version:Number(entity.source_version)||0,no_translation_required:[],needs_translation,translation_package:{...translationPackage,target_locales:[...DISCOVER_TARGET_LOCALES],locked:{},fields}}]};
}

export function parseDiscoverTranslationBatch(input:unknown):{batch:DiscoverTranslationBatch|null;issues:PackageIssue[]}{
  const legacy=normalizeLegacy(input);
  const candidate=legacy??input;
  const issues:PackageIssue[]=[];const value=record(candidate);
  if(value.package_type!==DISCOVER_BATCH_TYPE)issues.push({severity:'error',code:'package_type',path:'package_type',message:`包类型必须是 ${DISCOVER_BATCH_TYPE}`});
  if(value.schema_version!==DISCOVER_BATCH_SCHEMA)issues.push({severity:'error',code:'schema',path:'schema_version',message:`仅支持 ${DISCOVER_BATCH_SCHEMA}`});
  if(value.source_locale!==SOURCE_LOCALE)issues.push({severity:'error',code:'source_locale',path:'source_locale',message:'source_locale 必须是 zh-CN'});
  const targetLocales=Array.isArray(value.target_locales)?value.target_locales:[];
  if(targetLocales.length!==DISCOVER_TARGET_LOCALES.length||new Set(targetLocales).size!==targetLocales.length||DISCOVER_TARGET_LOCALES.some(locale=>!targetLocales.includes(locale)))issues.push({severity:'error',code:'target_locales',path:'target_locales',message:'target_locales 必须完整且不重复地包含 7 种支持语言'});
  if(!Array.isArray(value.translator_instructions)||value.translator_instructions.length<8)issues.push({severity:'error',code:'instructions',path:'translator_instructions',message:'翻译包缺少完整的 translator_instructions'});
  const videos=Array.isArray(value.videos)?value.videos:[];const videoIds=new Set<string>();
  if(videos.length===0)issues.push({severity:'error',code:'videos',path:'videos',message:'翻译包没有视频条目'});
  videos.forEach((rawVideo,index)=>{
    const video=record(rawVideo);const videoId=text(video.video_id);const base=`videos[${index}]`;
    if(!videoId||videoIds.has(videoId))issues.push({severity:'error',code:'duplicate_video',path:`${base}.video_id`,message:'视频 ID 缺失或重复'});videoIds.add(videoId);
    const pkg=record(video.translation_package);const entity=record(pkg.entity);
    if(pkg.schema_version!==TRANSLATION_PACKAGE_SCHEMA||entity.entity_type!=='discover_hero'||entity.entity_id!==videoId)issues.push({severity:'error',code:'translation_package',path:`${base}.translation_package`,message:'内嵌单条 Hero 翻译包结构或视频 ID 不一致'});
    if(!Number.isInteger(video.source_version)||Number(video.source_version)<0||entity.source_version!==video.source_version)issues.push({severity:'error',code:'source_version',path:`${base}.source_version`,message:'视频源版本无效或与内嵌翻译包不一致'});
    const nestedLocales=Array.isArray(pkg.target_locales)?pkg.target_locales:[];
    if(pkg.source_locale!==SOURCE_LOCALE||nestedLocales.length!==DISCOVER_TARGET_LOCALES.length||DISCOVER_TARGET_LOCALES.some(locale=>!nestedLocales.includes(locale)))issues.push({severity:'error',code:'nested_locales',path:`${base}.translation_package.target_locales`,message:'内嵌翻译包语言范围无效'});
    const requirements=Array.isArray(video.needs_translation)?video.needs_translation:[];const requirementKeys=new Set<string>();
    requirements.forEach((rawRequirement,requirementIndex)=>{
      const requirement=record(rawRequirement);const fieldId=text(requirement.field_id);const fieldKey=text(requirement.field_key);const locales=Array.isArray(requirement.locales)?requirement.locales:[];
      if(!fieldId||!supportedField(fieldKey)||locales.some(locale=>!supportedLocale(locale))||new Set(locales).size!==locales.length)issues.push({severity:'error',code:'translation_requirement',path:`${base}.needs_translation[${requirementIndex}]`,message:'待翻译字段或语言无效、重复'});
      for(const locale of locales){const key=`${fieldId}\u0000${locale}`;if(requirementKeys.has(key))issues.push({severity:'error',code:'duplicate_translation',path:`${base}.needs_translation[${requirementIndex}]`,message:'同一视频、字段和语言重复'});requirementKeys.add(key)}
    });
    const fields=Array.isArray(pkg.fields)?pkg.fields:[];const fieldIds=new Set<string>();
    fields.forEach((rawField,fieldIndex)=>{
      const row=record(rawField);const fieldId=text(row.id);const fieldKey=text(row.field_key);const path=text(row.path);const sourceText=text(row.source_text);const sourceHash=text(row.source_hash);const fieldPath=`${base}.translation_package.fields[${fieldIndex}]`;
      if(!fieldId||fieldIds.has(fieldId))issues.push({severity:'error',code:'duplicate_field',path:`${fieldPath}.id`,message:'字段 ID 缺失或重复'});fieldIds.add(fieldId);
      if(!supportedField(fieldKey)||path!==`translations.zh-CN.${fieldKey}`||row.entity_type!=='discover_hero'||row.entity_id!==videoId)issues.push({severity:'error',code:'field_allowlist',path:fieldPath,message:'Discover 批量包只允许当前视频的 title / subtitle 字段'});
      if(!sourceText.trim()||sourceHash!==contentHash(sourceText))issues.push({severity:'error',code:'source_hash',path:fieldPath,message:'source_text 与 source_hash 不自洽'});
      const translations=record(row.translations);
      Object.entries(translations).forEach(([locale,rawTranslation])=>{
        const translation=record(rawTranslation);const translated=text(translation.text);const translatedStatus=text(translation.status);
        if(!supportedLocale(locale))issues.push({severity:'error',code:'locale',path:`${fieldPath}.translations.${locale}`,message:'不支持的目标语言'});
        if(typeof translation.text!=='string')issues.push({severity:'error',code:'translation_type',path:`${fieldPath}.translations.${locale}.text`,message:'译文必须为字符串'});
        if(translated.length>(fieldKey==='title'?240:500))issues.push({severity:'error',code:'translation_length',path:`${fieldPath}.translations.${locale}.text`,message:'译文超过字段长度限制'});
        if(text(translation.source_hash)&&translation.source_hash!==sourceHash)issues.push({severity:'error',code:'translation_source_hash',path:`${fieldPath}.translations.${locale}.source_hash`,message:'译文 source_hash 与字段指纹不一致'});
        if(translated.trim()&&['reviewed','published'].includes(translatedStatus)&&requirementKeys.has(`${fieldId}\u0000${locale}`))issues.push({severity:'error',code:'translation_status',path:`${fieldPath}.translations.${locale}.status`,message:'新译文不能标记为已审核或已发布'});
      });
    });
    requirements.forEach(rawRequirement=>{const requirement=record(rawRequirement);if(!fieldIds.has(text(requirement.field_id)))issues.push({severity:'error',code:'requirement_field',path:`${base}.needs_translation`,message:'needs_translation 引用了不存在的字段'})});
  });
  return {batch:issues.some(issue=>issue.severity==='error')?null:candidate as DiscoverTranslationBatch,issues};
}

export function previewDiscoverTranslationBatch(input:unknown,currentHeroes:DiscoverHero[],products:OperationsProduct[]=[]):DiscoverBatchPreview{
  const parsed=parseDiscoverTranslationBatch(input);const issues=[...parsed.issues];const entries:DiscoverBatchPreviewEntry[]=[];const matched=new Set<string>();const unknown:string[]=[];let missingTranslations=0;
  if(!parsed.batch)return {batch:null,issues,entries,matchedVideoIds:[],unknownVideoIds:[],targetLocales:[],missingTranslations:0,sourceConflicts:0,additions:0,overwrites:0};
  for(const video of parsed.batch.videos){
    const hero=currentHeroes.find(item=>item.id===video.video_id);
    if(!hero){unknown.push(video.video_id);continue}matched.add(video.video_id);
    const expected=buildHeroTranslationPackage(hero);const expectedFields=new Map(expected.fields.filter(item=>supportedField(item.field_key)).map(item=>[item.id,item]));
    const importedFields=new Map(video.translation_package.fields.map(item=>[item.id,item]));
    const label=hero.translations[SOURCE_LOCALE]?.title||routeReference(hero,products)?.name||hero.id;
    for(const requirement of video.needs_translation){
      const imported=importedFields.get(requirement.field_id);const current=expectedFields.get(requirement.field_id);
      for(const locale of requirement.locales){
        const incoming=imported?.translations[locale]?.text.trim()??'';
        if(!incoming){missingTranslations+=1;continue}
        const sourceConflict=!imported||!current||imported.field_key!==current.field_key||imported.path!==current.path||imported.source_text!==current.source_text||imported.source_hash!==current.source_hash;
        const fieldKey=(supportedField(imported?.field_key)?imported.field_key:requirement.field_key) as DiscoverTranslatableField;
        const currentTranslation=hero.translations[locale];const currentText=(currentTranslation?.[fieldKey]??'').trim();const currentStatus=status(fieldMetadata(currentTranslation,fieldKey)?.status);
        const kind=sourceConflict?'source_conflict':currentText===incoming?'unchanged':currentText?'overwrite':'add';
        entries.push({key:discoverBatchEntryKey(hero.id,requirement.field_id,locale),videoId:hero.id,videoLabel:label,locale,fieldId:requirement.field_id,fieldKey,sourceText:imported?.source_text??'',currentText,incomingText:incoming,currentStatus,kind,defaultSelected:kind==='add'});
      }
    }
  }
  unknown.forEach(id=>issues.push({severity:'warning',code:'unknown_video',path:`videos.${id}`,message:`视频 ${id} 已删除或当前账号无权维护，已跳过。`}));
  return {batch:parsed.batch,issues,entries,matchedVideoIds:[...matched],unknownVideoIds:unknown,targetLocales:parsed.batch.target_locales,missingTranslations,sourceConflicts:entries.filter(item=>item.kind==='source_conflict').length,additions:entries.filter(item=>item.kind==='add').length,overwrites:entries.filter(item=>item.kind==='overwrite').length};
}

export function applyDiscoverBatchSelections(hero:DiscoverHero,batch:DiscoverTranslationBatch,selectedKeys:Set<string>){
  const video=batch.videos.find(item=>item.video_id===hero.id);if(!video)return hero;
  const expected=buildHeroTranslationPackage(hero);
  const importedById=new Map(video.translation_package.fields.map(item=>[item.id,item]));
  const fields=expected.fields.map((field):PackageField=>{
    if(!supportedField(field.field_key))return {...field,translations:{}};
    const imported=importedById.get(field.id);if(!imported)return field;
    const translations={...field.translations};
    for(const locale of TARGET_LOCALES){
      const key=discoverBatchEntryKey(hero.id,field.id,locale);
      if(!selectedKeys.has(key))translations[locale]={...translations[locale]!,text:''};
      else if(imported.translations[locale]?.text.trim())translations[locale]={text:imported.translations[locale]!.text.trim(),status:'draft',source_hash:field.source_hash};
    }
    return {...field,translations};
  });
  return applyHeroTranslationPackage(hero,{...expected,fields}).hero;
}
