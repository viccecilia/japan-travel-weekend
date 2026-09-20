// Home no longer lists departures; the date/price association remains covered in
// homeUpcomingDepartures.test.ts and the Booking component tests.
import {expect,it} from 'vitest';
import {initialDiscoverHeroes} from '../src/shared/discover';
it('initial Discover content contains no copied commercial fields',()=>{
 for(const hero of initialDiscoverHeroes){expect(hero).not.toHaveProperty('price');expect(hero).not.toHaveProperty('departureId');expect(hero).not.toHaveProperty('inventory')}
});
