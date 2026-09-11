import {createClient} from '@supabase/supabase-js';

const credentials={
  passenger:[process.env.JTW_OWNER_EMAIL??process.env.PASSENGER_EMAIL,process.env.JTW_OWNER_PASSWORD??process.env.PASSENGER_PASSWORD],
  staff:[process.env.JTW_DRIVER_EMAIL??process.env.DRIVER_EMAIL,process.env.JTW_DRIVER_PASSWORD??process.env.DRIVER_PASSWORD],
  operations:[process.env.JTW_OPERATIONS_EMAIL??process.env.OPERATIONS_EMAIL,process.env.JTW_OPERATIONS_PASSWORD??process.env.OPERATIONS_PASSWORD],
};
const required=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'];
for(const key of required)if(!process.env[key])throw new Error(`Missing ${key}`);
for(const [label,values] of Object.entries(credentials))if(values.some(value=>!value))throw new Error(`Missing ${label} acceptance credentials`);

const make=()=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const identities=[
  ['passenger','passenger'],
  ['staff','staff'],
  ['operations','operations'],
];

for(const [label,expected] of identities){
  const client=make();
  const [email,password]=credentials[label];
  const login=await client.auth.signInWithPassword({email,password});
  if(login.error)throw new Error(`${label}: sign-in failed`);
  const access=await client.rpc('get_own_access_destination');
  if(access.error)throw new Error(`${label}: access RPC failed`);
  const actual=Array.isArray(access.data)?access.data[0]?.destination:null;
  if(actual!==expected)throw new Error(`${label}: expected ${expected}, received ${actual??'none'}`);
  const staffTasks=await client.rpc('get_staff_portal_tasks');
  const operationsRead=await client.rpc('get_operations_dashboard_departures');
  if(label==='passenger'&&!staffTasks.error&&staffTasks.data?.length)throw new Error('passenger: staff task data leaked');
  if(label==='operations'&&operationsRead.error)throw new Error('operations: dashboard RPC denied');
  if(label!=='operations'&&!operationsRead.error)throw new Error(`${label}: operations dashboard RPC was not denied`);
  await client.auth.signOut();
  console.log(JSON.stringify({identity:label,login:'passed',destination:actual,staffTaskAccess:staffTasks.error?'denied-or-unavailable':'allowed-empty-or-scoped',operationsAccess:operationsRead.error?'denied-or-unavailable':'allowed-empty-or-scoped',logout:'passed'}));
}

const wrong=make();
const wrongResult=await wrong.auth.signInWithPassword({email:credentials.passenger[0],password:'deliberately-wrong-password'});
if(!wrongResult.error)throw new Error('incorrect password was accepted');
console.log(JSON.stringify({identity:'passenger',incorrectPassword:'rejected'}));
