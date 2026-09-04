import {createClient} from '@supabase/supabase-js';
import {readEmailAlertConfig,sendEmailAlert} from '../.server-dist/server/emailAlerts.js';

if(process.env.JTW_RUNTIME_MODE!=='test')throw new Error('departure cutoff scheduler is restricted to explicit test mode');
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])if(!process.env[key])throw new Error(`missing ${key}`);
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const now=new Date();
const {data:processed,error:processError}=await client.rpc('process_due_departure_cutoffs',{p_now:now.toISOString()});
if(processError)throw new Error(`departure cutoff failed: ${processError.code??'database_error'}`);
const {data:alerts,error:alertError}=await client.from('departure_operations_alerts').select('id,departure_id,passenger_count,threshold,departures(departs_at,trips(title))').eq('status','pending').is('email_alerted_at',null).order('created_at').limit(20);
if(alertError)throw new Error(`departure alert read failed: ${alertError.code??'database_error'}`);
const config=readEmailAlertConfig(process.env);let emailed=0;
for(const alert of alerts??[]){
  if(!config)break;
  const departure=Array.isArray(alert.departures)?alert.departures[0]:alert.departures;
  const trip=departure&&(Array.isArray(departure.trips)?departure.trips[0]:departure.trips);
  await sendEmailAlert(config,{event:'low-booking',endpoint:'departure-cutoff',consecutiveFailures:0,occurredAt:now,departureId:alert.departure_id,tripTitle:trip?.title,departsAt:departure?.departs_at,passengerCount:alert.passenger_count,threshold:alert.threshold});
  const {error}=await client.rpc('mark_departure_alert_emailed',{p_alert:alert.id,p_now:new Date().toISOString()});
  if(error)throw new Error(`departure alert receipt failed: ${error.code??'database_error'}`);
  emailed+=1;
}
console.log(JSON.stringify({ok:true,processed:processed??[],pendingAlerts:(alerts??[]).length,emailed,emailEnabled:config!==null}));
