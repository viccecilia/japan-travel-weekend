import {Readable} from 'node:stream';
import {describe,expect,it} from 'vitest';
import {apiSecurityHeaders,FixedWindowRateLimiter,parseTrustedProxyAddresses,readRequestBody,requestRateKey,requestSourceAddress,RequestBodyTooLargeError} from '../server/security';
import type {IncomingMessage} from 'node:http';

describe('测试 API 安全护栏',()=>{
  it('统一响应头禁止嗅探、嵌入和浏览器权限',()=>{expect(apiSecurityHeaders['x-content-type-options']).toBe('nosniff');expect(apiSecurityHeaders['x-frame-options']).toBe('DENY');expect(apiSecurityHeaders['content-security-policy']).toContain("frame-ancestors 'none'");expect(apiSecurityHeaders['permissions-policy']).toContain('geolocation=()')});
  it('固定窗口达到上限后返回明确重试秒数并在下一窗口恢复',()=>{const limiter=new FixedWindowRateLimiter(2,1_000);expect(limiter.take('account',0).allowed).toBe(true);expect(limiter.take('account',100).allowed).toBe(true);expect(limiter.take('account',200)).toEqual({allowed:false,retryAfterSeconds:1});expect(limiter.take('account',1_000).allowed).toBe(true)});
  it('只接受可信反向代理追加的客户端地址并忽略 Authorization 文本',()=>{
    const request=(remoteAddress:string,forwarded?:string,authorization?:string)=>({headers:{'x-forwarded-for':forwarded,authorization},socket:{remoteAddress}}) as unknown as IncomingMessage;
    const trusted=parseTrustedProxyAddresses('127.0.0.1,::1');
    expect(requestSourceAddress(request('203.0.113.5','198.51.100.9'),trusted)).toBe('203.0.113.5');
    expect(requestSourceAddress(request('127.0.0.1','198.51.100.7, 203.0.113.8'),trusted)).toBe('203.0.113.8');
    expect(requestRateKey(request('127.0.0.1','203.0.113.8','Bearer one'),null,trusted)).toBe(requestRateKey(request('127.0.0.1','203.0.113.8','Bearer two'),null,trusted));
    expect(requestRateKey(request('127.0.0.1','203.0.113.8'), 'account-a',trusted)).not.toBe(requestRateKey(request('127.0.0.1','203.0.113.8'), 'account-b',trusted));
  });
  it('bounds memory and reclaims expired keys',()=>{const limiter=new FixedWindowRateLimiter(1,10,2);limiter.take('a',0);limiter.take('b',0);limiter.take('c',20);expect(limiter.size).toBeLessThanOrEqual(2);expect(limiter.take('a',20).allowed).toBe(true)});
  it('请求体同时检查声明长度和实际流长度',async()=>{const declared=Readable.from(['ok']) as never;Object.assign(declared,{headers:{'content-length':'20'}});await expect(readRequestBody(declared,10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);const streamed=Readable.from(['123456','789']) as never;Object.assign(streamed,{headers:{}});await expect(readRequestBody(streamed,8)).rejects.toBeInstanceOf(RequestBodyTooLargeError)});
});
