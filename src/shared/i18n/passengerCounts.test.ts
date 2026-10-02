import {describe,expect,it} from 'vitest';
import {passengerAdultCount,passengerSeatCount} from './passengerCounts';

describe('passenger count presentation',()=>{
  it('uses English singular and plural forms',()=>{
    expect(passengerAdultCount('en',1)).toBe('1 adult');
    expect(passengerAdultCount('en',2)).toBe('2 adults');
    expect(passengerSeatCount('en',1)).toBe('1 seat');
    expect(passengerSeatCount('en',2)).toBe('2 seats');
  });
  it('keeps Vietnamese count labels locale-native',()=>expect(passengerSeatCount('vi',2)).toBe('2 ghế'));
});
