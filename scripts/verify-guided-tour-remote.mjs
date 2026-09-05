import {createClient} from '@supabase/supabase-js';
const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PASSENGER_EMAIL','PASSENGER_PASSWORD','PASSENGER2_EMAIL','PASSENGER2_PASSWORD'];
for(const key of required)if(!process.env[key])throw new Error(`missing ${key}`);
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const login=async(email,password)=>{const client=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY??process.env.SUPABASE_ANON_KEY,options);const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;return client};
let assignmentId=null;
try{
  const users=[];for(let page=1;;page++){const {data,error}=await service.auth.admin.listUsers({page,perPage:100});if(error)throw error;users.push(...data.users);if(data.users.length<100)break}
  const owner=users.find(user=>user.email===process.env.PASSENGER_EMAIL);const operations=(await service.from('profiles').select('id').eq('role','operations').limit(1)).data?.[0];
  if(!owner||!operations)throw new Error('fictional owner or operations profile missing');
  const {data:orders,error:ordersError}=await service.from('orders').select('id').eq('account_id',owner.id).in('status',['paid','confirmed']);if(ordersError)throw ordersError;
  const ids=(orders??[]).map(row=>row.id);if(!ids.length)throw new Error('fictional passenger has no paid order');
  const {data:links,error:linksError}=await service.from('vehicle_group_orders').select('vehicle_group_id,order_id').in('order_id',ids).limit(1);if(linksError)throw linksError;const groupId=links?.[0]?.vehicle_group_id;if(!groupId)throw new Error('fictional passenger has no vehicle group');
  const {data:plan,error:planError}=await service.from('guided_tour_plans').select('id').eq('route_key','kiyomizu-arashiyama').single();if(planError)throw planError;
  const existing=await service.from('vehicle_group_guided_tours').select('id').eq('vehicle_group_id',groupId).maybeSingle();if(existing.error)throw existing.error;
  const assignment=existing.data??(await service.from('vehicle_group_guided_tours').insert({vehicle_group_id:groupId,plan_id:plan.id,activated_by:operations.id}).select('id').single()).data;if(!assignment)throw new Error('cannot create guided assignment');assignmentId=assignment.id;
  const ownerClient=await login(process.env.PASSENGER_EMAIL,process.env.PASSENGER_PASSWORD);const otherClient=await login(process.env.PASSENGER2_EMAIL,process.env.PASSENGER2_PASSWORD);
  const ownerLink=await ownerClient.from('vehicle_group_orders').select('vehicle_group_id,order_id').eq('vehicle_group_id',groupId);
  const ownerRead=await ownerClient.from('vehicle_group_guided_tours').select('id').eq('id',assignmentId);if(ownerRead.error||ownerRead.data?.length!==1)throw new Error(`owner cannot read guided assignment: ${ownerRead.error?.message??`rows=${ownerRead.data?.length}; own-links=${ownerLink.data?.length}; linked-order=${links?.[0]?.order_id===ids.find(id=>id===links?.[0]?.order_id)}`}`);
  const otherRead=await otherClient.from('vehicle_group_guided_tours').select('id').eq('id',assignmentId);if(otherRead.error||otherRead.data?.length!==0)throw new Error('unrelated passenger can read guided assignment');
  const saved=await ownerClient.rpc('save_own_guided_tour_progress',{p_assignment:assignmentId,p_branch_key:'meal-first',p_completed_node_keys:['kodaiji-dropoff'],p_last_acknowledged_node_key:'kodaiji-dropoff'});if(saved.error)throw saved.error;
  const rejected=await otherClient.rpc('save_own_guided_tour_progress',{p_assignment:assignmentId,p_branch_key:'meal-first',p_completed_node_keys:[],p_last_acknowledged_node_key:null});if(!rejected.error)throw new Error('unrelated passenger progress write was accepted');
  console.log(JSON.stringify({guidedTour:'PASS',ownerRead:1,unrelatedRead:0,progressSaved:true,unrelatedWriteRejected:true}));
}finally{
  if(assignmentId){await service.from('guided_tour_progress').delete().eq('assignment_id',assignmentId);await service.from('vehicle_group_guided_tours').delete().eq('id',assignmentId)}
}
