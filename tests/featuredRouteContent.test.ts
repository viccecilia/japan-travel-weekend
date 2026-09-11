import {describe,expect,it} from 'vitest';
import {featuredRoutePitch,featuredRouteSpots} from '../src/shared/i18n/spotContent';
import {expandedRouteSlugs,expandedRouteSummary} from '../src/shared/i18n/routeExpansion';
import {trips} from '../src/shared/data/trips';
import {routePhotoAt} from '../src/shared/data/routePhotoCatalog';
import {localizedTrip} from '../src/shared/components/TripCard';

describe('featured tourist route content',()=>{
  it.each([
    ['kyoto-nara-classic',3],
    ['amanohashidate-ine',3],
    ['biwako-shirahige',3],
    ['wakayama-family',4],
    ['kobe-arima-rokko',4],
    ['uji-nara-onsen',4],
    ['miyama-katsuoji-arashiyama',3],
    ['arashiyama-train-hozugawa',4],
    ['sanzenin-kibune-arashiyama-autumn',3],
  ])('provides distinct Chinese spot stories for %s',(slug,count)=>{
    const spots=featuredRouteSpots[slug]?.['zh-CN'];
    expect(spots).toHaveLength(count);
    expect(new Set(spots?.map(spot=>spot.name)).size).toBe(count);
    expect(featuredRoutePitch[slug]?.['zh-CN']?.fit).toHaveLength(3);
    for(const spot of spots??[]){
      expect(spot.intro.length).toBeGreaterThan(35);
      expect(spot.history.length).toBeGreaterThan(25);
      expect(spot.highlights).toHaveLength(3);
      expect(spot.tip.length).toBeGreaterThan(20);
    }
  });

  it('keeps every Kobe stop visible, including the Rokko night view',()=>{
    const names=featuredRouteSpots['kobe-arima-rokko']?.['zh-CN']?.map(spot=>spot.name);
    expect(names).toEqual(['有马温泉','北野异人馆街','神户港与马赛克摩天轮','六甲山夜景']);
  });

  it('publishes nine distinct tourist routes',()=>{
    expect(trips).toHaveLength(9);
    expect(new Set(trips.map(trip=>trip.slug)).size).toBe(9);
  });

  it('never renders an empty Chinese route introduction when published content is incomplete',()=>{
    for(const trip of trips){
      const incomplete={...trip,summary:'',description:'',catalogSource:'published' as const};
      expect(localizedTrip('zh-CN',incomplete).summary.length).toBeGreaterThan(20);
    }
  });

  it('never shifts an attraction photo onto a different stop',()=>{
    expect(routePhotoAt('amanohashidate-ine',0)?.url).toContain('/amanohashidate/');
    expect(routePhotoAt('amanohashidate-ine',1)).toBeUndefined();
    expect(routePhotoAt('amanohashidate-ine',2)?.url).toContain('/ine/');
    expect(routePhotoAt('kobe-arima-rokko',0)?.url).toContain('/arima/');
    expect(routePhotoAt('kobe-arima-rokko',2)?.url).toContain('/kobe/');
    expect(routePhotoAt('sanzenin-kibune-arashiyama-autumn',0)?.url).toContain('/sanzenin/');
    expect(routePhotoAt('sanzenin-kibune-arashiyama-autumn',1)?.url).toContain('/kifune/');
    expect(routePhotoAt('sanzenin-kibune-arashiyama-autumn',2)?.url).toContain('/arashiyama-autumn/');
  });

  it.each(['zh-CN','zh-TW','ja','en','es','vi','ko','ne'] as const)('localizes every expanded route in %s',(locale)=>{
    expect(expandedRouteSlugs).toHaveLength(4);
    for(const slug of expandedRouteSlugs){
      const route=expandedRouteSummary(locale,slug);
      expect(route?.name).toBeTruthy();
      expect(route?.summary.length).toBeGreaterThan(20);
      expect(route?.stops.length).toBeGreaterThanOrEqual(3);
    }
  });
});
