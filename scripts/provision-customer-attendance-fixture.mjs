import {createClient} from '@supabase/supabase-js';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PASSENGER_EMAIL','DRIVER_EMAIL'];
for(const name of required)if(!process.env[name]?.trim())throw new Error(`missing ${name}`);
if(process.env.JTW_ALLOW_TEST_FIXTURE!=='true')throw new Error('test fixture guard is not enabled');

const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fail=(label,error)=>{if(error)throw new Error(`${label}: ${error.message}`)};
const one=(rows,label)=>{if(!Array.isArray(rows)||rows.length!==1)throw new Error(`${label}: expected exactly one row`);return rows[0]};

async function authUserId(email){
  let page=1;
  while(page<=20){
    const {data,error}=await supabase.auth.admin.listUsers({page,perPage:100});fail('list fixture users',error);
    const match=data.users.find(user=>user.email?.toLowerCase()===email.toLowerCase());
    if(match)return match.id;
    if(data.users.length<100)break;
    page+=1;
  }
  throw new Error('approved fictitious account was not found');
}

const ownerId=await authUserId(process.env.PASSENGER_EMAIL);
const driverId=await authUserId(process.env.DRIVER_EMAIL);
const {data:profiles,error:profilesError}=await supabase.from('profiles').select('id,role').in('id',[ownerId,driverId]);fail('load fixture profiles',profilesError);
if(profiles?.find(row=>row.id===ownerId)?.role!=='passenger'||profiles?.find(row=>row.id===driverId)?.role!=='driver')throw new Error('fixture account roles do not match');

const tripMarker={slug:'kyoto-nara-classic',title:'TEST-京都与奈良客户签到验收',status:'published'};
const {data:tripRows,error:tripError}=await supabase.from('trips').upsert(tripMarker,{onConflict:'slug'}).select('id');fail('upsert TEST trip',tripError);
const trip=one(tripRows,'TEST trip');

let {data:departureRows,error:departureReadError}=await supabase.from('departures').select('id').eq('trip_id',trip.id).eq('meeting_name','TEST-UAT 客户签到集合点').limit(1);fail('load TEST departure',departureReadError);
let departure=departureRows?.[0];
const departureValues={trip_id:trip.id,departs_at:new Date(Date.now()+7*86400000).toISOString(),capacity:9,status:'open',meeting_name:'TEST-UAT 客户签到集合点',meeting_address:'TEST-虚构地址，仅用于验收',map_lat:null,map_lng:null,seat_price_jpy:100};
if(departure){const {error}=await supabase.from('departures').update(departureValues).eq('id',departure.id);fail('reset TEST departure',error)}
else{const {data,error}=await supabase.from('departures').insert(departureValues).select('id');fail('create TEST departure',error);departure=one(data,'TEST departure')}

let {data:orderRows,error:orderReadError}=await supabase.from('orders').select('id').eq('account_id',ownerId).eq('idempotency_key','uat-customer-attendance-v1').limit(1);fail('load TEST order',orderReadError);
let order=orderRows?.[0];
const orderValues={account_id:ownerId,departure_id:departure.id,idempotency_key:'uat-customer-attendance-v1',seat_count:2,status:'confirmed',currency:'JPY',amount:200};
if(order){const {error}=await supabase.from('orders').update(orderValues).eq('id',order.id);fail('reset TEST order',error)}
else{const {data,error}=await supabase.from('orders').insert(orderValues).select('id');fail('create TEST order',error);order=one(data,'TEST order')}

const {error:contactError}=await supabase.from('order_contact_private').upsert({order_id:order.id,contact_name:'TEST-订单联系人',phone:'000-0000-0000'},{onConflict:'order_id'});fail('upsert TEST contact',contactError);

const {error:lockError}=await supabase.from('inventory_locks').upsert({departure_id:departure.id,order_id:order.id,idempotency_key:'uat-customer-attendance-hold-v1',seats:2,status:'committed',expires_at:new Date(Date.now()+30*86400000).toISOString()},{onConflict:'idempotency_key'});fail('upsert TEST inventory',lockError);

const {data:existingPassengers,error:passengerReadError}=await supabase.from('passengers').select('id,display_name').eq('order_id',order.id);fail('load TEST passengers',passengerReadError);
for(const display_name of ['TEST-同行乘客甲','TEST-同行乘客乙'])if(!existingPassengers?.some(row=>row.display_name===display_name)){const {error}=await supabase.from('passengers').insert({order_id:order.id,display_name,passenger_type:'adult'});fail('create TEST passenger',error)}

let {data:groupRows,error:groupReadError}=await supabase.from('vehicle_groups').select('id,vehicle_assignment_id').eq('departure_id',departure.id).limit(1);fail('load TEST group',groupReadError);
let group=groupRows?.[0];let assignmentId=group?.vehicle_assignment_id;
if(!group){const {data,error}=await supabase.from('vehicle_assignments').insert({departure_id:departure.id,sequence:1,vehicle_type:'hiace-9',vehicle_label:'TEST-Hiace 客户签到验收车',capacity:9,booked_seats:2}).select('id');fail('create TEST assignment',error);assignmentId=one(data,'TEST assignment').id;const groupInsert=await supabase.from('vehicle_groups').insert({departure_id:departure.id,vehicle_assignment_id:assignmentId}).select('id,vehicle_assignment_id');fail('create TEST group',groupInsert.error);group=one(groupInsert.data,'TEST group')}
else{const {error}=await supabase.from('vehicle_assignments').update({vehicle_type:'hiace-9',vehicle_label:'TEST-Hiace 客户签到验收车',capacity:9,booked_seats:2}).eq('id',assignmentId);fail('reset TEST assignment',error)}

const {error:groupOrderError}=await supabase.from('vehicle_group_orders').upsert({vehicle_group_id:group.id,order_id:order.id},{onConflict:'order_id'});fail('upsert TEST group order',groupOrderError);
const {error:staffError}=await supabase.from('staff_assignments').upsert({vehicle_group_id:group.id,staff_id:driverId,role:'driver'},{onConflict:'vehicle_group_id,staff_id'});fail('upsert TEST driver',staffError);
const {error:roomError}=await supabase.from('trip_rooms').upsert({vehicle_group_id:group.id,opens_at:new Date(Date.now()-60000).toISOString(),status:'open'},{onConflict:'vehicle_group_id'});fail('upsert TEST room',roomError);
const {error:boardingError}=await supabase.from('boardings').upsert({order_id:order.id,status:'not_issued',boarded_at:null},{onConflict:'order_id'});fail('upsert TEST boarding',boardingError);

const {data:fixturePassengers,error:fixturePassengerError}=await supabase.from('passengers').select('id').eq('order_id',order.id);fail('reload TEST passengers',fixturePassengerError);
const passengerIds=fixturePassengers.map(row=>row.id);
if(passengerIds.length){
  const {data:checkins,error:checkinReadError}=await supabase.from('passenger_checkins').select('id').in('passenger_id',passengerIds);fail('load TEST check-ins',checkinReadError);
  const checkinIds=(checkins??[]).map(row=>row.id);
  if(checkinIds.length){fail('clear TEST contact actions',(await supabase.from('passenger_contact_actions').delete().in('checkin_id',checkinIds)).error);fail('clear TEST check-in events',(await supabase.from('passenger_checkin_events').delete().in('checkin_id',checkinIds)).error)}
  fail('clear TEST check-ins',(await supabase.from('passenger_checkins').delete().in('passenger_id',passengerIds)).error);
}

console.log(JSON.stringify({status:'PASS',marker:'TEST',orders:1,passengers:fixturePassengers.length,room:'open',driverAssignments:1}));
