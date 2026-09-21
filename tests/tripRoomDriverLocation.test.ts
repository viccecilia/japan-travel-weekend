import {describe,expect,it,vi} from 'vitest';
import {SupabaseTripRoomRepository} from '../src/shared/integrations/supabaseProduction';
describe('trip room driver location uses the current authorized session API',()=>{
 it('creates a bounded session then persists the real coordinate sample',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:{sessionId:'session-id'},error:null}).mockResolvedValueOnce({data:1,error:null});
  const repo=new SupabaseTripRoomRepository({rpc} as never);
  expect(await repo.publishDriverLocation('group',{latitude:34.7,longitude:135.5,accuracy:8},15)).toBe(true);
  expect(rpc).toHaveBeenNthCalledWith(1,'start_driver_location_session_v2',{p_vehicle_group:'group',p_minutes:15});
  expect(rpc).toHaveBeenNthCalledWith(2,'append_driver_location_point',expect.objectContaining({p_session:'session-id',p_latitude:34.7,p_longitude:135.5,p_sequence:1}));
 });
 it('never submits coordinates if session permission is denied',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:null,error:{message:'denied'}});
  expect(await new SupabaseTripRoomRepository({rpc} as never).publishDriverLocation('group',{latitude:34.7,longitude:135.5,accuracy:8})).toBe(false);
  expect(rpc).toHaveBeenCalledTimes(1);
 });
 it('does not report success when coordinate persistence fails',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:{sessionId:'session'},error:null}).mockResolvedValueOnce({data:null,error:{message:'closed'}});
  expect(await new SupabaseTripRoomRepository({rpc} as never).publishDriverLocation('group',{latitude:34.7,longitude:135.5,accuracy:8})).toBe(false);
 });
});
