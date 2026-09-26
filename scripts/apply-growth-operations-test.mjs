// Explicit test-project migration application. It intentionally applies only
// the two reviewed Growth files and records exactly those versions.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

if(!process.argv.includes('--apply-test-growth'))throw new Error('Pass --apply-test-growth to apply schema changes to the disposable test project.');
const parse=(text)=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}));
const env=parse(readFileSync('.env.supabase.restore.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const migrations=[
  ['20260926043656','growth_operations_phase1','supabase/migrations/20260926043656_growth_operations_phase1.sql'],
  ['20260926054340','growth_operations_phase2_ambassador_center','supabase/migrations/20260926054340_growth_operations_phase2_ambassador_center.sql'],
  ['20260926082708','growth_operations_phase3_referral_tree','supabase/migrations/20260926082708_growth_operations_phase3_referral_tree.sql'],
  ['20260926083645','growth_operations_phase3_tree_details','supabase/migrations/20260926083645_growth_operations_phase3_tree_details.sql'],
  ['20260926084520','growth_operations_phase3_anomaly_scope','supabase/migrations/20260926084520_growth_operations_phase3_anomaly_scope.sql'],
  ['20260926084628','growth_operations_phase3_root_counts','supabase/migrations/20260926084628_growth_operations_phase3_root_counts.sql'],
  ['20260926085302','growth_operations_phase3_tree_focus','supabase/migrations/20260926085302_growth_operations_phase3_tree_focus.sql'],
  ['20260926090500','growth_operations_phase3_root_financials','supabase/migrations/20260926090500_growth_operations_phase3_root_financials.sql'],
  ['20260926091500','growth_operations_phase3_period_context','supabase/migrations/20260926091500_growth_operations_phase3_period_context.sql'],
];
const sql=(file)=>readFileSync(file,'utf8');
await db.connect();
try{
  await db.query('begin');
  const applied=[];
  for(const [version,name,file] of migrations){
    const existing=await db.query('select version from supabase_migrations.schema_migrations where version=$1',[version]);
    if(existing.rowCount){applied.push({version,name,status:'already_applied'});continue;}
    const statement=sql(file);await db.query(statement);
    await db.query('insert into supabase_migrations.schema_migrations(version,statements,name,created_by,idempotency_key,rollback) values($1,$2,$3,$4,$5,$6)',[version,[statement],name,'jtw-growth-phase2-test-script',`jtw-${version}`,[]]);
    applied.push({version,name,status:'applied'});
  }
  await db.query('commit');
  console.log(JSON.stringify({status:'PASS',project:env.RESTORE_SUPABASE_PROJECT_REF,applied}));
}catch(error){try{await db.query('rollback')}catch{}throw error}finally{await db.end()}
