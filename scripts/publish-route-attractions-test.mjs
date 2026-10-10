import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import process from 'node:process';
import {createClient} from '@supabase/supabase-js';

const locales=['zh-CN','ja','en','ko','vi','ne','es'];
const expectedProject='hzxoofvodpqpdomtmzlf';
const apply=process.argv.includes('--apply');
const envArg=process.argv.find(value=>value.startsWith('--env='));
const credentialsEnvArg=process.argv.find(value=>value.startsWith('--credentials-env='));
assert.ok(envArg,'Pass --env=<approved Test env file>.');

const parseEnv=text=>Object.fromEntries(text.split(/\r?\n/).flatMap(line=>{
  const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
  if(!match)return [];
  let value=match[2].trim();
  if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  return [[match[1],value]];
}));
const env={
  ...parseEnv(await readFile(envArg.slice('--env='.length),'utf8')),
  ...(credentialsEnvArg?parseEnv(await readFile(credentialsEnvArg.slice('--credentials-env='.length),'utf8')):{}),
};
const url=env.VITE_SUPABASE_URL;
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
const email=env.JTW_OPERATIONS_EMAIL??env.OPERATIONS_EMAIL;
const password=env.JTW_OPERATIONS_PASSWORD??env.OPERATIONS_PASSWORD;
assert.ok(url&&key&&email&&password,'The approved Test env must contain Supabase public config and Operations credentials.');
assert.equal(new URL(url).hostname,`${expectedProject}.supabase.co`,'Refusing a non-Test Supabase project.');

const extractJson=async(file,prefix,suffix)=>{
  const source=await readFile(file,'utf8');
  const start=source.indexOf(prefix);
  assert.notEqual(start,-1,`${prefix} not found in ${file}`);
  const from=start+prefix.length;
  const end=source.indexOf(suffix,from);
  assert.notEqual(end,-1,`${suffix} not found in ${file}`);
  return JSON.parse(source.slice(from,end+1));
};
const corpus=await extractJson('src/shared/attractions/guideCorpus.generated.ts','export const attractionGuideCorpus=','] as unknown as AttractionRecord[];');
const corpusBySlug=new Map(corpus.map(item=>[item.slug,item]));
const aliasSource=await readFile('src/app/operations/productDraft.ts','utf8');
const aliasBlock=aliasSource.slice(aliasSource.indexOf('export const reviewedRouteStopAttractionIds'),aliasSource.indexOf('\n};',aliasSource.indexOf('export const reviewedRouteStopAttractionIds')));
const aliases=new Map([...aliasBlock.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)].map(match=>[match[1],match[2]]));
const multiAliases=new Map([['千叠敷与三段壁',['senjojiki','sandanbeki']]]);

const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const signed=await client.auth.signInWithPassword({email,password});
if(signed.error||!signed.data.session)throw signed.error??new Error('Operations sign-in failed.');

const rpc=async(name,args={})=>{
  const result=await client.rpc(name,args);
  if(result.error)throw new Error(`${name}: ${result.error.message}`);
  return result.data;
};
const excludedRoutes=new Set(['arashiyama-train-hozugawa']);
const allCatalog=await rpc('list_public_product_catalog');
const catalog=Array.isArray(allCatalog)?allCatalog.filter(route=>!excludedRoutes.has(route.slug)):[];
assert.ok(catalog.length>0,'Published Test route catalog is empty.');
const references=new Map();
for(const route of catalog){
  const itinerary=Array.isArray(route.content?.itinerary)?route.content.itinerary:[];
  for(const stop of itinerary){
    const title=typeof stop?.title==='string'?stop.title:typeof stop?.name==='string'?stop.name:'';
    const ids=typeof stop?.attractionId==='string'&&stop.attractionId.trim()
      ? [stop.attractionId.trim()]
      : multiAliases.get(title)??(aliases.has(title)?[aliases.get(title)]:[]);
    for(const id of ids){
      if(!references.has(id))references.set(id,new Set());
      references.get(id).add(route.slug);
    }
  }
}
assert.ok(references.size>0,'No route attraction references were resolved.');

const operationsItems=await rpc('get_operations_attractions');
const itemBySlug=new Map((operationsItems??[]).map(item=>[item.slug,item]));
const changes=[];
const blocked=[];
for(const slug of [...references.keys()].sort()){
  const existing=itemBySlug.get(slug);
  const detail=existing?await rpc('get_operations_attraction',{p_slug:slug}):null;
  const source=corpusBySlug.get(slug);
  if(!source){blocked.push({slug,reason:'missing bundled guide source'});continue;}
  const guides={};
  for(const locale of locales){
    const current=detail?.guides?.[locale];
    guides[locale]={
      title:typeof current?.title==='string'&&current.title.trim()?current.title:source.guides?.[locale]?.title??'',
      body:typeof current?.body==='string'&&current.body.trim()?current.body:source.guides?.[locale]?.body??'',
    };
  }
  const incomplete=locales.filter(locale=>!guides[locale].title.trim()||!guides[locale].body.trim());
  if(incomplete.length){blocked.push({slug,reason:`missing guide locales: ${incomplete.join(',')}`});continue;}
  if(detail?.status==='published'&&locales.every(locale=>detail.guides?.[locale]?.title?.trim()&&detail.guides?.[locale]?.body?.trim()))continue;
  const audio=detail?.audio??Object.fromEntries(locales.map(locale=>[locale,{storagePath:source.audio?.[locale]?.manifestSourcePath??null,audioUrl:null,voice:source.audio?.[locale]?.voice??null,status:'pending'}]));
  changes.push({slug,expectedVersion:Number(detail?.catalog_version??detail?.catalogVersion??existing?.catalog_version??existing?.catalogVersion??0),guides,audio});
}
if(blocked.length)throw new Error(`Attraction publication blocked: ${JSON.stringify(blocked)}`);

if(apply){
  for(const item of changes){
    await rpc('save_operations_attraction',{p_slug:item.slug,p_expected_version:item.expectedVersion,p_status:'published',p_guides:item.guides,p_audio:item.audio});
  }
}

const publicMissing=[];
const media=[];
for(const [slug,routes] of [...references.entries()].sort()){
  const guideLocales=[];
  const audioLocales=[];
  for(const locale of locales){
    const rows=await rpc('get_public_attraction_guide',{p_slug:slug,p_locale:locale});
    if(Array.isArray(rows)&&rows.length===1&&rows[0].title?.trim()&&rows[0].body?.trim()){
      guideLocales.push(locale);
      if(rows[0].audio_url)audioLocales.push(locale);
    }
  }
  if(guideLocales.length!==locales.length)publicMissing.push({slug,locales:locales.filter(locale=>!guideLocales.includes(locale))});
  const rows=await rpc('get_operations_attraction_media',{p_slug:slug});
  const active=(rows??[]).filter(item=>item.status==='active');
  media.push({slug,routes:[...routes].sort(),guideLocales:guideLocales.length,audioLocales:audioLocales.length,images:active.filter(item=>item.media_type==='image').length,videos:active.filter(item=>item.media_type==='video').length});
}
if(apply&&publicMissing.length)throw new Error(`Public guide verification failed: ${JSON.stringify(publicMissing)}`);
console.log(JSON.stringify({mode:apply?'apply':'dry-run',project:expectedProject,routes:catalog.length,attractions:references.size,publishedOrRepaired:changes.map(item=>item.slug),publicMissing,media},null,2));
