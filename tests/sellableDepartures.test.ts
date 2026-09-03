import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {mapSellableDeparture,sellableDepartureIssues} from '../src/shared/integrations/supabaseProduction';
import {seatOrderTotal} from '../src/shared/services/pricing';

describe('可售班次投影',()=>{
  it('将服务端权威价格、余位和东京时间映射到购买流程',()=>{
    const departure=mapSellableDeparture({id:'departure-1',trip_slug:'kyoto-nara-classic',trip_title:'京都与奈良',departs_at:'2026-08-29T00:00:00Z',ends_at:'2026-08-29T10:00:00Z',sales_close_at:'2026-08-28T00:00:00Z',capacity:6,minimum_guests:2,available_seats:2,seat_price_jpy:100,currency:'JPY',tax_included:true,meeting_name:'日本桥',meeting_address:'大阪市中央区日本桥站',map_lat:34.6687,map_lng:135.5062},new Date('2026-08-25T00:00:00Z'));
    expect(departure).toMatchObject({id:'departure-1',tripSlug:'kyoto-nara-classic',weekend:'本周末',status:'余位较少',price:100,availableSeats:2,minimumGuests:2,currency:'JPY',taxIncluded:true,isSeed:false,mapStatus:'已连接',meetingAddress:'大阪市中央区日本桥站'});
    expect(departure.dateLabel).toContain('8月29日');
  });
  it('SQL 只公开已发布、开放且已定价班次，并扣除有效占位',()=>{
    const sql=readFileSync(join(process.cwd(),'supabase','migrations','202608250010_sellable_departures.sql'),'utf8');
    for(const clause of ["d.status='open'","t.status='published'","d.seat_price_jpy is not null","l.status='committed'","l.expires_at>now()","grant execute on function public.list_sellable_departures() to anon,authenticated,service_role","o.account_id=auth.uid()","grant execute on function public.get_own_order_fulfilment(uuid) to authenticated,service_role","revoke select on public.departures from anon,authenticated"]){expect(sql).toContain(clause)}
    const publicProjection=sql.split('revoke all on function public.list_sellable_departures()')[0];expect(publicProjection).not.toMatch(/meeting_name|meeting_address|map_lat|map_lng/);
  });
  it('多席订单按服务端每席价格计算展示总额',()=>{expect(seatOrderTotal(100,3)).toBe(300);expect(seatOrderTotal(null,3)).toBeNull();expect(seatOrderTotal(100,0)).toBeNull()});
  it('前端拒绝缺少返回时间、截止时间、含税价格或集合资料的异常投影',()=>{const base={id:'departure-1',trip_slug:'route',trip_title:'路线',departs_at:'2026-09-20T00:00:00Z',ends_at:'2026-09-20T10:00:00Z',sales_close_at:'2026-09-19T00:00:00Z',capacity:20,minimum_guests:6,available_seats:10,seat_price_jpy:8000,currency:'JPY' as const,tax_included:true,meeting_name:'日本桥',meeting_address:'大阪市中央区日本桥站2号出口',map_lat:34.6,map_lng:135.5};expect(sellableDepartureIssues(base,new Date('2026-09-01T00:00:00Z'))).toEqual([]);expect(sellableDepartureIssues({...base,ends_at:''},new Date('2026-09-01T00:00:00Z'))).toContain('return');expect(sellableDepartureIssues({...base,tax_included:false},new Date('2026-09-01T00:00:00Z'))).toContain('price')});
});
