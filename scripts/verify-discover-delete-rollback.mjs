// Runs the new RPC and a fictional Hero only inside a rolled-back transaction.
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
const env=parseEnv(readFileSync('.env.supabase.restore.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
assert.ok(process.argv.includes('--rollback-test'));
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:'postgres.'+env.RESTORE_SUPABASE_PROJECT_REF,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const q=(sql,args=[])=>db.query(sql,args);
const evidence=[];
const id=randomUUID();
const signature='public.delete_discover_hero(uuid,integer)';
async function role(name,user=''){
 await q('reset role');await q("select set_config('request.jwt.claim.sub',$1,true)",[user]);
 await q(name==='anon'?'set local role anon':'set local role authenticated');
}
async function rejected(label,version,code){
 await q('savepoint negative');
 try{await q('select public.delete_discover_hero($1,$2)',[id,version]);assert.fail(label+' unexpectedly allowed')}
 catch(error){assert.equal(error.code,code);evidence.push({test:label,result:'denied',code})}
 finally{await q('rollback to savepoint negative')}
}
await db.connect();
let beforeFunction;
try{
 beforeFunction=(await q('select to_regprocedure($1) as fn',[signature])).rows[0].fn;
 assert.equal(beforeFunction,null,'Refuse to replace an already installed RPC');
 await q('begin');
 await q("set local statement_timeout='15s'; set local lock_timeout='3s'");
 await q(readFileSync('supabase/migrations/20260920070417_delete_discover_hero.sql','utf8'));
 assert.equal((await q("select relrowsecurity from pg_class where oid='public.discover_heroes'::regclass")).rows[0].relrowsecurity,true);
 assert.equal((await q("select has_table_privilege('authenticated','public.discover_heroes','DELETE') as allowed")).rows[0].allowed,false);
 const users=(await q("select u.id,p.role from auth.users u join public.profiles p on p.id=u.id where u.email in ('jtw.restore.operations@example.invalid','jtw.restore.passenger@example.invalid')")).rows;
 const ops=users.find(u=>u.role==='operations')?.id,passenger=users.find(u=>u.role==='passenger')?.id;
 assert.ok(ops&&passenger,'Use existing isolated identities, never create or reset accounts');
 await role('authenticated',ops);
 const content={video_url:'/media/discover/autumn-soul.mp4',poster_url:'/media/discover/autumn-soul.jpg',product_id:null,translations:{'zh-CN':{title:'ROLLBACK DELETE TEST',subtitle:''}},enabled:true,sort_order:9999};
 await q('select public.save_discover_hero($1,0,$2)',[id,content]);
 await role('anon');
 assert.ok((await q('select public.get_public_discover_heroes() as rows')).rows[0].rows.some(h=>h.id===id));
 await rejected('anonymous delete',1,'42501');
 await role('authenticated',passenger);
 await rejected('passenger delete',1,'42501');
 await role('authenticated',ops);
 await q('select public.save_discover_hero($1,1,$2)',[id,content]);
 await rejected('stale version delete',1,'40001');
 assert.equal((await q('select version from public.discover_heroes where id=$1',[id])).rows[0].version,2);
 assert.equal((await q('select public.delete_discover_hero($1,2) as id',[id])).rows[0].id,id);
 evidence.push({test:'operations deletes current version',result:'passed'});
 await rejected('duplicate/missing delete',2,'40001');
 await role('anon');
 assert.ok(!(await q('select public.get_public_discover_heroes() as rows')).rows[0].rows.some(h=>h.id===id));
 evidence.push({test:'deleted Hero absent from public RPC',result:'passed'});
}finally{
 await q('rollback');
 assert.equal((await q('select to_regprocedure($1) as fn',[signature])).rows[0].fn,beforeFunction);
 assert.equal((await q('select count(*)::int as n from public.discover_heroes where id=$1',[id])).rows[0].n,0);
 await db.end();
}
console.log(JSON.stringify({transaction:'ROLLED BACK; no function, Hero, migration history or media changes persisted',evidence},null,2));
