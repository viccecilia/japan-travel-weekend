import {Readable} from 'node:stream';
import {describe,expect,it} from 'vitest';
import {apiSecurityHeaders,FixedWindowRateLimiter,readRequestBody,RequestBodyTooLargeError} from '../server/security';

describe('测试 API 安全护栏',()=>{
  it('统一响应头禁止嗅探、嵌入和浏览器权限',()=>{expect(apiSecurityHeaders['x-content-type-options']).toBe('nosniff');expect(apiSecurityHeaders['x-frame-options']).toBe('DENY');expect(apiSecurityHeaders['content-security-policy']).toContain("frame-ancestors 'none'");expect(apiSecurityHeaders['permissions-policy']).toContain('geolocation=()')});
  it('固定窗口达到上限后返回明确重试秒数并在下一窗口恢复',()=>{const limiter=new FixedWindowRateLimiter(2,1_000);expect(limiter.take('account',0).allowed).toBe(true);expect(limiter.take('account',100).allowed).toBe(true);expect(limiter.take('account',200)).toEqual({allowed:false,retryAfterSeconds:1});expect(limiter.take('account',1_000).allowed).toBe(true)});
  it('请求体同时检查声明长度和实际流长度',async()=>{const declared=Readable.from(['ok']) as never;Object.assign(declared,{headers:{'content-length':'20'}});await expect(readRequestBody(declared,10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);const streamed=Readable.from(['123456','789']) as never;Object.assign(streamed,{headers:{}});await expect(readRequestBody(streamed,8)).rejects.toBeInstanceOf(RequestBodyTooLargeError)});
});
