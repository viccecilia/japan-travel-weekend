import {describe,expect,it} from 'vitest';
import {applyMeetingChange,currentMeetingStop,meetingUrgency,type ItineraryStop} from '../src/shared/services/itineraryMeeting';
import {meetingMapEmbedUrl,walkingNavigationUrl} from '../src/shared/capabilities/meetingActions';

const stops:ItineraryStop[]=[
  {id:'done',name:'出发',meetingTime:'08:00',meetingPointName:'旧点',latitude:1,longitude:2,status:'completed'},
  {id:'current',name:'当前',arrivalTime:'10:30',meetingTime:'11:30',meetingPointName:'东侧',latitude:34.1,longitude:135.1,status:'current'},
  {id:'next',name:'下一站',meetingTime:'14:20',meetingPointName:'停车场',latitude:34.2,longitude:135.2,status:'upcoming'},
];

describe('动态集合点领域逻辑',()=>{
  it('按 changed、current、upcoming 顺序选择当前集合点',()=>{expect(currentMeetingStop(stops)?.id).toBe('current');expect(currentMeetingStop(stops.map(stop=>stop.id==='next'?{...stop,status:'changed' as const}:stop))?.id).toBe('next')});
  it('集合点变更后导航只使用新坐标',()=>{const changed=applyMeetingChange(stops,{stopId:'current',meetingPointName:'新集合点',latitude:35.5,longitude:136.6});const active=currentMeetingStop(changed)!;expect(active).toMatchObject({meetingPointName:'新集合点',latitude:35.5,longitude:136.6,status:'changed'});const url=walkingNavigationUrl({latitude:active.latitude,longitude:active.longitude});expect(url).toContain('35.5%2C136.6');expect(url).not.toContain('34.1')});
  it('配置浏览器密钥后使用正式 Maps Embed API',()=>{const url=meetingMapEmbedUrl({latitude:34.666944,longitude:135.506111},'restricted-key');expect(url).toContain('/maps/embed/v1/place');expect(url).toContain('key=restricted-key');expect(url).toContain('34.666944%2C135.506111')});
  it('进度条按剩余时间切换蓝橙红及迟到',()=>{expect(meetingUrgency(stops[1],new Date(2026,0,1,11,0)).tone).toBe('blue');expect(meetingUrgency(stops[1],new Date(2026,0,1,11,20)).tone).toBe('orange');expect(meetingUrgency(stops[1],new Date(2026,0,1,11,27)).tone).toBe('red');expect(meetingUrgency(stops[1],new Date(2026,0,1,11,31)).late).toBe(true)});
});
