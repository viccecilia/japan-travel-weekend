import type {PassengerLocale} from './i18n/passengerLocale';

const KEY='jtw-referral-attribution-v1';
const CODE=/^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const LOCALES:PassengerLocale[]=['zh-CN','zh-TW','ja','en','ko','es','vi','ne'];

export type ReferralAttribution={code:string;routeSlug:string;locale:PassengerLocale;departureId:string};

export function sanitizeReferralAttribution(input:Partial<ReferralAttribution>):ReferralAttribution|null{
  const code=(input.code??'').trim().toUpperCase();
  const routeSlug=(input.routeSlug??'').trim().toLowerCase();
  const departureId=(input.departureId??'').trim();
  const locale=LOCALES.includes(input.locale as PassengerLocale)?input.locale as PassengerLocale:'zh-CN';
  if(!CODE.test(code)||!/^[a-z0-9][a-z0-9-]{1,79}$/.test(routeSlug)|| (departureId&&!/^[a-zA-Z0-9_-]{3,80}$/.test(departureId)))return null;
  return {code,routeSlug,locale,departureId};
}

export function captureReferralAttribution(input:Partial<ReferralAttribution>){
  const clean=sanitizeReferralAttribution(input);if(!clean)return null;
  try{sessionStorage.setItem(KEY,JSON.stringify(clean))}catch{/* Browsing still works when storage is unavailable. */}
  return clean;
}

export function loadReferralAttribution():ReferralAttribution|null{
  try{return sanitizeReferralAttribution(JSON.parse(sessionStorage.getItem(KEY)??'null')??{})}catch{return null}
}

export function referralReturnTo(value:ReferralAttribution){
  const params=new URLSearchParams({ref:value.code,lang:value.locale});
  if(value.departureId)params.set('departureId',value.departureId);
  return `/app/trips/${encodeURIComponent(value.routeSlug)}?${params}`;
}
