import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const parse=text=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}));
const env=parse(readFileSync('.env.supabase.restore.local','utf8'));assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false}});await db.connect();try{await db.query("notify pgrst, 'reload schema'");console.log(JSON.stringify({status:'PASS',project:env.RESTORE_SUPABASE_PROJECT_REF,action:'pgrst_schema_reload'}))}finally{await db.end()}
