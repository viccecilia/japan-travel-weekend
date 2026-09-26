// Test-project only: apply both growth migrations in one transaction, assert
// their public RPC surface, then roll everything back.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

const parse=(text)=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}));
const env=parse(readFileSync('.env.supabase.restore.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const sql=(file)=>readFileSync(file,'utf8').replace(/^\s*begin;\s*/i,'').replace(/\s*commit;\s*$/i,'');
await db.connect();
try{
 await db.query('begin');
 await db.query(sql('supabase/migrations/20260926043656_growth_operations_phase1.sql'));
 await db.query(sql('supabase/migrations/20260926054340_growth_operations_phase2_ambassador_center.sql'));
 await db.query(readFileSync('supabase/verification/growth_operations_phase1_regression.sql','utf8'));
 const result=await db.query("select to_regprocedure('public.get_ambassador_dashboard()') as dashboard,to_regprocedure('public.list_own_referral_records(integer,integer)') as records,to_regprocedure('public.list_own_commission_history(integer,integer)') as history");
 assert.ok(result.rows[0].dashboard&&result.rows[0].records&&result.rows[0].history,'phase 2 RPCs missing');
 console.log(JSON.stringify({status:'PASS',scope:'rollback-only-test-project',checks:{phase1:true,permanentQualification:true,dashboard:true,records:true,history:true}}));
}finally{try{await db.query('rollback')}catch{}await db.end()}
