// Test-only importer for the human-approved, seven-language JTW Policy source.
// It performs structural Markdown mapping only; bodies are never translated,
// generated, summarized, or altered.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';

const verifyOnly=process.argv.includes('--verify-source-only');
if(!verifyOnly&&!process.argv.includes('--apply-test-v3'))throw new Error('Pass --apply-test-v3 or --verify-source-only.');
const argument=(name)=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]??'':'';};
const sourceDir=resolve(argument('--source-dir')||'docs/policy-source/v1');
const envFile=argument('--env-file');
if(!envFile)throw new Error('Pass --env-file containing Test Supabase server credentials.');
const parseEnv=(text)=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];}));
const env=parseEnv(readFileSync(envFile,'utf8'));
assert.equal(env.SUPABASE_URL,'https://hzxoofvodpqpdomtmzlf.supabase.co');
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY,'Test service role key is required.');
const locales=['zh-CN','ja','en','ko','vi','ne','es'];
const marker=/V2 测试版本|V2テスト版|V2 test version|V2 테스트 버전|Bản thử nghiệm V2|V2 परीक्षण संस्करण|versión de prueba V2/i;

const moduleAt=(markdown,letter,next)=>{
  const heading=new RegExp(`^# ${letter}\\.\\s.*$`,'gm');
  const starts=[...markdown.matchAll(heading)];
  if(starts.length!==1)throw new Error(`Expected exactly one ${letter} module heading.`);
  const start=starts[0].index??0;
  const end=next?[...markdown.matchAll(new RegExp(`^# ${next}\\.\\s.*$`,'gm'))][0]?.index:markdown.length;
  if(end==null)throw new Error(`Expected ${next} module heading.`);
  return markdown.slice(start,end).trim();
};
const headingParts=(text,level=2)=>{
  const expression=new RegExp(`^${'#'.repeat(level)}\\s+(.+?)\\s*$`,'gm');
  const matches=[...text.matchAll(expression)];
  return matches.map((match,index)=>({title:match[1],body:text.slice((match.index??0)+match[0].length,index+1<matches.length?(matches[index+1].index??text.length):text.length).trim()}));
};
const parseModules=(markdown)=>{
  if(marker.test(markdown))throw new Error('Formal source contains a prohibited Test V2 marker.');
  const global=moduleAt(markdown,'A','B');
  const service=moduleAt(markdown,'B','C');
  const cancellation=moduleAt(markdown,'C');
  const globalParts=headingParts(global);
  const serviceParts=headingParts(service);
  const serviceFull=serviceParts.find(item=>item.title.trim())??{title:'',body:service};
  const short=headingParts(service,3)[0]??{title:'',body:''};
  const shortHeading=`### ${short.title}`;
  const shortOffset=short.title?serviceFull.body.indexOf(shortHeading):-1;
  if(shortOffset>=0)serviceFull.body=serviceFull.body.slice(0,shortOffset).trim();
  const cancellationPart=headingParts(cancellation).find(item=>item.title.trim())??{title:'',body:cancellation};
  if(globalParts.length!==17||!serviceFull.body||!short.body||!cancellationPart.body)throw new Error('Policy module structure is incomplete.');
  return {
    global:Object.fromEntries(globalParts.map((item,index)=>[`section_${String(index+1).padStart(2,'0')}`,item])),
    service_time:{full:serviceFull,short_product_notice:short},
    cancellation:{cancellation:cancellationPart},
  };
};
const modulesByLocale=Object.fromEntries(locales.map(locale=>{
  const source=readFileSync(resolve(sourceDir,`JTW_policy_V1_${locale}.md`),'utf8');
  return [locale,parseModules(source)];
}));
const digest=createHash('sha256').update(JSON.stringify(modulesByLocale)).digest('hex');
if(verifyOnly){
  console.log(JSON.stringify({status:'PASS',sourceDir,digest,locales,modules:{global:17,serviceTime:['full','short_product_notice'],cancellation:['cancellation']}}));
  process.exit(0);
}

const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const email='qa01-operations-20260930@example.invalid';
const password=`Qa01c!${randomUUID()}`;
let accountId;
for(let page=1;!accountId;page+=1){
  const users=await admin.auth.admin.listUsers({page,perPage:200});
  if(users.error)throw users.error;
  accountId=users.data.users.find(user=>user.email===email)?.id;
  if(users.data.users.length<200)break;
}
if(!accountId)throw new Error(`Expected existing Test-only Operations account ${email} was not found.`);
const reset=await admin.auth.admin.updateUserById(accountId,{password,email_confirm:true});
if(reset.error)throw reset.error;
const profile=await admin.from('profiles').upsert({id:accountId,role:'operations',display_name:'QA-01C Test Operations'},{onConflict:'id'});
if(profile.error)throw profile.error;
const operations=createClient(env.SUPABASE_URL,'sb_publishable_OGjatjrOJE6HZel87XyhKg_YkgfeU2_',{auth:{persistSession:false,autoRefreshToken:false}});
const signed=await operations.auth.signInWithPassword({email,password});
if(signed.error)throw signed.error;
const templates=await operations.rpc('get_operations_policy_templates');
if(templates.error)throw templates.error;
const expected=[
  ['jtw-day-trip-standard','global'],
  ['standard-10h-v1','service_time'],
  ['standard-24h-v1','cancellation'],
];
const result=[];
for(const [templateKey,moduleKey] of expected){
  const template=templates.data.find(row=>row.template_key===templateKey);
  if(!template)throw new Error(`Missing policy template ${templateKey}.`);
  const content=Object.fromEntries(locales.map(locale=>[locale,modulesByLocale[locale][moduleKey]]));
  const save=await operations.rpc('operations_save_policy_draft',{p_template:template.template_id,p_localizations:content});
  if(save.error)throw save.error;
  const publish=await operations.rpc('operations_publish_policy_draft',{p_template:template.template_id});
  if(publish.error)throw publish.error;
  result.push({templateKey,versionId:publish.data,locales:locales.length});
}
const verified=await operations.rpc('get_operations_policy_templates');
if(verified.error)throw verified.error;
for(const item of result){
  const row=verified.data.find(value=>value.template_key===item.templateKey);
  if(!row||row.version_number!==3||row.version_state!=='published'||Object.keys(row.localizations??{}).length!==7||marker.test(JSON.stringify(row.localizations)))throw new Error(`V3 verification failed for ${item.templateKey}.`);
}
console.log(JSON.stringify({status:'PASS',project:'hzxoofvodpqpdomtmzlf',sourceDir,digest,versions:result,locales,usedOperationsRpc:true}));
