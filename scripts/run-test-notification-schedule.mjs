import {createClient} from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL??'';const key=process.env.SUPABASE_SERVICE_ROLE_KEY??'';
if(process.env.JTW_RUNTIME_MODE!=='test')throw new Error('notification scheduler is restricted to explicit test mode');
if(!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(url)||!key)throw new Error('test Supabase scheduler configuration is incomplete');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await client.rpc('enqueue_due_fulfilment_notifications',{p_now:new Date().toISOString()});
if(error)throw new Error(`notification scheduler failed: ${error.code??'database_error'}`);console.log(JSON.stringify({ok:true,mode:'test',events:data??[]}));
