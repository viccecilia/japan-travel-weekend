import {describe,expect,it} from 'vitest';
import {selectUpcomingDepartures,selectDeparturesForTokyoDate,nextTokyoDays,tokyoDateKey} from '../src/app/homeUpcomingDepartures';
import type {Departure} from '../src/shared/types';

const departure=(id:string,tripSlug:string,time:string,price:number,seats=5,extra:Partial<Departure>={}):Departure=>({id,tripSlug,dateLabel:'9月13日',weekend:'本周末',status:'可预订',departureTime:time,expectedEndTime:'2026-09-13T10:00:00Z',meetingPointName:'集合点',meetingAddress:'地址',meetingCoordinates:null,arrivalInstructions:{transit:null,walking:null,driving:null},meetingPhoto:null,meetingPhotoStatus:'待确认',mapStatus:'未连接',price,availableSeats:seats,currency:'JPY',taxIncluded:true,inventoryStatus:'权威库存',isSeed:false,...extra});

describe('游客首页近期出发',()=>{
  it('按日本日期跨月跨年，日期筛选不改变周末最终报价',()=>{
    expect(tokyoDateKey('2026-12-31T15:00:00Z')).toBe('2027-01-01');
    expect(nextTokyoDays(new Date('2026-12-31T14:00:00Z'),3)).toEqual(['2026-12-31','2027-01-01','2027-01-02']);
    const saturday=departure('sat','a','2026-09-18T23:00:00Z',8800);
    expect(selectDeparturesForTokyoDate([saturday],['a'],'2026-09-19',new Date('2026-09-18'))[0]).toEqual(saturday);
    expect(selectDeparturesForTokyoDate([saturday],['a'],'2026-09-18',new Date('2026-09-18'))).toEqual([]);
  });
  const now=new Date('2026-09-11T00:00:00Z');
  it('同一路线只保留最近班次并保持产品推荐顺序',()=>{
    const result=selectUpcomingDepartures([departure('a2','a','2026-09-14T00:00:00Z',9000),departure('b1','b','2026-09-12T00:00:00Z',7000),departure('a1','a','2026-09-13T00:00:00Z',8000)],['a','b'],now);
    expect(result.map(item=>[item.id,item.price])).toEqual([['a1',8000],['b1',7000]]);
  });
  it('日期价格库存来自同一班次并排除不可售投影',()=>{
    const result=selectUpcomingDepartures([departure('sold','a','2026-09-12T00:00:00Z',1,0),departure('seed','a','2026-09-12T00:00:00Z',2,5,{isSeed:true}),departure('unpublished','a','2026-09-12T00:00:00Z',3,5,{inventoryStatus:'尚未发布'}),departure('valid','a','2026-09-13T00:00:00Z',8100,4)],['a'],now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({id:'valid',price:8100,availableSeats:4,departureTime:'2026-09-13T00:00:00Z'});
  });
});
