import type {ProxyOptions} from 'vite';

// Both local prefixes point only to the existing test API, never a live endpoint.
export function testApiProxy():Record<string,ProxyOptions>{
  const common={target:'https://api-test.japan-travel.info',changeOrigin:true,headers:{origin:'https://weekend.japan-travel.info'}};
  return {
    '^/api-test(?:/|$)':{...common,rewrite:path=>path.replace(/^\/api-test(?=\/|$)/,'')||'/'},
    '^/api(?:/|$)':{...common,rewrite:path=>path.replace(/^\/api(?=\/|$)/,'')||'/'},
  };
}
