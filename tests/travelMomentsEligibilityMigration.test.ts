import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/20260925090000_travel_moments_eligible_orders.sql','utf8');

describe('Travel Moments eligible-order RPC',()=>{
  it('limits choices to the authenticated passenger, current campaign month, and completed journey state',()=>{
    expect(sql).toContain('o.account_id=auth.uid()');
    expect(sql).toContain("journey.status='completed'");
    expect(sql).toContain("date_trunc('month',d.departs_at at time zone 'Asia/Tokyo')::date=c.campaign_month");
    expect(sql).toContain("o.status in ('paid','confirmed')");
  });
  it('requires the exact limited authorization scope and accepts only TikTok or Instagram',()=>{
    expect(sql).toContain("'share-link-limited-v2'");
    expect(sql).toContain('"download":false');
    expect(sql).toContain('"paid_ads":false');
    expect(sql).toContain("p_platform not in ('tiktok','instagram')");
  });
  it('uses the eligible-order RPC for server-side ownership and canonicalizes query variants',()=>{
    expect(sql).toContain('get_own_travel_moment_orders(p_campaign) eligible where eligible.order_id=p_order');
    expect(sql).toContain("regexp_replace(split_part(v_url,'#',1),'[?].*$','')");
  });
  it('does not grant anonymous execution',()=>{
    expect(sql).toContain('revoke all on function public.get_own_travel_moment_orders(uuid) from public,anon');
    expect(sql).toContain('to authenticated,service_role');
  });
});
