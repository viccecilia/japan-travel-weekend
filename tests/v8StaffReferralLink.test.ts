import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=readFileSync('src/app/StaffPortal.tsx','utf8');

describe('V8 司导固定推广链接',()=>{
  it('二维码和复制地址统一使用真实注册入口',()=>{
    expect(source).toContain('/app/create-account?ref=');
    expect(source).not.toContain('/app/register?ref=');
  });
  it('我的资料留在司导权限边界并支持真实保存与二维码下载',()=>{
    expect(source).not.toContain('to="/app/profile"');
    expect(source).toContain('updateOwnDisplayName');
    expect(source).toContain('download="jtw-referral-qr.png"');
    expect(source).toContain('复制失败，请长按链接手动复制');
  });
});
