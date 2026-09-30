import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');

describe('V8-S.1 build observability and safe PWA update',()=>{
  it('keeps API routes outside navigation fallback',()=>{
    const config=read('vite.config.ts');
    expect(config).toContain("registerType:'prompt'");
    expect(config).toContain('skipWaiting:true');
    expect(config).toContain('clientsClaim:true');
    expect(config).toContain("/^\\/api(?:\\/|$)/");
    expect(config).toContain("/^\\/api-test(?:\\/|$)/");
  });
  it('activates a detected worker update once without an hour-long wait',()=>{
    const main=read('src/main.tsx');
    expect(main).toContain('onNeedRefresh');
    expect(main).toContain('activateServiceWorkerUpdate(updateSW,__JTW_BUILD_SHA__)');
    expect(main).toContain('if(activateServiceWorkerUpdate(updateSW,__JTW_BUILD_SHA__))return;');
    expect(main).toContain('当前页面版本 ${__JTW_BUILD_SHA__');
    expect(read('src/shared/pwaUpdate.ts')).toContain('jtw-pwa-update-requested:');
  });
  it('checks the service worker again after focus, network recovery and elapsed time',()=>{
    const main=read('src/main.tsx');
    const checks=read('src/shared/pwaUpdate.ts');
    expect(main).toContain('installServiceWorkerUpdateChecks(registration)');
    expect(checks).toContain("addEventListener('focus',check)");
    expect(checks).toContain("addEventListener('online',check)");
    expect(checks).toContain("addEventListener('visibilitychange',onVisible)");
    expect(checks).toContain('window.setInterval(check,intervalMs)');
    expect(checks).toContain('check();');
  });
  it('reports frontend and API versions',()=>{
    expect(read('src/app/operations/SystemSettings.tsx')).toContain('前端版本');
    expect(read('server/runtime.ts')).toContain("JTW_RELEASE_SHA");
  });
});
