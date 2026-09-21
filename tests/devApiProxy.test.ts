import {describe,expect,it} from 'vitest';
import {testApiProxy} from '../scripts/dev-api-proxy';

describe('local API aliases preserve the test-only upstream',()=>{
  const proxies=testApiProxy();
  for(const prefix of ['/api','/api-test']){
    it(prefix+' routes readiness and business requests without SPA fallback',()=>{
      const match=Object.entries(proxies).filter(([pattern])=>new RegExp(pattern).test(prefix+'/ready'));
      expect(match).toHaveLength(1);
      const proxy=match[0][1];
      expect(proxy.target).toBe('https://api-test.japan-travel.info');
      expect(proxy.rewrite?.(prefix+'/ready')).toBe('/ready');
      expect(proxy.rewrite?.(prefix+'/v1/checkout')).toBe('/v1/checkout');
      expect(proxy.rewrite?.(prefix+'/v1/orders?id=test')).toBe('/v1/orders?id=test');
    });
  }
  it('does not proxy similarly named frontend routes',()=>{
    for(const path of ['/apiary','/api-testing','/app','/app/orders'])
      expect(Object.keys(proxies).some(pattern=>new RegExp(pattern).test(path))).toBe(false);
  });
});
