import {describe,expect,it} from 'vitest';
import {getTravelMomentReasonPresentation} from '../src/shared/travelMomentPresentation';

describe('Travel Moment traveler presentation',()=>{
  it('maps repair reasons to friendly labels and precise same-submission actions',()=>{
    expect(getTravelMomentReasonPresentation('ACCOUNT_MISMATCH','zh-CN')).toMatchObject({title:'账号信息需要确认',action:'edit_account'});
    expect(getTravelMomentReasonPresentation('TRIP_MISMATCH','zh-CN')).toMatchObject({title:'行程对应关系需要调整',action:'edit_trip'});
    expect(getTravelMomentReasonPresentation('INVALID_URL','zh-CN')).toMatchObject({title:'帖子链接好像不正确',action:'edit_url'});
  });
  it('never exposes the raw reason code as its traveler-facing title',()=>{
    const value=getTravelMomentReasonPresentation('MISSING_OFFICIAL_MENTION','zh-CN');
    expect(value.title).toBe('还差一步即可参加');
    expect(value.title).not.toContain('MISSING_OFFICIAL_MENTION');
  });
});
