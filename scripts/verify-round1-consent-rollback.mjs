// Existing isolated test identities only; all DDL and data changes roll back.
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import pg from 'pg';
const env=parseEnv(readFileSync('.env.supabase.restore.local','utf8'));
const identities=parseEnv(readFileSync('.env.supabase.restore-accounts.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
assert.ok(process.argv.includes('--rollback-test'));
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:'postgres.'+env.RESTORE_SUPABASE_PROJECT_REF,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const q=(sql,args=[])=>db.query(sql,args);
const evidence=[];
const call='select public.update_own_account_profile($1,$2,$3,$4,$5,$6)';
const args=['Round1 Test','000000000','Test Contact','111111111'];
async function deny(label,sql,params,code){
 await q('savepoint negative');
 try{await q(sql,params);assert.fail(label+' unexpectedly allowed')}
 catch(error){assert.equal(error.code,code);evidence.push({test:label,result:'denied',code})}
 finally{await q('rollback to savepoint negative')}
}
await db.connect();
try{
 await q('begin');
 await q("set local lock_timeout='3s'; set local statement_timeout='15s'");
 const account=(await q('select id from auth.users where email=$1',[identities.PASSENGER_EMAIL])).rows[0]?.id;
 assert.ok(account,'Existing isolated passenger required; no account creation');
 for(const file of ['20260921011836_account_profile_consent_once.sql','20260921011919_chat_spanish_language.sql'])
  await q(readFileSync('supabase/migrations/'+file,'utf8'));
 await q('delete from public.account_private_profiles where account_id=$1',[account]);
 await q("select set_config('request.jwt.claim.sub',$1,true)",[account]);
 await q('set local role authenticated');
 await deny('first save without consent',call,[...args,false,false],'P0001');
 await deny('only terms consent',call,[...args,true,false],'P0001');
 await q(call,[...args,true,true]);
 const original=(await q('select accepted_terms_at,accepted_privacy_at from public.get_own_account_profile()')).rows[0];
 assert.ok(original.accepted_terms_at&&original.accepted_privacy_at);
 await q(call,['Updated name',...args.slice(1),false,false]);
 assert.deepEqual((await q('select accepted_terms_at,accepted_privacy_at from public.get_own_account_profile()')).rows[0],original);
 await q(call,[...args,true,true]);
 assert.deepEqual((await q('select accepted_terms_at,accepted_privacy_at from public.get_own_account_profile()')).rows[0],original);
 evidence.push({test:'subsequent saves preserve both original timestamps without renewed consent',result:'passed'});
 const preference=(await q("select * from public.update_own_chat_translation_preference('es',true,false)")).rows[0];
 assert.equal(preference.target_language,'es');
 evidence.push({test:'Spanish preference persisted through actual RPC',result:'passed'});
 await deny('passenger cannot write trusted translations',"select public.store_message_translation(gen_random_uuid(),'es','Hola','test')",[],'42501');
 await q('reset role');await q('set local role anon');
 await deny('anonymous profile save',call,[...args,true,true],'42501');
 console.log(JSON.stringify({evidence,changes:'all rolled back'},null,2));
}finally{await q('rollback');await db.end()}
