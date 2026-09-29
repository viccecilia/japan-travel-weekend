import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

if(!process.argv.includes('--apply-phase42-test'))throw new Error('Pass --apply-phase42-test.');
const parse=text=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}));
const env=parse(readFileSync('.env.supabase.restore.local','utf8'));assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
const version='20260929060000',name='phase42_monthly_candidates',sql=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
await db.connect();
try{await db.query('begin');if((await db.query('select 1 from supabase_migrations.schema_migrations where version=$1',[version])).rowCount)throw new Error('Phase 4.2 migration already recorded; refusing implicit refresh.');await db.query(sql);await db.query('insert into supabase_migrations.schema_migrations(version,statements,name,created_by,idempotency_key,rollback) values($1,$2,$3,$4,$5,$6)',[version,[sql],name,'jtw-phase42-test-acceptance',`jtw-${version}`,[]]);const objects=await db.query("select to_regclass('public.travel_moment_monthly_runs') runs,to_regclass('public.travel_moment_final_snapshots') final_snapshots,to_regprocedure('public.operations_generate_travel_moment_monthly_candidates(date)') candidate_run,to_regprocedure('public.record_travel_moment_metric_snapshot(uuid,text,jsonb,text)') metrics_refresh");await db.query('commit');console.log(JSON.stringify({status:'PASS',project:env.RESTORE_SUPABASE_PROJECT_REF,migration:{version,name},objects:objects.rows[0]}));}catch(error){try{await db.query('rollback')}catch{}throw error}finally{await db.end()}
