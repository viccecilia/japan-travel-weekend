import type {SupabaseClient} from '@supabase/supabase-js';
import type {VerifiedSession} from './supabase.js';

export type ProviderResult={provider:string;result:Record<string,unknown>;reasonCodes:string[];metrics:Record<string,unknown>|null};
export interface SocialMetricsProvider{resolvePost(url:string,account:string):Promise<ProviderResult>}
/** Test-only deterministic fixture provider. Production deliberately returns unknown until an approved provider is configured. */
export class DeterministicSocialMetricsProvider implements SocialMetricsProvider{
 constructor(private readonly enabled:boolean){}
 async resolvePost(url:string,account:string):Promise<ProviderResult>{
  if(!this.enabled)return {provider:'unconfigured',result:{},reasonCodes:['EXTERNAL_CHECK_UNAVAILABLE'],metrics:null};
  const match=url.match(/(?:video\/|reel\/|p\/)(\d+)/);const code=match?.[1]??'1001';
  const manualUnknown=code.endsWith('8');const reasons=code.endsWith('2')?['MISSING_OFFICIAL_MENTION']:code.endsWith('3')?['MISSING_CAMPAIGN_HASHTAG']:code.endsWith('4')?['ACCOUNT_MISMATCH']:code.endsWith('5')?['POST_PRIVATE']:code.endsWith('6')?['POST_UNAVAILABLE']:(code.endsWith('7')||manualUnknown)?['EXTERNAL_CHECK_UNAVAILABLE']:[];
  return {provider:'deterministic-test',result:{public:!reasons.includes('POST_PRIVATE'),officialMention:manualUnknown?false:!reasons.includes('MISSING_OFFICIAL_MENTION'),campaignHashtag:!reasons.includes('MISSING_CAMPAIGN_HASHTAG'),authorMatches:!reasons.includes('ACCOUNT_MISMATCH'),author:account,publishedAt:'2026-09-01T00:00:00.000Z'},reasonCodes:reasons,metrics:reasons.length?null:{views:1200,likes:95,comments:7,shares:3,saves:null,coverage:{views:true,likes:true,comments:true,shares:true,saves:false}}};
 }
}
export class TravelMomentCheckEndpoint{
 constructor(private readonly provider:SocialMetricsProvider,private readonly db:SupabaseClient|null){}
 async post(session:VerifiedSession,input:{submissionId?:string;trigger?:'initial_submit'|'user_recheck'|'admin_recheck';expectedGeneration?:number}){
  if(!this.db||!input.submissionId||!Number.isInteger(input.expectedGeneration)||Number(input.expectedGeneration)<1||!['initial_submit','user_recheck','admin_recheck'].includes(input.trigger??''))return {status:400,body:{error:'invalid_request'}};
  const {data,error}=await this.db.from('travel_moment_submissions').select('id,account_id,post_url,social_account_name,internal_verdict,verification_generation,status,reason_codes').eq('id',input.submissionId).maybeSingle();
  if(error||!data)return {status:404,body:{error:'submission_not_found'}};
  if(data.account_id!==session.accountId){const role=await this.db.from('profiles').select('role').eq('id',session.accountId).maybeSingle();if(role.data?.role!=='operations'||input.trigger!=='admin_recheck')return {status:404,body:{error:'submission_not_found'}};}
  if(data.internal_verdict==='ineligible')return {status:200,body:{status:'ineligible',reasonCodes:data.reason_codes??[]}};
  const check=await this.provider.resolvePost(String(data.post_url),String(data.social_account_name));
  const result=await this.db.rpc('record_travel_moment_provider_check',{p_submission:data.id,p_trigger:input.trigger,p_provider:check.provider,p_result:check.result,p_reason_codes:check.reasonCodes,p_metrics:check.metrics,p_expected_generation:input.expectedGeneration});
  if(result.error||result.data!==true)return {status:503,body:{error:'check_unavailable'}};
  const current=await this.db.from('travel_moment_submissions').select('verification_generation,status,reason_codes').eq('id',data.id).maybeSingle();
  if(current.error||!current.data)return {status:503,body:{error:'check_unavailable'}};
  return {status:200,body:{status:String(current.data.status),reasonCodes:Array.isArray(current.data.reason_codes)?current.data.reason_codes:[],stale:Number(current.data.verification_generation)!==input.expectedGeneration}};
 }
}

/**
 * A low-frequency, provider-agnostic metrics job.  It never recomputes Phase
 * 4.1 eligibility and every successful poll receives a deterministic key, so
 * retries cannot overwrite or duplicate snapshot history.
 */
export class TravelMomentMetricsRefreshJob{
 constructor(private readonly provider:SocialMetricsProvider,private readonly db:SupabaseClient|null){}
 async run(refreshKey:string){
  if(!this.db)return {refreshed:0,skipped:0,error:'database_unavailable'};
  const queue=await this.db.rpc('get_travel_moment_metrics_refresh_queue');
  if(queue.error)return {refreshed:0,skipped:0,error:queue.error.message};
  let refreshed=0,skipped=0;
  for(const row of (Array.isArray(queue.data)?queue.data:[]) as Array<Record<string,unknown>>){
   const check=await this.provider.resolvePost(String(row.post_url??''),String(row.social_account_name??''));
   if(!check.metrics){skipped++;continue;}
   const saved=await this.db.rpc('record_travel_moment_metric_snapshot',{p_submission:String(row.submission_id),p_provider:check.provider,p_metrics:check.metrics,p_refresh_key:`${refreshKey}:${row.submission_id}`});
   if(saved.error||saved.data!==true)skipped++;else refreshed++;
  }
  return {refreshed,skipped,error:null as string|null};
 }
}
