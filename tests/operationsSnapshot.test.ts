import {describe,expect,it} from 'vitest';
import {summarizeDeparture} from '../src/shared/integrations/supabaseOperations';

describe('运营班次统计口径',()=>{
  it('只把已付款与已确认订单计入席位和日元成交额',()=>{
    const summary=summarizeDeparture({id:'dep-1',departs_at:'2026-09-05T00:00:00Z',capacity:20,status:'confirmed',meeting_name:'大阪站',trips:{title:'京都奈良一日游'},orders:[
      {id:'paid',seat_count:2,status:'paid',amount:20000,currency:'JPY'},
      {id:'confirmed',seat_count:3,status:'confirmed',amount:30000,currency:'JPY'},
      {id:'pending',seat_count:4,status:'pending_payment',amount:40000,currency:'JPY'},
      {id:'cancelled',seat_count:5,status:'cancelled',amount:50000,currency:'JPY'},
      {id:'usd',seat_count:1,status:'paid',amount:100,currency:'USD'},
    ]});
    expect(summary).toMatchObject({tripTitle:'京都奈良一日游',orderCount:5,bookedSeats:6,paidSeats:6,pendingOrders:1,grossAmountJpy:50000,loadFactor:30});
  });

  it('容量为零时装载率保持为零且支持关系数组',()=>{
    const summary=summarizeDeparture({id:'dep-2',departs_at:null,capacity:0,status:'draft',meeting_name:null,trips:[{title:'测试路线'}],orders:null});
    expect(summary.loadFactor).toBe(0);
    expect(summary.tripTitle).toBe('测试路线');
  });
});
