import {createClient} from '@supabase/supabase-js';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPERATIONS_EMAIL','OPERATIONS_PASSWORD','DRIVER_EMAIL','DRIVER_PASSWORD'];
for(const key of required)if(!process.env[key])throw new Error(`missing ${key}`);
if(process.env.JTW_RUNTIME_MODE!=='test')throw new Error('V12 driver approval setup requires explicit test mode');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const operations=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const driver=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};

const users=must(await admin.auth.admin.listUsers({page:1,perPage:1000}),'list test users').users;
const operationsAccount=users.find(user=>user.email?.toLowerCase()===process.env.OPERATIONS_EMAIL.toLowerCase());
const driverAccount=users.find(user=>user.email?.toLowerCase()===process.env.DRIVER_EMAIL.toLowerCase());
if(!operationsAccount||!driverAccount)throw new Error('configured test operations or driver account does not exist');
must(await admin.auth.admin.updateUserById(operationsAccount.id,{password:process.env.OPERATIONS_PASSWORD,email_confirm:true}),'restore operations login');
must(await admin.auth.admin.updateUserById(driverAccount.id,{password:process.env.DRIVER_PASSWORD,email_confirm:true}),'restore driver login');
must(await admin.from('profiles').upsert({id:operationsAccount.id,role:'operations'},{onConflict:'id'}),'restore operations role');
must(await admin.from('profiles').upsert({id:driverAccount.id,role:'passenger'},{onConflict:'id'}),'prepare driver approval');

const application=must(await admin.from('staff_account_applications').upsert({
  account_id:driverAccount.id,
  requested_role:'driver',
  status:'pending',
  applicant_name:'V12 隔离测试司机',
  review_note:'',
  reviewed_by:null,
  reviewed_at:null,
  updated_at:new Date().toISOString(),
},{onConflict:'account_id'}).select('id').single(),'prepare driver application');

must(await operations.auth.signInWithPassword({email:process.env.OPERATIONS_EMAIL,password:process.env.OPERATIONS_PASSWORD}),'operations sign-in');
must(await operations.rpc('operations_review_staff_application',{p_application:application.id,p_decision:'approved',p_note:'V12-DEMO 隔离身份审批'}),'approve driver through operations workflow');
must(await driver.auth.signInWithPassword({email:process.env.DRIVER_EMAIL,password:process.env.DRIVER_PASSWORD}),'driver sign-in');
const destination=must(await driver.rpc('get_own_access_destination'),'driver destination')?.[0];
if(destination?.destination!=='staff'||destination?.application_status!=='approved')throw new Error(`driver access not approved: ${JSON.stringify(destination??null)}`);
const tasks=must(await driver.rpc('get_staff_portal_tasks'),'approved driver tasks');
if(!Array.isArray(tasks)||tasks.length===0)throw new Error('approved driver cannot read assigned tasks');

console.log(JSON.stringify({ok:true,operationsAccountId:operationsAccount.id,driverAccountId:driverAccount.id,applicationId:application.id,destination:'staff',applicationStatus:'approved',visibleTaskCount:tasks.length,usedOperationsApprovalWorkflow:true}));
