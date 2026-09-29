import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];for(const key of required)if(!process.env[key])throw new Error(`missing ${key}`);
if(process.env.SUPABASE_URL!=='https://hzxoofvodpqpdomtmzlf.supabase.co')throw new Error('refusing non-test Supabase project');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fail=(label,error)=>{if(error)throw new Error(`${label}: ${error.message}`)};
const stamp='phase41-c0-smoke-20260929';
const accounts=[
  {email:`${stamp}-passenger@example.invalid`,password:'C0Smoke-20260929!',role:'passenger',display_name:'C0 旅行瞬间测试游客'},
  {email:`${stamp}-operations@example.invalid`,password:'C0Smoke-20260929!',role:'operations',display_name:'C0 旅行瞬间测试运营'},
];
async function account(spec){let page=1,user;while(page<10){const listed=await admin.auth.admin.listUsers({page,perPage:100});fail('list test users',listed.error);user=listed.data.users.find(row=>row.email===spec.email);if(user||listed.data.users.length<100)break;page+=1}if(!user){const created=await admin.auth.admin.createUser({email:spec.email,password:spec.password,email_confirm:true,user_metadata:{display_name:spec.display_name}});fail('create test user',created.error);user=created.data.user}fail('upsert test profile',(await admin.from('profiles').upsert({id:user.id,role:spec.role,display_name:spec.display_name},{onConflict:'id'})).error);return user.id}
const [passengerId,operationsId]=await Promise.all(accounts.map(account));
const {data:completed,error:completedError}=await admin.from('vehicle_group_journey_state').select('vehicle_group_id').eq('status','completed').limit(1);fail('find completed journey',completedError);if(!completed?.[0])throw new Error('no completed test journey is available');
const groupId=completed[0].vehicle_group_id;const group=await admin.from('vehicle_groups').select('departure_id').eq('id',groupId).single();fail('load completed group',group.error);const departureId=group.data.departure_id;
const departures=await admin.from('departures').select('trip_id').eq('id',departureId).single();fail('load completed departure',departures.error);const tripId=departures.data.trip_id;
async function order(key){const existing=await admin.from('orders').select('id').eq('idempotency_key',key).maybeSingle();fail('load C0 order',existing.error);let id=existing.data?.id;if(!id){id=randomUUID();fail('create C0 order',(await admin.from('orders').insert({id,account_id:passengerId,departure_id:departureId,idempotency_key:key,seat_count:1,status:'paid',currency:'JPY',amount:100,is_test_order:false})).error)}fail('attach C0 order to completed journey',(await admin.from('vehicle_group_orders').upsert({vehicle_group_id:groupId,order_id:id},{onConflict:'order_id'})).error);return id}
const [orderA,orderB]=await Promise.all([order(`${stamp}-order-a`),order(`${stamp}-order-b`)]);
const fixtures=[
  {key:'account',url:'https://tiktok.com/@c0/video/41001',content:'tiktok:41001',order:orderA,reason:'ACCOUNT_MISMATCH'},
  {key:'trip',url:'https://tiktok.com/@c0/video/41002',content:'tiktok:41002',order:orderB,reason:'TRIP_MISMATCH'},
  {key:'url',url:'not-a-post-url',content:null,order:orderA,reason:'INVALID_URL'},
];
for(const fixture of fixtures){const existing=await admin.from('travel_moment_submissions').select('id').eq('canonical_url',fixture.url).maybeSingle();fail('load C0 submission',existing.error);if(!existing.data){fail('create C0 submission',(await admin.from('travel_moment_submissions').insert({submission_number:'',account_id:passengerId,requested_order_id:fixture.order,order_id:fixture.order,trip_id:tripId,platform:'tiktok',post_url:fixture.url,canonical_url:fixture.url,canonical_content_id:fixture.content,social_account_name:'@c0-original',status:'needs_adjustment',internal_verdict:'eligible',external_verdict:'needs_adjustment',reason_codes:[fixture.reason]})).error)}}
console.log(JSON.stringify({status:'PASS',project:'hzxoofvodpqpdomtmzlf',fixture:'phase41-c0',passenger:true,operations:true,orders:2,submissions:3}));
