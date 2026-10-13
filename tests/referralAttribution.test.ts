import {beforeEach,describe,expect,it} from 'vitest';
import {captureReferralAttribution,loadReferralAttribution,referralReturnTo,sanitizeReferralAttribution} from '../src/shared/referralAttribution';

describe('route referral attribution',()=>{
  beforeEach(()=>sessionStorage.clear());
  it('retains only the approved referral, route, locale and departure fields',()=>{captureReferralAttribution({code:' friend10 ',routeSlug:'kyoto-nara-classic',locale:'vi',departureId:'dep-2026'});expect(loadReferralAttribution()).toEqual({code:'FRIEND10',routeSlug:'kyoto-nara-classic',locale:'vi',departureId:'dep-2026'});expect(referralReturnTo(loadReferralAttribution()!)).toBe('/app/trips/kyoto-nara-classic?ref=FRIEND10&lang=vi&departureId=dep-2026')});
  it('rejects arbitrary routes, redirects and invalid codes',()=>{expect(sanitizeReferralAttribution({code:'x',routeSlug:'https://evil.test',locale:'en',departureId:''})).toBeNull();expect(sessionStorage.length).toBe(0)});
});
