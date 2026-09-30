import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {SupabaseCatalogRepository,type PublicRoutePolicies} from '../src/shared/integrations/supabaseProduction';
import {routePolicyDisplay} from '../src/shared/routePolicyDisplay';

const policies:PublicRoutePolicies={
  global:{templateKey:'global',versionId:'global-v3',version:3,sections:{terms:{title:'Global',body:'body'}}},
  service_time:{templateKey:'service',versionId:'service-v3',version:3,sections:{full:{title:'10h',body:'body'}}},
  cancellation:{templateKey:'cancellation',versionId:'cancellation-v3',version:3,sections:{refund:{title:'24h',body:'body'}}},
};

describe('RouteDetailV2 policy presentation',()=>{
  it('keeps legacy rules hidden while policy loading',()=>{
    expect(routePolicyDisplay({status:'loading'})).toMatchObject({showLoading:true,showLegacyFallback:false});
  });

  it('shows shared policy and hides legacy rules when all modules are available',()=>{
    expect(routePolicyDisplay({status:'available',policies})).toMatchObject({showSharedPolicy:true,showLegacyFallback:false});
  });

  it('allows the legacy fallback only after a successful absent result',()=>{
    expect(routePolicyDisplay({status:'absent'})).toMatchObject({showSharedPolicy:false,showLegacyFallback:true});
  });

  it('does not turn an RPC error or incomplete policy response into legacy fallback',async()=>{
    const rpc=vi.fn(async()=>({data:{global:policies.global},error:null}));
    const repository=new SupabaseCatalogRepository({rpc} as never);
    const result=await repository.loadRoutePoliciesBySlug('legacy-route','zh-CN');
    expect(result).toEqual({status:'error'});
    expect(routePolicyDisplay(result)).toMatchObject({showRetry:true,showLegacyFallback:false});
  });

  it('keeps route-specific fields and the historical order snapshot path intact',()=>{
    const app=readFileSync(resolve(process.cwd(),'src/app/App.tsx'),'utf8');
    expect(app).toContain("localizedList('included',trip.included)");
    expect(app).toContain("localizedList('excluded',trip.excluded)");
    expect(app).toContain("localizedList('preparation'");
    expect(app).toContain('routeReminders');
    expect(app).toContain('预订时适用的行程说明与规则');
    expect(app).toContain('billing.agreementSnapshot');
  });
});
