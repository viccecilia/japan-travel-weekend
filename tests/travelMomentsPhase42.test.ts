import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {DeterministicSocialMetricsProvider,TravelMomentMetricsRefreshJob} from '../server/travelMoments';

const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260929060000_phase42_monthly_candidates.sql'),'utf8');

describe('Phase 4.2 Travel Moments monthly candidate contract',()=>{
  it('keeps live metrics append-only, NULL-safe, and refresh-idempotent',()=>{
    expect(sql).toContain('travel_moment_metric_snapshots add column if not exists refresh_key');
    expect(sql).toContain('on conflict (submission_id,refresh_key)');
    expect(sql).toContain("s.status<>'eligible'");
    expect(sql).not.toContain("coalesce(p_metrics->>'likes','0')");
  });
  it('uses Tokyo cutoff plus 72-hour maturity to place late posts in their first fair month',()=>{
    expect(sql).toContain("timezone('Asia/Tokyo'");
    expect(sql).toContain("interval '72 hours'");
    expect(sql).toContain('tm_evaluation_month');
  });
  it('freezes one auditable run, normalizes per platform, and renormalizes missing weights',()=>{
    expect(sql).toContain('evaluation_month date not null unique');
    expect(sql).toContain('travel_moment_monthly_runs');
    expect(sql).toContain('cume_dist() over(partition by f.platform');
    expect(sql).toContain('weight_sum');
    expect(sql).toContain('metric_percentiles');
  });
  it('limits a user to one monthly slot and supports an audited reserve promotion',()=>{
    expect(sql).toContain('unique(monthly_run_id,account_id)');
    expect(sql).toContain("case when r.rank<=25 then 'candidate' else 'reserve' end");
    expect(sql).toContain("action in ('generated','rejected','approved','featured','promoted')");
    expect(sql).toContain("promotion_reason='candidate rejected'");
  });
  it('records flags without using them as an eligibility or rejection shortcut',()=>{
    for(const flag of ['ENGAGEMENT_OUTLIER','METRIC_SPIKE','METRIC_DROP','ENGAGEMENT_WITHOUT_VIEW_GROWTH','HIGH_SUBMISSION_VOLUME','POST_UNAVAILABLE'])expect(sql).toContain(flag);
    expect(sql).not.toContain("status='rejected' where submission_id");
  });
  it('uses the existing provider and writes deterministic historical snapshots only once per key',async()=>{
    const provider=new DeterministicSocialMetricsProvider(true);
    const calls:any[]=[];
    const db={rpc:async(name:string,args?:any)=>{
      if(name==='get_travel_moment_metrics_refresh_queue')return {data:[{submission_id:'one',post_url:'https://tiktok.com/@j/video/1001',social_account_name:'@j'}],error:null};
      calls.push({name,args});return {data:true,error:null};
    }} as any;
    const result=await new TravelMomentMetricsRefreshJob(provider,db).run('test-key');
    expect(result).toMatchObject({refreshed:1,skipped:0,error:null});
    expect(calls[0]).toMatchObject({name:'record_travel_moment_metric_snapshot',args:{p_submission:'one',p_refresh_key:'test-key:one'}});
  });
});
