import {describe,expect,it} from 'vitest';
import {formatPassengerDepartureDate,normalizePassengerLocale,passengerCoreCopy,passengerHomeCopy,passengerIntlLocale,passengerLocales} from '../src/shared/i18n/passengerLocale';

describe('游客端八语界面',()=>{
  it('完整列出八种游客语言',()=>{
    expect(passengerLocales.map(item=>item.code)).toEqual(['zh-CN','zh-TW','ja','en','vi','ne','ko','es']);
  });
  it('识别韩语与繁体中文系统语言',()=>{
    expect(normalizePassengerLocale('ko-KR')).toBe('ko');
    expect(normalizePassengerLocale('zh-Hant-HK')).toBe('zh-TW');
    expect(normalizePassengerLocale('es-MX')).toBe('es');
  });
  it('使用明确地区标签格式化尼泊尔语日期，避免回退到当前界面语言',()=>{
    expect(passengerIntlLocale('ne')).toBe('ne-NP');
    expect(passengerIntlLocale('ja')).toBe('ja-JP');
    const departure=new Date('2026-10-19T23:30:00.000Z');
    expect(formatPassengerDepartureDate('ne',departure,'card')).toBe('अक्टोबर २०');
    expect(formatPassengerDepartureDate('ne',departure,'weekday')).toBe('मंगल');
    expect(formatPassengerDepartureDate('ne',departure,'summary')).toBe('२० अक्टोबर २०२६');
  });
  it('每种语言都有核心和首页文案',()=>{
    for(const {code} of passengerLocales){
      expect(passengerCoreCopy[code].steps).toHaveLength(4);
      expect(passengerHomeCopy[code].greeting.trim().length).toBeGreaterThan(0);
      expect(passengerHomeCopy[code].choose.trim().length).toBeGreaterThan(0);
    }
  });
});
