import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {getTrip} from '../src/shared/data/trips';
import {refundPercentAt} from '../src/shared/config/legalOperations';
import {SupabaseOrderRepository} from '../src/shared/integrations/supabaseProduction';

describe('京都奈良支付前黄金路径',()=>{
  it('路线内容包含景点顺序、履约说明与非伪造商业状态',()=>{
    const trip=getTrip('kyoto-nara-classic')!;
    expect(trip.status).toBe('标准路线');
    expect(trip.timeline.map(item=>item.title)).toEqual(expect.arrayContaining(['清水寺与东山历史街区','伏见稻荷大社','奈良公园']));
    expect(trip.timeline.every(item=>item.location&&item.detail)).toBe(true);
    expect(trip.price).toBe(6900);
    expect(trip.priceStatus).toBe('每席含税');
    expect(trip.minimumGuests).toBe(1);
    expect(trip.availableSeats).toBeNull();
    expect(trip.assistanceStatus).toContain('运营确认');
  });
  it('按实际出发时间计算24小时取消边界',()=>{
    const departure=new Date('2026-09-10T00:00:00Z');
    expect(refundPercentAt(departure,new Date('2026-09-09T00:00:00Z'))).toBe(100);
    expect(refundPercentAt(departure,new Date('2026-09-09T00:00:01Z'))).toBe(0);
    expect(refundPercentAt(departure,new Date('2026-09-08T23:59:59Z'))).toBe(100);
  });
  it('本人草稿只调用受控 RPC 且不触发支付或库存 RPC',async()=>{
    const rpc=vi.fn(async()=>({data:'draft-1',error:null}));
    const repository=new SupabaseOrderRepository({rpc} as unknown as SupabaseClient);
    const result=await repository.saveOwnDraft({departureId:'departure-1',adults:1,children:1,infants:1,passengerPrivate:{name:'TEST-旅客',phone:'000-0000-0000',emergency:'TEST-联系人'},assistancePrivate:{childSeat:{quantity:1,status:'已提出／确认中'}},reviewStatus:'确认中',acceptedCancellation:true,acceptedTerms:true,idempotencyKey:'golden-path-key-001'});
    expect(result).toEqual({id:'draft-1',error:null});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_own_booking_draft',expect.objectContaining({p_adults:1,p_children:1,p_infants:1}));
    expect(rpc).not.toHaveBeenCalledWith('reserve_inventory',expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('apply_payment_event',expect.anything());
  });
  it('迁移强制本人草稿、运营无敏感字段投影和服务端权限',()=>{
    const sql=readFileSync(join(process.cwd(),'supabase','migrations','202609020028_route_catalog_and_booking_drafts.sql'),'utf8');
    for(const clause of ['account_id=auth.uid()','authentication required','terms not accepted','idempotency parameter mismatch','get_operations_booking_drafts','grant execute on function public.save_own_booking_draft','alter table public.booking_drafts enable row level security'])expect(sql).toContain(clause);
    const projection=sql.slice(sql.indexOf('create or replace function public.get_operations_booking_drafts'),sql.indexOf('revoke all on function public.save_own_booking_draft'));
    expect(projection).not.toMatch(/passenger_private|phone|emergency|notes/);
  });
});
