import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';

const parse=text=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}));
const env=parse(readFileSync('.env.server.test.local','utf8'));
if(env.SUPABASE_URL!=='https://hzxoofvodpqpdomtmzlf.supabase.co')throw new Error('refusing non-test Supabase project');
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const email='phase41-c0-smoke-20260929-passenger@example.invalid';
const signed=await admin.auth.signInWithPassword({email,password:'C0Smoke-20260929!'});if(signed.error||!signed.data.session)throw signed.error??new Error('sign in failed');
const submission=await admin.from('travel_moment_submissions').select('id,verification_generation').eq('submission_number','PHASE41-FINAL-UI-mention').single();if(submission.error)throw submission.error;
const response=await fetch('https://api-test.japan-travel.info/v1/travel-moments/check',{method:'POST',headers:{authorization:`Bearer ${signed.data.session.access_token}`,'content-type':'application/json'},body:JSON.stringify({submissionId:submission.data.id,trigger:'user_recheck',expectedGeneration:submission.data.verification_generation})});
console.log(JSON.stringify({http:response.status,body:await response.json(),generation:submission.data.verification_generation}));
