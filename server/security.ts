import {createHash} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';

export const apiSecurityHeaders={
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
  'permissions-policy':'camera=(), geolocation=(), microphone=()',
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
} as const;

export class RequestBodyTooLargeError extends Error{}

export async function readRequestBody(req:IncomingMessage,limit:number){
  const declared=Number(req.headers['content-length']);
  if(Number.isFinite(declared)&&declared>limit)throw new RequestBodyTooLargeError();
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of req){const value=Buffer.from(chunk);size+=value.length;if(size>limit)throw new RequestBodyTooLargeError();chunks.push(value)}
  return Buffer.concat(chunks);
}

type Entry={count:number;resetAt:number};
export class FixedWindowRateLimiter{
  private readonly entries=new Map<string,Entry>();
  constructor(private readonly limit:number,private readonly windowMs:number,private readonly maxKeys=10_000){}
  take(key:string,now=Date.now()){
    if(this.entries.size>=this.maxKeys)this.prune(now);
    const current=this.entries.get(key);
    if(!current||current.resetAt<=now){this.entries.set(key,{count:1,resetAt:now+this.windowMs});return {allowed:true,retryAfterSeconds:0}}
    current.count+=1;
    return {allowed:current.count<=this.limit,retryAfterSeconds:Math.max(1,Math.ceil((current.resetAt-now)/1000))};
  }
  private prune(now:number){for(const [key,value] of this.entries)if(value.resetAt<=now)this.entries.delete(key);while(this.entries.size>=this.maxKeys){const oldest=this.entries.keys().next().value as string|undefined;if(!oldest)break;this.entries.delete(oldest)}}
  get size(){return this.entries.size}
}

const normalizeAddress=(value:string)=>value.trim().replace(/^::ffff:/,'');
export function parseTrustedProxyAddresses(value:string|undefined){return new Set((value??'').split(',').map(normalizeAddress).filter(Boolean))}
export function requestSourceAddress(req:IncomingMessage,trustedProxies:ReadonlySet<string>){
  const remote=normalizeAddress(req.socket.remoteAddress||'unknown');
  if(!trustedProxies.has(remote))return remote;
  const header=Array.isArray(req.headers['x-forwarded-for'])?req.headers['x-forwarded-for'].join(','):req.headers['x-forwarded-for'];
  const chain=(header??'').split(',').map(normalizeAddress).filter(Boolean);
  for(let index=chain.length-1;index>=0;index-=1)if(!trustedProxies.has(chain[index]))return chain[index];
  return remote;
}
export function requestRateKey(req:IncomingMessage,accountId:string|null,trustedProxies:ReadonlySet<string>){
  const material=accountId?`account:${accountId}`:`source:${requestSourceAddress(req,trustedProxies)}`;
  return createHash('sha256').update(material).digest('hex');
}

export function sendRateLimit(res:ServerResponse,retryAfterSeconds:number,corsOrigin:string|null,send:(res:ServerResponse,status:number,body:unknown,corsOrigin?:string|null,headers?:Record<string,string>)=>void){send(res,429,{error:'rate_limited'},corsOrigin,{'retry-after':String(retryAfterSeconds)})}
