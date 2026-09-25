export type BoostPlatform='tiktok'|'instagram';

export function detectBoostPlatform(value:string):BoostPlatform|null{
  try{
    const url=new URL(value.trim());
    if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
    const host=url.hostname.replace(/^www\./,'').toLowerCase();
    if(host==='tiktok.com'||host==='vm.tiktok.com')return 'tiktok';
    if(host==='instagram.com')return 'instagram';
    return null;
  }catch{return null}
}

export function validBoostPost(platform:BoostPlatform,value:string):boolean{
  try{
    const url=new URL(value.trim());
    if(url.protocol!=='https:'||url.username||url.password||url.port)return false;
    const host=url.hostname.replace(/^www\./,'');
    if(platform==='tiktok')return (host==='tiktok.com'&&/^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname))||host==='vm.tiktok.com';
    if(platform==='instagram')return host==='instagram.com'&&/^\/(p|reel|reels)\/[\w-]+\/?$/.test(url.pathname);
    return false;
  }catch{return false}
}
