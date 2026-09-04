import {describe,expect,it} from 'vitest';
import {getDepartureLifecycle,lifecycleStatus,MINIMUM_AUTOMATIC_DISPATCH_PASSENGERS} from '../src/shared/operations/departureLifecycle';

describe('班次截单与群聊开放规则',()=>{
  it('日本时间08:00班次提前24小时截单，并在前一天12:00开放聊天',()=>{
    const result=getDepartureLifecycle('2026-09-06T08:00:00+09:00',4);
    expect(result.bookingClosesAt).toBe('2026-09-04T23:00:00.000Z');
    expect(result.chatOpensAt).toBe('2026-09-05T03:00:00.000Z');
    expect(result.requiresManualReview).toBe(false);
  });
  it('不足4人只标记人工介入，不改变按座位销售规则',()=>{
    expect(MINIMUM_AUTOMATIC_DISPATCH_PASSENGERS).toBe(4);
    expect(getDepartureLifecycle('2026-09-06T08:00:00+09:00',3).requiresManualReview).toBe(true);
  });
  it('分别计算截单和聊天开放状态',()=>{
    const lifecycle=getDepartureLifecycle('2026-09-06T08:00:00+09:00',6);
    expect(lifecycleStatus('2026-09-05T10:00:00+09:00',lifecycle)).toEqual({salesClosed:true,chatOpen:false});
    expect(lifecycleStatus('2026-09-05T12:00:00+09:00',lifecycle)).toEqual({salesClosed:true,chatOpen:true});
  });
});
