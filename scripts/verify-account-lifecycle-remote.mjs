import { createClient } from '@supabase/supabase-js'

const required=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','PASSENGER_EMAIL','PASSENGER_PASSWORD','PASSENGER2_EMAIL','PASSENGER2_PASSWORD']
for(const name of required)if(!process.env[name])throw new Error(`Missing remote acceptance setting: ${name}`)
const options={auth:{autoRefreshToken:false,persistSession:false}}
const owner=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options)
const other=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options)
const admin=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options)
const slug=`test-account-lifecycle-${Date.now()}`
let tripId=null,departureId=null,draftId=null,ownerId=null
const fail=(message,error)=>{throw new Error(`${message}${error?.message?`: ${error.message}`:''}`)}
const signIn=async(client,email,password)=>{const {data,error}=await client.auth.signInWithPassword({email,password});if(error)fail('Fictional account sign-in failed',error);return data.user}

try{
  const [ownerUser]=await Promise.all([
    signIn(owner,process.env.PASSENGER_EMAIL,process.env.PASSENGER_PASSWORD),
    signIn(other,process.env.PASSENGER2_EMAIL,process.env.PASSENGER2_PASSWORD),
  ])
  ownerId=ownerUser.id
  const profileInput={p_display_name:'TEST Account Owner',p_phone:'TEST-PHONE',p_emergency_name:'TEST Emergency',p_emergency_phone:'TEST-EMERGENCY-PHONE',p_accept_terms:true,p_accept_privacy:true}
  const {error:updateError}=await owner.rpc('update_own_account_profile',profileInput)
  if(updateError)fail('Owner profile update failed',updateError)
  const {data:profile,error:profileError}=await owner.rpc('get_own_account_profile').single()
  if(profileError||profile.account_id!==ownerId||profile.display_name!=='TEST Account Owner')fail('Owner profile read failed',profileError)
  const {data:isolated,error:isolationError}=await other.from('account_private_profiles').select('account_id').eq('account_id',ownerId)
  if(isolationError||isolated.length!==0)fail('Unrelated passenger profile isolation failed',isolationError)
  const {error:escalationError}=await owner.from('profiles').update({role:'operations'}).eq('id',ownerId)
  if(!escalationError)fail('Passenger self role escalation was not rejected')
  const {data:audit,error:auditError}=await owner.from('account_audit_events').select('action,metadata').eq('target_id',ownerId)
  if(auditError||!audit.some(row=>row.action==='profile_updated'))fail('Minimal owner audit read failed',auditError)
  const auditText=JSON.stringify(audit)
  for(const secret of ['TEST-PHONE','TEST-EMERGENCY-PHONE'])if(auditText.includes(secret))fail('Audit leaked private contact data')

  const {data:trip,error:tripError}=await admin.from('trips').insert({slug,title:'TEST Account Lifecycle',status:'published',content:{description:'用于账户生命周期隔离验收，不代表真实销售产品。',itinerary:['TEST 集合','TEST 行程','TEST 返回'],included:['测试服务'],excluded:['所有真实收费项目'],childPolicy:'仅使用虚构儿童资料。',luggagePolicy:'测试不得录入真实行李资料。',accessibilityInfo:'测试不得录入真实健康资料。',mealInfo:'测试不包含真实餐食。',weatherPolicy:'测试天气规则不构成真实承诺。',cancellationPolicyVersion:'test-account-lifecycle'}}).select('id').single()
  if(tripError)fail('TEST trip creation failed',tripError);tripId=trip.id
  const departsAt=new Date(Date.now()+7*86400000)
  const {data:departure,error:departureError}=await admin.from('departures').insert({trip_id:tripId,departs_at:departsAt.toISOString(),ends_at:new Date(departsAt.getTime()+10*3600000).toISOString(),sales_open_at:new Date(Date.now()-3600000).toISOString(),sales_close_at:new Date(departsAt.getTime()-86400000).toISOString(),capacity:6,status:'open',meeting_name:'TEST Meeting',meeting_address:'TEST Account Lifecycle Address',map_lat:34.666944,map_lng:135.506111,seat_price_jpy:100,currency:'JPY',tax_included:true,minimum_guests:1}).select('id').single()
  if(departureError)fail('TEST departure creation failed',departureError);departureId=departure.id
  const {data:draft,error:draftError}=await owner.rpc('save_own_booking_draft',{p_departure:departureId,p_adults:1,p_children:0,p_infants:0,p_passenger_private:{name:'TEST Passenger',phone:'TEST-PHONE',emergency:'TEST Emergency'},p_assistance_private:{},p_operational_review_status:'not_requested',p_accepted_cancellation:true,p_accepted_terms:true,p_idempotency_key:`test-account-draft-${Date.now()}`})
  if(draftError)fail('Owner draft creation failed',draftError);draftId=draft
  const {data:abandoned,error:abandonError}=await owner.rpc('abandon_own_booking_draft',{p_draft:draftId})
  if(abandonError||abandoned!==true)fail('Owner draft abandonment failed',abandonError)
  const {data:otherDraft,error:otherDraftError}=await other.from('booking_drafts').select('id').eq('id',draftId)
  if(otherDraftError||otherDraft.length!==0)fail('Unrelated passenger draft isolation failed',otherDraftError)
  console.log('REMOTE_ACCOUNT_PROFILE=PASS')
  console.log('UNRELATED_PROFILE_ISOLATION=PASS')
  console.log('SELF_ROLE_ESCALATION_REJECTED=PASS')
  console.log('MINIMAL_AUDIT=PASS')
  console.log('DRAFT_ABANDONMENT=PASS')
  console.log('UNRELATED_DRAFT_ISOLATION=PASS')
}finally{
  if(draftId)await admin.from('booking_drafts').delete().eq('id',draftId)
  if(departureId)await admin.from('departures').delete().eq('id',departureId)
  if(tripId)await admin.from('trips').delete().eq('id',tripId)
  if(ownerId)await admin.from('account_private_profiles').delete().eq('account_id',ownerId)
  await Promise.allSettled([owner.auth.signOut(),other.auth.signOut()])
  console.log('TEST_FIXTURE_CLEANUP=PASS')
}
