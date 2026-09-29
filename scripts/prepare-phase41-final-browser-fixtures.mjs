import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';

const parse=text=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}));
const env=parse(readFileSync('.env.server.test.local','utf8'));
if(env.SUPABASE_URL!=='https://hzxoofvodpqpdomtmzlf.supabase.co')throw new Error('refusing non-test Supabase project');
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fail=(label,result)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};
const email='phase41-c0-smoke-20260929-passenger@example.invalid';
let passenger;for(let page=1;page<10;page++){const listed=await admin.auth.admin.listUsers({page,perPage:100});if(listed.error)throw listed.error;passenger=listed.data.users.find(item=>item.email===email);if(passenger||listed.data.users.length<100)break}
if(!passenger)throw new Error('missing C0 test passenger');
const orders=fail('load test orders',await admin.from('orders').select('id').eq('account_id',passenger.id).like('idempotency_key','phase41-c0-smoke-20260929-order-%').order('created_at'));
if(orders.length<2)throw new Error('missing C0 test orders');
const departure=fail('load departure',await admin.from('departures').select('trip_id').eq('id',(fail('load order',await admin.from('orders').select('departure_id').eq('id',orders[0].id).single())).departure_id).single());
const mark='PHASE41-FINAL-UI';
const fixtures=[
  {key:'account',url:'https://tiktok.com/@phase41ui/video/50011',content:'tiktok:50011',order:orders[0].id,account:'@wrong-account',reason:'ACCOUNT_MISMATCH'},
  {key:'trip',url:'https://tiktok.com/@phase41ui/video/50021',content:'tiktok:50021',order:orders[1].id,account:'@phase41ui',reason:'TRIP_MISMATCH'},
  {key:'url',url:'not-a-post-url-phase41-ui',content:null,order:orders[0].id,account:'@phase41ui',reason:'INVALID_URL'},
  {key:'mention',url:'https://tiktok.com/@phase41ui/video/50041',content:'tiktok:50041',order:orders[0].id,account:'@phase41ui',reason:'MISSING_OFFICIAL_MENTION'},
  {key:'pending',url:'https://tiktok.com/@phase41ui/video/50047',content:'tiktok:50047',order:orders[0].id,account:'@phase41ui',reason:'EXTERNAL_CHECK_UNAVAILABLE'},
  {key:'duplicate',url:'https://tiktok.com/@phase41ui/video/50051',content:'tiktok:50051',order:orders[0].id,account:'@phase41ui',reason:'EXTERNAL_CHECK_UNAVAILABLE'},
];
const ids={};
for(const item of fixtures){const prior=fail(`load ${item.key}`,await admin.from('travel_moment_submissions').select('id').eq('submission_number',`${mark}-${item.key}`).maybeSingle());if(prior){ids[item.key]=prior.id;continue}const inserted=fail(`insert ${item.key}`,await admin.from('travel_moment_submissions').insert({submission_number:`${mark}-${item.key}`,account_id:passenger.id,requested_order_id:item.order,order_id:item.order,trip_id:departure.trip_id,platform:'tiktok',post_url:item.url,canonical_url:item.url,canonical_content_id:item.content,social_account_name:item.account,status:item.reason==='EXTERNAL_CHECK_UNAVAILABLE'?'pending_review':'needs_adjustment',internal_verdict:'eligible',external_verdict:item.reason==='EXTERNAL_CHECK_UNAVAILABLE'?'unknown':'needs_adjustment',reason_codes:[item.reason],verification_generation:1}).select('id').single());ids[item.key]=inserted.id}
const states=fail('load fixture state',await admin.from('travel_moment_submissions').select('id,canonical_url,status,reason_codes,verification_generation').in('id',Object.values(ids)));
console.log(JSON.stringify({status:'PASS',project:'hzxoofvodpqpdomtmzlf',marker:mark,ids,orders:orders.map(item=>item.id),states}));
