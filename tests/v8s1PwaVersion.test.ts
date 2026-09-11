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
    expect(main).not.toContain("addEventListener('controllerchange'");
  });
  it('reports frontend and API versions',()=>{
    expect(read('src/app/operations/SystemSettings.tsx')).toContain('前端版本');
    expect(read('server/runtime.ts')).toContain("JTW_RELEASE_SHA");
  });
});
