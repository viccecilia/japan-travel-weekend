import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const server=readFileSync(join(process.cwd(),'deploy/nginx/weekend-test.conf'),'utf8');
const common=readFileSync(join(process.cwd(),'deploy/nginx/weekend-test-common.conf'),'utf8');
const releaseBuilder=readFileSync(join(process.cwd(),'deploy/scripts/build-test-closure-release.ps1'),'utf8');
const config=`${server}\n${common}`;

describe('手机验收测试前端部署边界',()=>{
  it('只使用测试子域和独立静态目录',()=>{expect(config).toContain('server_name weekend.japan-travel.info;');expect(config).toContain('root /var/www/japan-travel-weekend-test;');expect(config).not.toMatch(/server_name\s+(www\.)?japan-travel\.info;/)});
  it('保持 noindex、安全响应头和 SPA fallback',()=>{expect(config).toContain('X-Robots-Tag "noindex, nofollow" always');expect(config).toContain('X-Content-Type-Options "nosniff" always');expect(config).toContain("frame-ancestors 'none'");expect(config).toContain('try_files $uri $uri/ /index.html;')});
  it('同源测试 API 只代理到本机测试端口',()=>{expect(config).toContain('location /api-test/');expect(config).toContain('proxy_pass http://127.0.0.1:18773/;')});
  it('公网路径在 Test 仍代理到隔离的 Test API 而不是 Live 或 SPA',()=>{expect(config).toContain('location /api/');expect(config).toContain('proxy_pass http://127.0.0.1:18773/;');expect(config).not.toContain('proxy_pass http://127.0.0.1:18774/;')});
  it('CSP 覆盖 Stripe.js 官方必要来源',()=>{for(const source of ['https://js.stripe.com','https://*.js.stripe.com','https://api.stripe.com','https://hooks.stripe.com','https://maps.googleapis.com'])expect(config).toContain(source)});
  it('CSP 允许 Google Maps JavaScript API 的脚本、瓦片、静态资源、字体与 worker',()=>{for(const source of ['https://maps.googleapis.com','https://mapsresources-pa.googleapis.com','https://maps.gstatic.com','https://fonts.googleapis.com','https://fonts.gstatic.com',"worker-src 'self' blob:"])expect(config).toContain(source)});
  it('Test Artifact 构建时强制校验公开服务指纹',()=>{
    for(const expected of [
      '[Parameter(Mandatory = $true)][string]$PublicConfigPath',
      "VITE_API_BASE_URL=/api-test",
      'hzxoofvodpqpdomtmzlf.supabase.co',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'VITE_STRIPE_MODE',
      'VITE_LIVE_PAYMENTS_ENABLED',
      'PUBLIC_BUILD_FINGERPRINT.txt',
    ])expect(releaseBuilder).toContain(expected);
  });
});
