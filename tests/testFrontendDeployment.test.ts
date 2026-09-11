import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const server=readFileSync(join(process.cwd(),'deploy/nginx/weekend-test.conf'),'utf8');
const common=readFileSync(join(process.cwd(),'deploy/nginx/weekend-test-common.conf'),'utf8');
const config=`${server}\n${common}`;

describe('手机验收测试前端部署边界',()=>{
  it('只使用测试子域和独立静态目录',()=>{expect(config).toContain('server_name weekend.japan-travel.info;');expect(config).toContain('root /var/www/japan-travel-weekend-test;');expect(config).not.toMatch(/server_name\s+(www\.)?japan-travel\.info;/)});
  it('保持 noindex、安全响应头和 SPA fallback',()=>{expect(config).toContain('X-Robots-Tag "noindex, nofollow" always');expect(config).toContain('X-Content-Type-Options "nosniff" always');expect(config).toContain("frame-ancestors 'none'");expect(config).toContain('try_files $uri $uri/ /index.html;')});
  it('同源测试 API 只代理到本机测试端口',()=>{expect(config).toContain('location /api-test/');expect(config).toContain('proxy_pass http://127.0.0.1:18773/;')});
  it('公网 API 代理到活动服务而不是落入 SPA 页面',()=>{expect(config).toContain('location /api/');expect(config).toContain('proxy_pass http://127.0.0.1:18774/;')});
  it('CSP 覆盖 Stripe.js 官方必要来源',()=>{for(const source of ['https://js.stripe.com','https://*.js.stripe.com','https://api.stripe.com','https://hooks.stripe.com','https://maps.googleapis.com'])expect(config).toContain(source)});
});
