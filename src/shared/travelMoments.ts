export type TravelMomentPlatform='tiktok'|'instagram';
export type TravelMomentReason='INVALID_URL'|'PROFILE_URL_NOT_POST'|'UNSUPPORTED_PLATFORM'|'TRIP_NOT_FOUND'|'TRIP_MISMATCH'|'TRIP_NOT_COMPLETED'|'ORDER_UNPAID'|'ORDER_REFUNDED'|'TEST_ORDER'|'DUPLICATE_CONTENT'|'MISSING_OFFICIAL_MENTION'|'MISSING_CAMPAIGN_HASHTAG'|'ACCOUNT_MISMATCH'|'POST_PRIVATE'|'POST_UNAVAILABLE'|'EXTERNAL_CHECK_UNAVAILABLE';
export type TravelMomentStatus='submitted'|'checking'|'needs_adjustment'|'pending_review'|'eligible'|'ineligible'|'unavailable';
export type CanonicalPost={platform:TravelMomentPlatform;canonicalUrl:string;contentId:string|null}|{reason:'INVALID_URL'|'PROFILE_URL_NOT_POST'|'UNSUPPORTED_PLATFORM'};
export function canonicalizeTravelMomentUrl(value:string):CanonicalPost{
  let url:URL;try{url=new URL(value.trim())}catch{return {reason:'INVALID_URL'}};
  if(url.protocol!=='https:')return {reason:'INVALID_URL'};const host=url.hostname.toLowerCase().replace(/^www\./,'');const parts=url.pathname.split('/').filter(Boolean);url.search='';url.hash='';url.hostname=host;url.pathname=url.pathname.toLowerCase();
  if(host==='tiktok.com'||host==='vm.tiktok.com'){const video=parts.findIndex(part=>part==='video');if(video>0&&/^\d+$/.test(parts[video+1]??''))return {platform:'tiktok',canonicalUrl:url.toString().replace(/\/$/,''),contentId:`tiktok:${parts[video+1]}`};if(host==='vm.tiktok.com'&&parts.length===1)return {platform:'tiktok',canonicalUrl:url.toString().replace(/\/$/,''),contentId:null};return {reason:'PROFILE_URL_NOT_POST'}};
  if(host==='instagram.com'){if(['p','reel','reels'].includes(parts[0]??'')&&parts[1])return {platform:'instagram',canonicalUrl:url.toString().replace(/\/$/,''),contentId:`instagram:${parts[1].toLowerCase()}`};return {reason:'PROFILE_URL_NOT_POST'}};
  return {reason:'UNSUPPORTED_PLATFORM'};
}
export function publicStatus(status:TravelMomentStatus,reason?:string){if(status==='eligible')return 'eligible';if(status==='needs_adjustment')return 'needs_adjustment';if(status==='pending_review'||status==='checking'||status==='submitted'||status==='unavailable')return 'pending_review';return 'ineligible';}
export function normalizeSocialAccount(value:string){return value.trim().toLowerCase().replace(/^@/,'').replace(/[._-]/g,'');}
