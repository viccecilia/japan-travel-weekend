import {describe,expect,it} from 'vitest';
import {intervalsOverlap,leaveCoverageForDay,taskLeaveConflict} from '../src/app/staffLeave';

const leave=(starts_at:string,ends_at:string,status='approved')=>({starts_at,ends_at,status});

describe('staff leave overlap',()=>{
  it('uses half-open intervals so touching boundaries do not overlap',()=>{
    expect(intervalsOverlap('2026-10-12T00:00:00Z','2026-10-12T01:00:00Z','2026-10-12T01:00:00Z','2026-10-12T02:00:00Z')).toBe(false);
  });
  it('distinguishes partial and full Tokyo-day leave',()=>{
    expect(leaveCoverageForDay('2026-10-12',[leave('2026-10-12T00:00:00+09:00','2026-10-12T12:00:00+09:00')])).toBe('partial');
    expect(leaveCoverageForDay('2026-10-12',[leave('2026-10-11T23:00:00+09:00','2026-10-13T00:00:00+09:00')])).toBe('full');
  });
  it('merges adjacent approved ranges into full-day coverage',()=>{
    expect(leaveCoverageForDay('2026-10-12',[
      leave('2026-10-12T00:00:00+09:00','2026-10-12T12:00:00+09:00'),
      leave('2026-10-12T12:00:00+09:00','2026-10-13T00:00:00+09:00'),
    ])).toBe('full');
  });
  it('finds morning/afternoon and cross-day task conflicts without false adjacent conflicts',()=>{
    const afternoon=[leave('2026-10-12T13:00:00+09:00','2026-10-12T18:00:00+09:00')];
    expect(taskLeaveConflict('2026-10-12T08:00:00+09:00','2026-10-12T12:00:00+09:00',afternoon)).toBe('none');
    expect(taskLeaveConflict('2026-10-12T12:00:00+09:00','2026-10-12T14:00:00+09:00',afternoon)).toBe('conflict');
    expect(taskLeaveConflict('2026-10-12T18:00:00+09:00','2026-10-13T01:00:00+09:00',afternoon)).toBe('none');
  });
  it('does not guess when a potentially conflicting task end is missing',()=>{
    expect(taskLeaveConflict('2026-10-12T08:00:00+09:00',null,[leave('2026-10-12T13:00:00+09:00','2026-10-12T18:00:00+09:00')])).toBe('unknown');
  });
  it('ignores pending, rejected and cancelled leave',()=>{
    for(const status of ['pending','rejected','cancelled']){
      expect(leaveCoverageForDay('2026-10-12',[leave('2026-10-12T00:00:00+09:00','2026-10-13T00:00:00+09:00',status)])).toBe('none');
    }
  });
});
