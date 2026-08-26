import {describe,expect,it} from 'vitest';
import {applyProbeResult,initialMonitorState} from '../server/monitoring';

describe('测试 API 监控状态机',()=>{
  it('连续三次失败只打开一次事件',()=>{const one=applyProbeResult(initialMonitorState,false);const two=applyProbeResult(one.state,false);const three=applyProbeResult(two.state,false);const four=applyProbeResult(three.state,false);expect([one.event,two.event,three.event,four.event]).toEqual(['none','none','alert','none']);expect(four.state.incidentOpen).toBe(true)});
  it('事件打开后首次恢复产生恢复通知并清零',()=>{const open={consecutiveFailures:3,incidentOpen:true};expect(applyProbeResult(open,true)).toEqual({state:initialMonitorState,event:'recovery'});expect(applyProbeResult(initialMonitorState,true).event).toBe('none')});
});
