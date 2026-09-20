// Never deploys the migration: DDL and fictional rows are rolled back together.
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import pg from 'pg';
const env=parseEnv(readFileSync('.env.supabase.restore.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
assert.ok(process.argv.includes('--rollback-test'),'Explicit --rollback-test required');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:'postgres.'+env.RESTORE_SUPABASE_PROJECT_REF,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const q=(sql,args=[])=>db.query(sql,args);
const evidence=[];
async function asAccount(id){await q('reset role');await q("select set_config('request.jwt.claim.sub',$1,true)",[id??'']);await q('set local role authenticated')}
async function reject(label,sql,args,code){
 await q('savepoint negative');
 try{await q(sql,args);throw Error(label+' unexpectedly accepted')}
 catch(error){assert.equal(error.code,code,label);evidence.push({test:label,result:'denied',code})}
 finally{await q('rollback to savepoint negative')}
}
await db.connect();
try{
 await q('begin');await q("set local statement_timeout='15s'");await q("set local lock_timeout='3s'");
 assert.equal((await q("select to_regclass('public.discover_heroes') as table")).rows[0].table,null,'Refuse to test against an existing live content table');
 await q(readFileSync('supabase/migrations/20260920054451_discover_video_heroes.sql','utf8'));
 const ids=(await q("select u.id,p.role from auth.users u join public.profiles p on p.id=u.id where u.email in ('jtw.restore.operations@example.invalid','jtw.restore.passenger@example.invalid')")).rows;
 const ops=ids.find(row=>row.role==='operations')?.id;
 const passenger=ids.find(row=>row.role==='passenger')?.id;
 assert.ok(ops&&passenger,'Existing isolated identities required; no accounts created/reset');
 const id='ca631d49-42ee-4c6c-9630-09275e838099';
 const content={video_url:'/media/discover/autumn-soul.mp4',poster_url:'/media/discover/autumn-soul.jpg',product_id:null,translations:{'zh-CN':{title:'TEST rollback',subtitle:'not published fixture'}},enabled:false,sort_order:99};
 const save='select public.save_discover_hero($1,$2,$3) as saved';
 await asAccount(passenger);
 await reject('passenger cannot read management','select public.get_operations_discover_heroes()',[],'42501');
 await reject('passenger cannot save',save,[id,0,content],'42501');
 await reject('direct table insert forbidden',"insert into public.discover_heroes(id,video_url,poster_url) values($1,$2,$3)",[id,content.video_url,content.poster_url],'42501');
 await asAccount(ops);
 const first=(await q(save,[id,0,content])).rows[0].saved;
 assert.equal(first.version,1);
 assert.equal(first.product_id,null);
 await reject('concurrent/stale update',save,[id,0,content],'40001');
 await reject('commercial field injection',save,[id,1,{...content,price:1}],'P0001');
 await reject('unsupported locale',save,[id,1,{...content,translations:{fr:{title:'test',subtitle:''}}}],'P0001');
 const second=(await q(save,[id,1,{...content,enabled:true}])).rows[0].saved;
 assert.equal(second.version,2);
 await q('reset role');await q("select set_config('request.jwt.claim.sub','',true)");await q('set local role anon');
 const publicRows=(await q('select public.get_public_discover_heroes() as rows')).rows[0].rows;
 assert.ok(publicRows.some(row=>row.id===id));
 assert.ok(publicRows.every(row=>!('updated_by' in row)));
 await reject('anonymous management denied','select public.get_operations_discover_heroes()',[],'42501');
 await asAccount(ops);await q(save,[id,2,{...content,enabled:false}]);
 await q('reset role');await q("select set_config('request.jwt.claim.sub','',true)");await q('set local role anon');
 assert.ok(!(await q('select public.get_public_discover_heroes() as rows')).rows[0].rows.some(row=>row.id===id));
 evidence.push({test:'create/save/read/version/disable/fallback-safe public listing',result:'passed'});
}finally{
 await q('rollback');await db.end();
}
console.log(JSON.stringify({transaction:'ROLLED BACK; no migration or content persisted',evidence},null,2));
