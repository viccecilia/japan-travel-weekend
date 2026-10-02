import {describe,expect,it} from 'vitest';
import {growthCopy} from '../src/app/growthCopy';

describe('passenger fixed copy',()=>{
  it('uses the current locale for account-growth labels rather than the English fallback',()=>{
    expect(growthCopy.vi).toMatchObject({ambassador:'Đại sứ',momentsTitle:'Chia sẻ chuyến đi Nhật Bản'});
    expect(growthCopy.ja).toMatchObject({ambassador:'アンバサダー',momentsTitle:'日本旅行をシェア'});
    expect(growthCopy.ko).toMatchObject({ambassador:'앰배서더'});
  });

  it('keeps every supported locale wired to the same growth-copy shape',()=>{
    for(const locale of ['zh-CN','ja','en','ko','vi','ne','es'] as const){
      expect(growthCopy[locale].ambassador).not.toBe('');
      expect(growthCopy[locale].momentsEntryTitle).not.toBe('');
      expect(growthCopy[locale].save).not.toBe('');
    }
  });
});
