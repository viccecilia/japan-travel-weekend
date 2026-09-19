export type BoostPlatform='tiktok'|'instagram'|'facebook';
export function validBoostPost(platform:BoostPlatform,value:string):boolean{
  try{
    const url=new URL(value.trim());
    if(url.protocol!=='https:'||url.username||url.password||url.port)return false;
    const host=url.hostname.replace(/^www\./,'');
    if(platform==='tiktok')return host==='tiktok.com'&&/^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname);
    if(platform==='instagram')return host==='instagram.com'&&/^\/(p|reel|reels)\/[\w-]+\/?$/.test(url.pathname);
    return host==='facebook.com'&&/^\/[^/]+\/(posts|videos)\/[^/]+\/?$/.test(url.pathname);
  }catch{return false}
}
