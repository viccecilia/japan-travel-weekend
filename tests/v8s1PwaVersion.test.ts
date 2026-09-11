import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');

describe('V8-S.1 build observability and safe PWA update',()=>{
  it('keeps API routes outside navigation fallback',()=>{
    const config=read('vite.config.ts');
    expect(config).toContain("registerType:'prompt'");
    expect(config).toContain('skipWaiting:false');
    expect(config).toContain('clientsClaim:false');
    expect(config).toContain("/^\\/api(?:\\/|$)/");
    expect(config).toContain("/^\\/api-test(?:\\/|$)/");
  });
  it('does not reload when a worker changes without operator confirmation',()=>{
    const main=read('src/main.tsx');
    expect(main).toContain('onNeedRefresh');
    expect(main).toContain('现在更新');
    expect(main).toContain('稍后');
    expect(main).not.toContain('目标版本 ${__JTW_BUILD_SHA__');
    expect(main).toContain('当前页面版本 ${__JTW_BUILD_SHA__');
    expect(main).toContain("entry.textContent='有可用更新'");
    expect(main).not.toContain("addEventListener('controllerchange'");
  });
  it('checks the service worker again after focus, network recovery and elapsed time',()=>{
    const main=read('src/main.tsx');
    const checks=read('src/shared/pwaUpdate.ts');
    expect(main).toContain('installServiceWorkerUpdateChecks(registration)');
    expect(checks).toContain("addEventListener('focus',check)");
    expect(checks).toContain("addEventListener('online',check)");
    expect(checks).toContain("addEventListener('visibilitychange',onVisible)");
    expect(checks).toContain('window.setInterval(check,intervalMs)');
  });
  it('reports frontend and API versions',()=>{
    expect(read('src/app/operations/SystemSettings.tsx')).toContain('前端版本');
    expect(read('server/runtime.ts')).toContain("JTW_RELEASE_SHA");
  });
});
