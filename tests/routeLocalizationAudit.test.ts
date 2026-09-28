import {describe,expect,it} from 'vitest';
import {trips} from '../src/shared/data/trips';
import {auditRouteLocalization} from '../src/shared/services/routeLocalizationAudit';

describe('route localization audit',()=>{
  it('reports actual route-visible localization coverage without inventing translations',()=>{
    const report=auditRouteLocalization(trips);
    expect(report.rows).toHaveLength(10);
    expect(report.missingTitles).toHaveLength(trips.length);
    expect(report.missingTitles.every(row=>row.sourceLocale==='zh-CN')).toBe(true);
  });
});
