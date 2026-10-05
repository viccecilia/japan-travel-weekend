import {describe,expect,it} from 'vitest';
import {trips} from '../data/trips';
import {resolveAttractionId} from './index';

describe('nine-route attraction integration audit',()=>{
  it('uses only reviewed exact stop aliases and leaves ambiguous split stops unresolved',()=>{
    const audit=Object.fromEntries(trips.map(trip=>[
      trip.slug,
      trip.stops.map(title=>({title,attractionId:resolveAttractionId({title},'zh-CN')})),
    ]));

    expect(Object.keys(audit)).toHaveLength(9);
    expect(Object.values(audit).flat().filter(item=>item.attractionId===null).map(item=>item.title)).toEqual([
      '贵志站',
      '特色电车',
    ]);
    expect(audit['sanzenin-kibune-arashiyama-autumn']).toEqual([
      {title:'贵船神社',attractionId:'kifune-shrine'},
      {title:'大原三千院',attractionId:'sanzen-in'},
      {title:'岚山·渡月桥',attractionId:'arashiyama-togetsukyo'},
    ]);
  });
});
