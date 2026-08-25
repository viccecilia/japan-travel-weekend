export function parseAllowedOrigins(raw:string){
  return [...new Set(raw.split(',').map(value=>value.trim()).filter(value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&url.origin===value}catch{return false}}))];
}

export function allowedCorsOrigin(requestOrigin:string|undefined,allowed:string[]){
  return requestOrigin&&allowed.includes(requestOrigin)?requestOrigin:null;
}
