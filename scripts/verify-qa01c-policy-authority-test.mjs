import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';

if(!process.argv.includes('--verify-qa01c-policy-authority-test'))throw new Error('Pass --verify-qa01c-policy-authority-test.');
const parse=text=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
const env=parse(readFileSync('.env.supabase.restore.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
await db.connect();
try{
  const policies=await db.query(`select t.template_key,v.id,v.version_number,v.state,count(l.locale)::integer as locales
    from public.policy_templates t join public.policy_template_versions v on v.template_id=t.id
    left join public.policy_template_localizations l on l.policy_version_id=v.id
    where t.template_key=any($1)
    group by t.template_key,v.id,v.version_number,v.state order by t.template_key,v.version_number`,[['jtw-day-trip-standard','standard-10h-v1','standard-24h-v1']]);
  const expected=['jtw-day-trip-standard','standard-10h-v1','standard-24h-v1'];
  for(const key of expected){
    const versions=policies.rows.filter(row=>row.template_key===key);
    assert.deepEqual(versions.map(row=>row.version_number),[1,2,3],`${key} must retain V1/V2 and create V3 only`);
    assert.equal(versions.find(row=>row.version_number===3)?.state,'published');
    assert.equal(versions.find(row=>row.version_number===3)?.locales,7);
    assert.equal(versions.find(row=>row.version_number===1)?.state,'superseded');
    assert.equal(versions.find(row=>row.version_number===2)?.state,'superseded');
  }
  const departure=(await db.query(`select d.id,t.id as trip_id from public.departures d join public.trips t on t.id=d.trip_id where public.is_departure_sellable(d.id,now()) order by d.departs_at limit 1`)).rows[0];
  if(!departure)throw new Error('No sellable Test departure exists for QA-01C quote acceptance.');
  const route=(await db.query(`select t.slug,g.version_number as global_version,s.version_number as service_version,c.version_number as cancellation_version from public.trips t join public.policy_template_versions g on g.template_id=t.policy_template_id and g.state='published' join public.policy_template_versions s on s.template_id=t.service_time_policy_template_id and s.state='published' join public.policy_template_versions c on c.template_id=t.cancellation_policy_template_id and c.state='published' where t.id=$1`,[departure.trip_id])).rows[0];
  assert.deepEqual([route.global_version,route.service_version,route.cancellation_version],[3,3,3]);
  const account=(await db.query("select id from public.profiles where id=(select id from auth.users where email='qa01-operations-20260930@example.invalid' limit 1)" )).rows[0]?.id;
  if(!account)throw new Error('Expected Test Operations profile is unavailable.');
  await db.query('begin');
  const quoteResult=await db.query("select public.create_order_quote($1,$2,1,null,'zh-CN') as result",[account,departure.id]);
  const quoteId=quoteResult.rows[0]?.result?.quoteId;
  if(!quoteId)throw new Error('Test quote was not created.');
  const quote=(await db.query(`select q.*,g.version_number as global_version,s.version_number as service_version,c.version_number as cancellation_version
    from public.order_quotes q
    join public.policy_template_versions g on g.id=q.policy_template_version_id
    join public.policy_template_versions s on s.id=q.service_time_policy_version_id
    join public.policy_template_versions c on c.id=q.cancellation_policy_version_id where q.id=$1`,[quoteId])).rows[0];
  assert.deepEqual([quote.global_version,quote.service_version,quote.cancellation_version],[3,3,3]);
  assert.deepEqual(Object.keys(quote.commercial_terms),['routeSpecific']);
  assert.deepEqual(Object.keys(quote.agreement_snapshot.policyModules).sort(),['cancellation','global','serviceTime']);
  const key=`qa01c-${randomUUID()}`;
  const reserved=(await db.query("select * from public.reserve_inventory($1,$2,1,$3,now()+interval '10 minutes')",[departure.id,account,key])).rows[0];
  if(!reserved?.order_id)throw new Error('Test order reservation was not created.');
  const applied=await db.query('select * from public.apply_order_quote($1,$2,$3)',[account,reserved.order_id,quoteId]);
  if(!applied.rowCount)throw new Error('Test quote could not be applied to the order.');
  await db.query("update public.orders set status='confirmed',payment_kind='bank_transfer',payment_status_text='succeeded',updated_at=now() where id=$1",[reserved.order_id]);
  const snapshot=(await db.query(`select s.*,g.version_number as global_version,st.version_number as service_version,c.version_number as cancellation_version
    from public.order_snapshots s join public.policy_template_versions g on g.id=s.policy_template_version_id
    join public.policy_template_versions st on st.id=s.service_time_policy_version_id
    join public.policy_template_versions c on c.id=s.cancellation_policy_version_id where s.order_id=$1`,[reserved.order_id])).rows[0];
  assert.deepEqual([snapshot.global_version,snapshot.service_version,snapshot.cancellation_version],[3,3,3]);
  assert.deepEqual(snapshot.agreement_snapshot,quote.agreement_snapshot);
  const migration=(await db.query("select version,name from supabase_migrations.schema_migrations order by version desc limit 1")).rows[0];
  await db.query('commit');
  console.log(JSON.stringify({status:'PASS',project:env.RESTORE_SUPABASE_PROJECT_REF,migration,policyVersions:policies.rows,route,quote:{id:quoteId,versions:[quote.global_version,quote.service_version,quote.cancellation_version]},order:{id:reserved.order_id,snapshotVersions:[snapshot.global_version,snapshot.service_version,snapshot.cancellation_version],snapshotCopied:true}}));
}catch(error){try{await db.query('rollback');}catch{}throw error;}finally{await db.end();}
