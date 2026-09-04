import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';

const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const sql=await readFile('supabase/migrations/202609040060_route_itinerary_stops.sql','utf8');
const rows=[...sql.matchAll(/\('([^']+)',\$json\$(\[[\s\S]*?\])\$json\$::jsonb\)/g)].map(match=>({slug:match[1],stops:JSON.parse(match[2])}));
if(rows.length!==5)throw new Error(`Expected 5 route itineraries, found ${rows.length}`);
for(const row of rows){
  const {data,error}=await client.from('trips').select('content').eq('slug',row.slug).single();
  if(error)throw new Error(`Cannot load ${row.slug}: ${error.message}`);
  const {error:updateError}=await client.from('trips').update({content:{...(data.content??{}),itineraryStops:row.stops}}).eq('slug',row.slug);
  if(updateError)throw new Error(`Cannot update ${row.slug}: ${updateError.message}`);
}
console.log(JSON.stringify({ok:true,routes:rows.length,stops:rows.reduce((sum,row)=>sum+row.stops.length,0)}));
