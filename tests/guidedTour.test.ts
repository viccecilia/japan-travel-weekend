import {describe,expect,it} from 'vitest';
import {kiyomizuArashiyamaGuide} from '../src/shared/data/guidedTours';
import {distanceMeters,guidedTourProgress,nodesForBranch} from '../src/shared/services/guidedTour';

describe('guided tour engine',()=>{
  it('keeps meal and sightseeing branches separate',()=>{
    const meal=nodesForBranch(kiyomizuArashiyamaGuide,'meal-first').map(item=>item.id);
    const sights=nodesForBranch(kiyomizuArashiyamaGuide,'sightseeing-first').map(item=>item.id);
    expect(meal).toContain('arashiyama-meal');expect(meal).not.toContain('arashiyama-meal-last');
    expect(sights).toContain('arashiyama-meal-last');expect(sights).not.toContain('arashiyama-meal');
  });
  it('triggers arrival inside configured radius and advances after completion',()=>{
    const first=kiyomizuArashiyamaGuide.nodes[0];
    const position={latitude:first.latitude,longitude:first.longitude};
    const initial=guidedTourProgress(kiyomizuArashiyamaGuide,'meal-first',position,new Set());
    expect(initial?.current.id).toBe(first.id);expect(initial?.reached).toBe(true);
    const next=guidedTourProgress(kiyomizuArashiyamaGuide,'meal-first',position,new Set([first.id]));
    expect(next?.current.id).not.toBe(first.id);
  });
  it('calculates stable meter distances',()=>expect(distanceMeters({latitude:35,longitude:135},{latitude:35.001,longitude:135})).toBeGreaterThan(100));
  it('marks unverified pickup coordinates for field calibration',()=>expect(kiyomizuArashiyamaGuide.nodes.filter(item=>item.kind==='pickup').every(item=>item.verificationStatus==='field-check-required')).toBe(true));
});
