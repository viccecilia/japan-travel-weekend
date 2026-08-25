import {readFileSync} from 'node:fs';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it,vi} from 'vitest';
import {SupabaseRealtimeAdapter} from '../src/shared/integrations/supabaseClient';
import {SupabaseTripRoomRepository} from '../src/shared/integrations/supabaseProduction';
import {notificationTemplates} from '../src/shared/capabilities/notifications';
import {attendanceSummary,contactEscalationAvailable,passengerMaySet,staffMaySet} from '../src/shared/services/attendance';

const migration=readFileSync('supabase/migrations/202608250019_persistent_chat_attendance.sql','utf8');
const acceptance=readFileSync('supabase/verification/persistent_chat_attendance_acceptance.sql','utf8');

describe('持续聊天、签到与联系升级',()=>{
  it('禁止客户端 Broadcast 发送，消息每次通过数据库检查 open 状态',()=>{
    expect(migration).toContain('drop policy if exists vehicle_group_private_send');
    expect(migration).toContain("tr.status='open'");
    expect(migration).toContain('revoke insert on public.trip_room_messages from authenticated');
    expect(migration).toContain('message idempotency mismatch');
    expect(acceptance).toContain('FAIL direct broadcast send policy remains');
  });
  it('签到按乘客持久化、工作人员最小可见且联系表不保存电话',()=>{
    for(const value of ['passenger_checkins','passenger_checkin_events','passenger_contact_actions','get_vehicle_group_attendance','set_own_passenger_checkin','set_staff_passenger_checkin'])expect(migration).toContain(value);
    expect(migration).toContain('passenger_checkins_owner_staff_ops');
    expect(migration).toContain('contact escalation not yet available');
    expect(migration).not.toMatch(/phone|email|whatsapp|line_id/i);
  });
  it('签到阈值集中配置并发布三类持久变更',()=>{
    for(const value of ['confirm_departure_minutes','arrival_checkin_minutes','first_reminder_minutes_before','staff_contact_minutes_after'])expect(migration).toContain(value);
    for(const table of ['trip_room_messages','trip_rooms','passenger_checkins'])expect(migration).toContain(`tablename='${table}'`);
  });
  it('浏览器发送只调用受控 RPC，不直接写消息表',async()=>{
    const rpc=vi.fn(async()=>({data:'message-id',error:null}));
    const repository=new SupabaseTripRoomRepository({rpc} as unknown as SupabaseClient);
    expect(await repository.sendMessage('room-1','你好','message-key-1')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('send_trip_room_message',{p_room:'room-1',p_content:'你好',p_idempotency_key:'message-key-1'});
  });
  it('实时适配器订阅数据库消息、房间状态和签到，不再提供 send',async()=>{
    const handlers:Array<{event:string;table:string}>=[];
    const channel={on:vi.fn((event:string,filter:{table:string})=>{handlers.push({event,table:filter.table});return channel}),subscribe:vi.fn((callback:(status:string)=>void)=>{callback('SUBSCRIBED');return channel})};
    const client={channel:vi.fn(()=>channel),removeChannel:vi.fn()} as unknown as SupabaseClient;
    const result=await new SupabaseRealtimeAdapter(client).subscribeTripRoom('room-1',vi.fn(),vi.fn(),vi.fn());
    expect(result.subscribed).toBe(true);
    expect(handlers).toEqual(expect.arrayContaining([{event:'postgres_changes',table:'trip_room_messages'},{event:'postgres_changes',table:'trip_rooms'},{event:'postgres_changes',table:'passenger_checkins'}]));
    expect(result).not.toHaveProperty('send');
  });
  it('通知合同包含签到提醒与联系升级',()=>{
    expect(notificationTemplates['checkin-reminder'].title).toBe('请确认集合签到状态');
    expect(notificationTemplates['passenger-contact-escalation'].title).toBe('有乘客尚未签到，请安排联系');
  });
  it('只有逐乘客均到达或登车才显示全员到齐',()=>{
    expect(attendanceSummary([])).toEqual({arrived:0,total:0,allPresent:false});
    expect(attendanceSummary(['at_meeting_point','pending'])).toEqual({arrived:1,total:2,allPresent:false});
    expect(attendanceSummary(['at_meeting_point','boarded'])).toEqual({arrived:2,total:2,allPresent:true});
  });
  it('联系升级遵守集中等待时间且角色不能越权改状态',()=>{
    const departure='2026-08-25T01:00:00.000Z';
    expect(contactEscalationAvailable(departure,5,new Date('2026-08-25T01:04:59.000Z'))).toBe(false);
    expect(contactEscalationAvailable(departure,5,new Date('2026-08-25T01:05:00.000Z'))).toBe(true);
    expect(passengerMaySet('boarded')).toBe(false);
    expect(staffMaySet('boarded')).toBe(true);
    expect(staffMaySet('no_show_confirmed')).toBe(false);
  });
});
