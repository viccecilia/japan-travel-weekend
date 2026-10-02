import {describe,expect,it} from 'vitest';
import {localizedRouteTimeline,routeLocaleContent} from '../src/shared/routeLocalePresentation';
import type {Trip} from '../src/shared/types';

const trip={
  id:'route-1',slug:'route-1',title:'中文路线',shortTitle:'中文路线',summary:'中文摘要',description:'中文介绍',
  timeline:[{id:'sanzen-in',title:'大原三千院',detail:'旧中文景点说明',attractionId:'sanzen-in'},{id:'free-time',title:'岚山自由活动',detail:'旧中文活动说明'}],
  localizedContent:{'zh-CN':{title:'中文路线',itinerary:{'sanzen-in':{stop_title:'大原三千院'}}},ja:{title:'京都の日帰り旅',itinerary:{'sanzen-in':{stop_title:'三千院'}}}},
} as unknown as Trip;

describe('route locale presentation',()=>{
  it('never borrows Chinese route text for a foreign locale without an official translation',()=>{
    expect(routeLocaleContent(trip,'vi')).toEqual({});
    const timeline=localizedRouteTimeline(trip,'vi');
    expect(timeline[0].title).toBe('');
    expect(timeline[0].detail).toBe('');
  });

  it('keeps official localized route text and leaves linked attraction loading to the attraction library',()=>{
    const timeline=localizedRouteTimeline(trip,'ja');
    expect(timeline[0]).toMatchObject({title:'三千院',attractionId:'sanzen-in'});
    expect(timeline[1]).toMatchObject({title:'',detail:''});
  });

  it('retains source-language compatibility for an unresolved legacy route',()=>{
    expect(localizedRouteTimeline(trip,'zh-CN')[1]).toMatchObject({title:'岚山自由活动',detail:'旧中文活动说明'});
  });
});
