import {createClient} from '@supabase/supabase-js';

const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
async function signIn(email,password){const c=client();const {error}=await c.auth.signInWithPassword({email,password});if(error)throw new Error(`Login failed: ${error.message}`);return c}
const passenger=await signIn(process.env.PASSENGER_EMAIL??process.env.JTW_OWNER_EMAIL,process.env.PASSENGER_PASSWORD??process.env.JTW_OWNER_PASSWORD);
const {data:room,error:roomError}=await passenger.rpc('get_accessible_trip_room').maybeSingle();
if(roomError||!room?.vehicle_group_id)throw new Error(`Passenger room unavailable: ${roomError?.message??'none'}`);
const {data:passengerStops,error:passengerError}=await passenger.rpc('get_vehicle_group_itinerary',{p_vehicle_group:room.vehicle_group_id});
if(passengerError||!Array.isArray(passengerStops)||passengerStops.length<2)throw new Error(`Passenger itinerary failed: ${passengerError?.message??'empty'}`);
const outsider=await signIn(process.env.PASSENGER2_EMAIL??process.env.JTW_OTHER_EMAIL,process.env.PASSENGER2_PASSWORD??process.env.JTW_OTHER_PASSWORD);
const {data:outsiderStops}=await outsider.rpc('get_vehicle_group_itinerary',{p_vehicle_group:room.vehicle_group_id});
if(Array.isArray(outsiderStops)&&outsiderStops.length)throw new Error('Outsider could read passenger vehicle itinerary');
const driver=await signIn(process.env.DRIVER_EMAIL??process.env.JTW_DRIVER_EMAIL,process.env.DRIVER_PASSWORD??process.env.JTW_DRIVER_PASSWORD);
const {data:tasks,error:taskError}=await driver.rpc('get_staff_portal_tasks');
if(taskError||!tasks?.length)throw new Error(`Driver tasks unavailable: ${taskError?.message??'empty'}`);
const {data:driverStops,error:driverError}=await driver.rpc('get_vehicle_group_itinerary',{p_vehicle_group:tasks[0].vehicle_group_id});
if(driverError||!Array.isArray(driverStops))throw new Error(`Driver itinerary failed: ${driverError?.message??'invalid response'}`);
console.log(JSON.stringify({ok:true,passengerStops:passengerStops.length,driverStops:driverStops.length,driverTaskUsesReferenceRoute:driverStops.length>0,outsiderDenied:true}));
