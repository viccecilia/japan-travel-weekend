const {Client}=require('pg');

process.env.JTW_OWNER_EMAIL??=process.env.PASSENGER_EMAIL;
process.env.JTW_OTHER_EMAIL??=process.env.PASSENGER2_EMAIL;
process.env.JTW_OPERATIONS_EMAIL??=process.env.OPERATIONS_EMAIL;
const required=['RESTORE_SUPABASE_PROJECT_REF','RESTORE_REGION','SUPABASE_DB_PASSWORD','JTW_OWNER_EMAIL','JTW_OTHER_EMAIL','JTW_OPERATIONS_EMAIL'];
for(const name of required)if(!process.env[name])throw new Error(`missing ${name}`);
const ref=process.env.RESTORE_SUPABASE_PROJECT_REF;
if(['olfucqcznulrtumytjak','udhvgshimnbtdgypbtie'].includes(ref))throw new Error('refusing protected project');
const password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const connectionString=`postgresql://postgres.${ref}:${password}@aws-0-${process.env.RESTORE_REGION}.pooler.supabase.com:5432/postgres`;
const claims=id=>JSON.stringify({sub:id,role:'authenticated'});

(async()=>{
 const client=new Client({connectionString,ssl:{rejectUnauthorized:false}});await client.connect();
 try{
  const migrations=(await client.query("select version from supabase_migrations.schema_migrations where version in ('202609110126','202609110127','202609110128') order by version")).rows.map(row=>row.version);
  if(migrations.join(',')!=='202609110126,202609110127,202609110128')throw new Error(`incremental migration history incomplete: ${migrations.join(',')}`);
  const users=await client.query('select id,email from auth.users where email=any($1::text[])',[[process.env.JTW_OWNER_EMAIL,process.env.JTW_OTHER_EMAIL,process.env.JTW_OPERATIONS_EMAIL]]);
  const byEmail=new Map(users.rows.map(row=>[row.email,row.id]));
  const owner=byEmail.get(process.env.JTW_OWNER_EMAIL),other=byEmail.get(process.env.JTW_OTHER_EMAIL),operations=byEmail.get(process.env.JTW_OPERATIONS_EMAIL);
  if(!owner||!other||!operations)throw new Error('isolated verification identities missing');
  await client.query('begin');
  const notificationId=(await client.query("insert into public.notification_outbox(event_id,event_type,recipient_id,payload) values($1,'departure-reminder',$2,$3) returning id",[`v9-${Date.now()}`,owner,{departure_id:'00000000-0000-0000-0000-000000000001'}])).rows[0].id;
  await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claims',$1,true)",[claims(owner)]);
  const own=await client.query('select payload from public.notification_outbox where id=$1',[notificationId]);
  if(own.rowCount!==1||!own.rows[0].payload.departure_id)throw new Error('recipient could not read own notification payload');
  await client.query("select set_config('request.jwt.claims',$1,true)",[claims(other)]);
  if((await client.query('select payload from public.notification_outbox where id=$1',[notificationId])).rowCount!==0)throw new Error('other passenger read notification payload');
  await client.query('reset role');await client.query("select set_config('request.jwt.claims',$1,true)",[claims(operations)]);await client.query('set local role authenticated');
  const source=(await client.query("select id,catalog_version from public.trips order by updated_at desc limit 1")).rows[0];
  if(!source)throw new Error('product fixture missing');
  const slug=`v9-copy-${Date.now()}`;
  const copied=(await client.query('select public.operations_copy_product_versioned($1,$2,$3,$4) id',[source.id,source.catalog_version,slug,'V9 copy verification'])).rows[0].id;
  if(!copied)throw new Error('versioned copy did not return a draft id');
  await client.query('reset role');await client.query('update public.trips set catalog_version=catalog_version+1 where id=$1',[source.id]);
  await client.query("select set_config('request.jwt.claims',$1,true)",[claims(operations)]);await client.query('set local role authenticated');
  let conflict=false;try{await client.query('select public.operations_copy_product_versioned($1,$2,$3,$4)',[source.id,source.catalog_version,`${slug}-stale`,'stale copy'])}catch(error){conflict=/product version conflict/.test(error.message)}
  if(!conflict)throw new Error('stale product copy was not rejected');
  await client.query('rollback');
  console.log(JSON.stringify({ok:true,migrations,notificationOwnerRead:true,notificationOtherDenied:true,copyCreated:true,staleCopyRejected:true,rollback:true}));
 }catch(error){try{await client.query('rollback')}catch{}throw error}finally{await client.end()}
})().catch(error=>{console.error(error.message);process.exitCode=1});
