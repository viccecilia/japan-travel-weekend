import {describe,expect,it} from 'vitest';
import {tokyoDay,tokyoWeekBounds} from '../src/app/staffTaskSelection';

describe('Asia/Tokyo natural week',()=>{
  it.each([
    ['Sunday','2026-12-27T14:59:59Z','2026-12-21','2026-12-28'],
    ['Monday','2026-12-27T15:00:00Z','2026-12-28','2027-01-04'],
    ['year boundary','2027-01-01T03:00:00Z','2026-12-28','2027-01-04'],
    ['month boundary','2026-08-31T03:00:00Z','2026-08-31','2026-09-07'],
  ])('%s uses Monday through Sunday',(_label,input,start,end)=>{
    const bounds=tokyoWeekBounds(new Date(input));
    expect(tokyoDay(bounds.start)).toBe(start);
    expect(tokyoDay(bounds.end)).toBe(end);
  });
});
