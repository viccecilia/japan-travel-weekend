import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=readFileSync('src/app/StaffPortal.tsx','utf8');

describe('V8 司导固定推广链接',()=>{
  it('二维码和复制地址统一使用真实注册入口',()=>{
    expect(source).toContain('/app/create-account?ref=');
    expect(source).not.toContain('/app/register?ref=');
  });
});
