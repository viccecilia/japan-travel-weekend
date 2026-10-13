import {readFile} from 'node:fs/promises';
import type {SupabaseClient} from '@supabase/supabase-js';

const locales=['zh-CN','zh-TW','ja','en','ko','es','vi','ne'] as const;
type ShareLocale=typeof locales[number];
type CatalogRow={slug:string;title:string;content:Record<string,unknown>|null;hero_image_url:string|null;gallery:unknown};
type PublicShareRoute={slug:string;title:string;description:string;image:string};

const missingDescription:Record<ShareLocale,string>={
  'zh-CN':'当前语言的路线详细介绍尚未提供。','zh-TW':'目前語言的路線詳細介紹尚未提供。',
  ja:'この言語のルート詳細はまだ提供されていません。',en:'The detailed route introduction is not yet available in this language.',
  ko:'현재 언어의 상세 노선 소개가 아직 제공되지 않았습니다.',es:'La introducción detallada de la ruta aún no está disponible en este idioma.',
  vi:'Phần giới thiệu chi tiết của hành trình chưa có bằng ngôn ngữ này.',ne:'यस भाषामा विस्तृत मार्ग परिचय अझै उपलब्ध छैन।',
};
const genericTitle:Record<ShareLocale,string>={
  'zh-CN':'好友邀请你一起旅行','zh-TW':'好友邀請你一起旅行',ja:'友人から旅への招待です',en:'A friend invited you to travel',
  ko:'친구가 여행에 초대했습니다',es:'Un amigo te invita a viajar',vi:'Một người bạn mời bạn cùng đi',ne:'साथीले तपाईंलाई यात्रामा बोलाएका छन्',
};
const routeLabel:Record<ShareLocale,string>={
  'zh-CN':'路线','zh-TW':'路線',ja:'ルート',en:'Route',ko:'노선',es:'Ruta',vi:'Hành trình',ne:'यात्रा मार्ग',
};

function text(value:unknown){return typeof value==='string'?value.trim():''}
function record(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))}
function metadataSummary(value:string){const normalized=value.replace(/\s+/g,' ').trim();const characters=Array.from(normalized);return characters.length<=180?normalized:`${characters.slice(0,179).join('')}…`}
function safePublicImage(value:string,origin:string){
  if(!value)return new URL('/images/kyoto-nara.jpg',origin).toString();
  try{const url=new URL(value,origin);return url.protocol==='https:'?url.toString():new URL('/images/kyoto-nara.jpg',origin).toString()}catch{return new URL('/images/kyoto-nara.jpg',origin).toString()}
}
function localeFrom(value:string|null):ShareLocale{return locales.includes(value as ShareLocale)?value as ShareLocale:'zh-CN'}
function routePresentation(row:CatalogRow,locale:ShareLocale,origin:string):PublicShareRoute{
  const content=record(row.content)??{};const localized=locale==='zh-CN'?content:record(record(content.locales)?.[locale])??{};
  const title=text(localized.title)||(locale==='zh-CN'?text(row.title):`${routeLabel[locale]} · ${row.slug.toUpperCase()}`);
  const description=metadataSummary(text(localized.description)||missingDescription[locale]);
  const gallery=Array.isArray(row.gallery)?row.gallery:[];const heroVideo=record(content.heroVideo);
  const image=safePublicImage(text(row.hero_image_url)||text(heroVideo?.posterUrl)||text(gallery.find(item=>typeof item==='string')),origin);
  return {slug:row.slug,title,description,image};
}
function replaceTag(html:string,matcher:RegExp,replacement:string){return matcher.test(html)?html.replace(matcher,replacement):html.replace('</head>',`${replacement}</head>`)}
function renderShell(shell:string,input:{locale:ShareLocale;title:string;description:string;image:string;url:string}){
  const title=`${input.title} | Japan Travel Weekend`;const lang=escapeHtml(input.locale);const safeTitle=escapeHtml(title);const safeDescription=escapeHtml(input.description);const safeImage=escapeHtml(input.image);const safeUrl=escapeHtml(input.url);
  let html=shell.replace(/<html\s+lang="[^"]*"/i,`<html lang="${lang}"`);
  html=replaceTag(html,/<title>[^<]*<\/title>/i,`<title>${safeTitle}</title>`);
  html=replaceTag(html,/<meta\s+name="description"[^>]*>/i,`<meta name="description" content="${safeDescription}"/>`);
  html=replaceTag(html,/<meta\s+property="og:title"[^>]*>/i,`<meta property="og:title" content="${escapeHtml(input.title)}"/>`);
  html=replaceTag(html,/<meta\s+property="og:description"[^>]*>/i,`<meta property="og:description" content="${safeDescription}"/>`);
  html=replaceTag(html,/<meta\s+property="og:image"[^>]*>/i,`<meta property="og:image" content="${safeImage}"/>`);
  html=replaceTag(html,/<meta\s+property="og:url"[^>]*>/i,`<meta property="og:url" content="${safeUrl}"/>`);
  html=replaceTag(html,/<meta\s+property="og:locale"[^>]*>/i,`<meta property="og:locale" content="${escapeHtml(input.locale.replace('-','_'))}"/>`);
  html=replaceTag(html,/<link\s+rel="canonical"[^>]*>/i,`<link rel="canonical" href="${safeUrl}"/>`);
  return html;
}

export class SupabasePublicShareCatalog{
  constructor(private readonly client:SupabaseClient|null){}
  async find(slug:string){
    if(!this.client)return null;
    const {data,error}=await this.client.rpc('list_public_product_catalog');
    if(error||!Array.isArray(data))return null;
    const row=(data as CatalogRow[]).find(item=>item.slug===slug);return row??null;
  }
}

export type SharePageResult={status:number;body:string;headers:Record<string,string>};
export function createPublicSharePage(options:{catalog:{find(slug:string):Promise<CatalogRow|null>};origin?:string;shellPath?:string;loadShell?:()=>Promise<string>}){
  const origin=options.origin??'https://weekend.japan-travel.info';const loadShell=options.loadShell??(()=>readFile(options.shellPath??'/var/www/japan-travel-weekend-test/index.html','utf8'));
  return async(requestUrl:string):Promise<SharePageResult|null>=>{
    const parsed=new URL(requestUrl,origin);if(!parsed.pathname.startsWith('/r/'))return null;
    const parts=parsed.pathname.split('/').filter(Boolean);const code=(parts[1]??'').toUpperCase();const slug=parts[2]??'';
    if(parts.length>3||!code||code.length>64|| (slug&&!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug)))return {status:400,body:'Bad request',headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}};
    const locale=localeFrom(parsed.searchParams.get('lang'));const shell=await loadShell();const departureId=parsed.searchParams.get('departureId')??'';const query=new URLSearchParams({lang:locale});if(/^[a-zA-Z0-9_-]{3,80}$/.test(departureId))query.set('departureId',departureId);
    const canonical=`${origin}/r/${encodeURIComponent(code)}${slug?`/${encodeURIComponent(slug)}`:''}?${query}`;
    let status=200;let title=genericTitle[locale];let description=missingDescription[locale];let image=safePublicImage('',origin);
    if(slug){const row=await options.catalog.find(slug);if(row){const route=routePresentation(row,locale,origin);title=route.title;description=route.description;image=route.image}else status=404}
    return {status,body:renderShell(shell,{locale,title,description,image,url:canonical}),headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, max-age=0','content-language':locale,'x-jtw-share-render':'published-route-v1'}};
  };
}
