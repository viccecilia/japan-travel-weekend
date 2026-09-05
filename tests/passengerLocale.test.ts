import {describe,expect,it} from 'vitest';
import {normalizePassengerLocale,passengerCoreCopy,passengerHomeCopy,passengerLocales} from '../src/shared/i18n/passengerLocale';

describe('游客端七语界面',()=>{
  it('完整列出七种游客语言',()=>{
    expect(passengerLocales.map(item=>item.code)).toEqual(['zh-CN','zh-TW','ja','en','vi','ne','ko']);
  });
  it('识别韩语与繁体中文系统语言',()=>{
    expect(normalizePassengerLocale('ko-KR')).toBe('ko');
    expect(normalizePassengerLocale('zh-Hant-HK')).toBe('zh-TW');
  });
  it('每种语言都有核心和首页文案',()=>{
    for(const {code} of passengerLocales){
      expect(passengerCoreCopy[code].steps).toHaveLength(4);
      expect(passengerHomeCopy[code].greeting.trim().length).toBeGreaterThan(0);
      expect(passengerHomeCopy[code].choose.trim().length).toBeGreaterThan(0);
    }
  });
});
