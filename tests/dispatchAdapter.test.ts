import {describe,expect,it,vi} from 'vitest';
import {MemoryDispatchProvider,UnavailableDispatchProvider,YuzuDispatchHttpAdapter,type DispatchTaskRequest} from '../server/dispatch';

const task:DispatchTaskRequest={taskId:'task-1',vehicleAssignmentId:'vehicle-1',driverExternalId:'driver-7',vehicleType:'coaster-20',startsAt:'2026-09-01T00:00:00Z',endsAt:'2026-09-01T10:00:00Z',meetingName:'大阪集合点',meetingAddress:'已确认地址',meetingLatitude:34.6,meetingLongitude:135.5,passengerCount:20,operationalNotes:['儿童座椅 1 个，已确认'],idempotencyKey:'idem-1'};
describe('柚子调度适配器',()=>{
  it('未配置时失败关闭且不伪装发送',async()=>expect(await new UnavailableDispatchProvider().createTask()).toMatchObject({accepted:false,status:'failed'}));
  it('模拟接口支持幂等创建、读取和取消',async()=>{const provider=new MemoryDispatchProvider();const first=await provider.createTask(task);const repeated=await provider.createTask(task);expect(repeated).toEqual(first);expect((await provider.getTask(first.externalTaskId!)).status).toBe('sent');expect((await provider.cancelTask(first.externalTaskId!,'cancel-1')).status).toBe('cancelled')});
  it('真实适配器只向 HTTPS 端点发送必要履约字段和幂等键',async()=>{const transport=vi.fn(async(_url:URL|RequestInfo,_init?:RequestInit)=>new Response(JSON.stringify({taskId:'yz-1',status:'accepted'}),{status:200}));const provider=new YuzuDispatchHttpAdapter('https://dispatch.example.invalid','test-token',transport as typeof fetch);expect((await provider.createTask(task)).externalTaskId).toBe('yz-1');const init=transport.mock.calls[0][1] as RequestInit;expect(init.headers).toMatchObject({'idempotency-key':'idem-1'});expect(init.body).not.toContain('email');expect(init.body).not.toContain('phone')});
  it('拒绝非 HTTPS 或缺少令牌的配置',()=>{expect(new YuzuDispatchHttpAdapter('http://dispatch.example.invalid','token').available).toBe(false);expect(new YuzuDispatchHttpAdapter('https://dispatch.example.invalid','').available).toBe(false)});
});
