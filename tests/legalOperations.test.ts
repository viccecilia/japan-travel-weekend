import {describe,expect,it} from 'vitest';
import {cancellationPolicy,operatorProfile} from '../src/shared/config/legalOperations';

describe('法律与运营集中配置',()=>{
  it('取消窗口无重叠并明确日本时间',()=>{
    expect(cancellationPolicy.timeZone).toBe('Asia/Tokyo');
    expect(cancellationPolicy.tiers.map(t=>t.refundPercent)).toEqual([100,50,0]);
    expect(cancellationPolicy.summary).toContain('第3天17:00');
  });
  it('只公开官网已核对的公司与运输许可信息',()=>{
    expect(operatorProfile.legalNameJa).toBe('株式会社大寅');
    expect(operatorProfile.licences).toContain('一般乗用旅客自動車運送事業 近運自ニ第990号');
    expect(operatorProfile.licences.join(' ')).toContain('第二種旅行业登记名称与编号待许可证原文确认');
  });
});
