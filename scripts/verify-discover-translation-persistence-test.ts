import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {applyHeroTranslationPackage,buildHeroTranslationPackage} from '../src/shared/contentPackages';
import type {DiscoverHero} from '../src/shared/discover';

const required=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','OPERATIONS_EMAIL','OPERATIONS_PASSWORD','PASSENGER_EMAIL','PASSENGER_PASSWORD'] as const;
for(const key of required)assert.ok(process.env[key],`${key} is required`);
assert.equal(process.env.VITE_SUPABASE_URL,'https://hzxoofvodpqpdomtmzlf.supabase.co','Test Supabase only');

const options={auth:{persistSession:false,autoRefreshToken:false}};
const client=()=>createClient(process.env.VITE_SUPABASE_URL!,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,options);
const operations=client();
const passenger=client();
const fixtureId=randomUUID();
let fixtureVersion:number|undefined;
let operationsAuthenticated=false;
let verified=false;

async function signIn(target:ReturnType<typeof client>,email:string,password:string){
  const {error}=await target.auth.signInWithPassword({email,password});
  if(error)throw error;
}
async function save(target:ReturnType<typeof client>,hero:DiscoverHero){
  const {data,error}=await target.rpc('save_discover_hero',{p_id:hero.id,p_expected_version:hero.version,p_content:{
    video_url:hero.video_url,poster_url:hero.poster_url,product_id:hero.product_id,translations:hero.translations,enabled:hero.enabled,sort_order:hero.sort_order,
  }});
  if(error)throw error;
  return data as DiscoverHero;
}
async function readFixture(){
  const {data,error}=await operations.rpc('get_operations_discover_heroes');
  if(error)throw error;
  const hero=(data as DiscoverHero[]).find(item=>item.id===fixtureId);
  assert.ok(hero,'fixture must be readable through Operations RPC');
  return hero;
}

try{
  await Promise.all([
    signIn(operations,process.env.OPERATIONS_EMAIL!,process.env.OPERATIONS_PASSWORD!),
    signIn(passenger,process.env.PASSENGER_EMAIL!,process.env.PASSENGER_PASSWORD!),
  ]);
  operationsAuthenticated=true;

  const source:DiscoverHero={
    id:fixtureId,video_url:'/media/discover/translation-persistence-fixture.mp4',poster_url:'/media/discover/translation-persistence-fixture.jpg',
    product_id:null,product_slug:null,translations:{'zh-CN':{title:'持久化验收标题',subtitle:'持久化验收副标题'}},enabled:false,sort_order:9999,version:0,
  };
  const translationPackage=buildHeroTranslationPackage(source);
  const title=translationPackage.fields.find(field=>field.field_key==='title')!;
  const subtitle=translationPackage.fields.find(field=>field.field_key==='subtitle')!;
  title.translations['zh-TW']={text:'持久化驗收標題',status:'draft',source_hash:title.source_hash};
  subtitle.translations['zh-TW']={text:'持久化驗收副標題',status:'draft',source_hash:subtitle.source_hash};
  const imported=applyHeroTranslationPackage(source,translationPackage).hero;

  const saved=await save(operations,imported);
  fixtureVersion=saved.version;
  const reread=await readFixture();
  assert.equal(reread.translations['zh-TW']?.title,'持久化驗收標題');
  assert.equal(reread.translations['zh-TW']?.subtitle,'持久化驗收副標題');
  assert.equal(reread.translations['zh-TW']?._content_package?.fields?.title?.source_hash,title.source_hash);
  assert.equal(reread.translations['zh-TW']?._content_package?.fields?.subtitle?.source_hash,subtitle.source_hash);

  const reexported=buildHeroTranslationPackage(reread);
  assert.equal(reexported.fields.find(field=>field.field_key==='title')?.translations['zh-TW']?.status,'draft');
  assert.equal(reexported.fields.find(field=>field.field_key==='subtitle')?.translations['zh-TW']?.status,'draft');

  const changed=await save(operations,{...reread,translations:{...reread.translations,'zh-CN':{title:'已修改的持久化验收标题',subtitle:'持久化验收副标题'}}});
  fixtureVersion=changed.version;
  const afterSourceChange=await readFixture();
  const incremental=buildHeroTranslationPackage(afterSourceChange);
  assert.equal(incremental.fields.find(field=>field.field_key==='title')?.translations['zh-TW']?.status,'stale');
  assert.equal(incremental.fields.find(field=>field.field_key==='subtitle')?.translations['zh-TW']?.status,'draft');

  const passengerAttempt=await passenger.rpc('save_discover_hero',{p_id:fixtureId,p_expected_version:fixtureVersion,p_content:{
    video_url:afterSourceChange.video_url,poster_url:afterSourceChange.poster_url,product_id:null,translations:afterSourceChange.translations,enabled:false,sort_order:9999,
  }});
  assert.match(passengerAttempt.error?.message??'',/operations only/);

  const malformed=structuredClone(afterSourceChange);
  (malformed.translations['zh-TW']!._content_package as Record<string,unknown>).unknown='rejected';
  const malformedAttempt=await operations.rpc('save_discover_hero',{p_id:fixtureId,p_expected_version:fixtureVersion,p_content:{
    video_url:malformed.video_url,poster_url:malformed.poster_url,product_id:null,translations:malformed.translations,enabled:false,sort_order:9999,
  }});
  assert.match(malformedAttempt.error?.message??'',/unsupported translation metadata field/);

  const legacy=await save(operations,{...afterSourceChange,version:fixtureVersion!,translations:{'zh-CN':{title:'旧格式标题',subtitle:'旧格式副标题'}}});
  fixtureVersion=legacy.version;
  assert.equal(legacy.translations['zh-CN']?.title,'旧格式标题');
  verified=true;
}finally{
  if(operationsAuthenticated){
    const {data,error:readError}=await operations.rpc('get_operations_discover_heroes');
    if(readError)throw readError;
    const fixture=(data as DiscoverHero[]).find(item=>item.id===fixtureId);
    if(fixture){
      const {error}=await operations.rpc('delete_discover_hero',{p_id:fixtureId,p_expected_version:fixture.version});
      if(error)throw error;
    }
  }
}
assert.ok(verified);
console.log(JSON.stringify({status:'PASS',project:'hzxoofvodpqpdomtmzlf',formalRpc:true,metadataRoundTrip:true,reexport:true,singleFieldStaleness:true,legacyShape:true,operationsDeniedForPassenger:true,fixtureRemoved:true}));
