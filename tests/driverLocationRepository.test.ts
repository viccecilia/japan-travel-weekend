import {describe,expect,it,vi} from 'vitest';import type {SupabaseClient} from '@supabase/supabase-js';import {SupabaseTripRoomRepository} from '../src/shared/integrations/supabaseProduction';
describe('司机位置浏览器仓库',()=>{
  it('发布只向已授权短时会话写入坐标、精度和车辆群',async()=>{
    const rpc=vi.fn().mockResolvedValueOnce({data:{sessionId:'session'},error:null}).mockResolvedValueOnce({data:1,error:null});
    const repo=new SupabaseTripRoomRepository({rpc} as unknown as SupabaseClient);
    expect(await repo.publishDriverLocation('group-1',{latitude:34.6937,longitude:135.5023,accuracy:12},15)).toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(1,'start_driver_location_session_v2',{p_vehicle_group:'group-1',p_minutes:15});
    expect(rpc).toHaveBeenNthCalledWith(2,'append_driver_location_point',{p_vehicle_group:'group-1',p_session:'session',p_latitude:34.6937,p_longitude:135.5023,p_accuracy_meters:12,p_sampled_at:expect.any(String),p_sequence:1});
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('读取和停止由数据库权限函数终审，错误时 fail closed',async()=>{const maybeSingle=vi.fn(async()=>({data:{latitude:34.6,longitude:135.5},error:null}));const rpc=vi.fn((name:string)=>name==='get_active_driver_location'?{maybeSingle}:Promise.resolve({data:0,error:{message:'denied'}}));const repo=new SupabaseTripRoomRepository({rpc} as unknown as SupabaseClient);expect(await repo.loadDriverLocation('group-1')).toMatchObject({latitude:34.6});expect(await repo.stopDriverLocation('group-1')).toBe(false);expect(rpc).toHaveBeenCalledWith('get_active_driver_location',{p_vehicle_group:'group-1'});expect(rpc).toHaveBeenCalledWith('stop_driver_location',{p_vehicle_group:'group-1'})});
});
