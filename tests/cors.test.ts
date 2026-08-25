import {describe,expect,it} from 'vitest';
import {allowedCorsOrigin,parseAllowedOrigins} from '../server/cors';

describe('测试 API CORS 精确白名单',()=>{
  it('支持多个明确来源并去重',()=>expect(parseAllowedOrigins('https://weekend.japan-travel.info, http://127.0.0.1:4173,https://weekend.japan-travel.info')).toEqual(['https://weekend.japan-travel.info','http://127.0.0.1:4173']));
  it('拒绝带路径、非 HTTP 协议和近似域名',()=>{expect(parseAllowedOrigins('https://example.test/path,javascript:alert(1),invalid')).toEqual([]);expect(allowedCorsOrigin('https://weekend.japan-travel.info.evil.test',['https://weekend.japan-travel.info'])).toBeNull()});
  it('只回显白名单中的请求来源',()=>{const allowed=['https://weekend.japan-travel.info','http://127.0.0.1:4173'];expect(allowedCorsOrigin('http://127.0.0.1:4173',allowed)).toBe('http://127.0.0.1:4173');expect(allowedCorsOrigin(undefined,allowed)).toBeNull()});
});
