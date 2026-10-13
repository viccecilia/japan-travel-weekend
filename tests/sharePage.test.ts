import {describe,expect,it} from 'vitest';
import {createPublicSharePage} from '../server/sharePage';

const shell='<!doctype html><html lang="zh-CN"><head><meta name="description" content="old"/><meta property="og:title" content="old"/><meta property="og:description" content="old"/><meta property="og:image" content="/old.webp"/><title>Old</title></head><body><div id="root"></div></body></html>';
const published={slug:'route-one',title:'中文标题',hero_image_url:'/cover.webp',gallery:[],content:{description:'已发布中文详细介绍',locales:{en:{title:'Published English title',description:'Published English <detail> & safe.'},ja:{title:'公開済みタイトル',description:'公開済みの詳しい紹介'}}}};
const catalog={find:async(slug:string)=>slug==='route-one'?published:null};

describe('initial route invitation HTML',()=>{
  it('renders published localized description and safe route metadata without JavaScript',async()=>{
    const render=createPublicSharePage({catalog,origin:'https://weekend.japan-travel.info',loadShell:async()=>shell});
    const result=await render('/r/CODE1234/route-one?lang=en&departureId=dep_123&redirect=https://evil.test');
    expect(result).toMatchObject({status:200,headers:{'content-language':'en','cache-control':'no-store, max-age=0'}});
    expect(result?.body).toContain('<html lang="en"');
    expect(result?.body).toContain('<title>Published English title | Japan Travel Weekend</title>');
    expect(result?.body).toContain('Published English &lt;detail&gt; &amp; safe.');
    expect(result?.body).toContain('content="https://weekend.japan-travel.info/cover.webp"');
    expect(result?.body).toContain('href="https://weekend.japan-travel.info/r/CODE1234/route-one?lang=en&amp;departureId=dep_123"');
    expect(result?.body).not.toContain('evil.test');
    expect(result?.body).not.toContain('<detail>');
  });
  it('keeps codes and languages isolated with no response cache',async()=>{
    const render=createPublicSharePage({catalog,origin:'https://weekend.japan-travel.info',loadShell:async()=>shell});
    const first=await render('/r/FIRST01/route-one?lang=en');const second=await render('/r/SECOND02/route-one?lang=ja');
    expect(first?.body).toContain('/r/FIRST01/route-one?lang=en');expect(first?.body).not.toContain('SECOND02');
    expect(second?.body).toContain('/r/SECOND02/route-one?lang=ja');expect(second?.body).not.toContain('FIRST01');
    expect(second?.body).toContain('公開済みの詳しい紹介');expect(second?.headers['cache-control']).toContain('no-store');
  });
  it('returns a real 404 for an unknown or unpublished route without borrowing another route',async()=>{
    const render=createPublicSharePage({catalog,origin:'https://weekend.japan-travel.info',loadShell:async()=>shell});
    const result=await render('/r/CODE1234/draft-route?lang=en');
    expect(result?.status).toBe(404);expect(result?.body).not.toContain('Published English title');expect(result?.body).not.toContain('Published English &lt;detail&gt;');
  });
  it('keeps initial metadata bounded while deriving it from the published detailed introduction',async()=>{
    const longCatalog={find:async()=>({...published,content:{description:'中'.repeat(240),locales:{}}})};
    const render=createPublicSharePage({catalog:longCatalog,origin:'https://weekend.japan-travel.info',loadShell:async()=>shell});
    const result=await render('/r/CODE1234/route-one?lang=zh-CN');
    const description=result?.body.match(/<meta name="description" content="([^"]*)"/)?.[1]??'';
    expect(Array.from(description)).toHaveLength(180);expect(description.endsWith('…')).toBe(true);
  });
});
