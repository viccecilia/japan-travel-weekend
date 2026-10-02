import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('Test Nginx isolation',()=>{
  it('proxies the Test frontend API only to the Test listener',()=>{
    const config=readFileSync('deploy/nginx/weekend-test-common.conf','utf8');
    expect(config).toContain('location /api/');
    expect(config).toContain('proxy_pass http://127.0.0.1:18773/;');
    expect(config).not.toContain('proxy_pass http://127.0.0.1:18774/;');
  });
});
