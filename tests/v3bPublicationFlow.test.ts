import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {draftContent, draftFromProduct} from '../src/app/operations/productDraft';
import type {OperationsProduct} from '../src/shared/integrations/supabaseOperations';

const app=readFileSync('src/app/App.tsx','utf8');
const store=readFileSync('src/app/store.tsx','utf8');
const center=readFileSync('src/app/operations/ProductCenter.tsx','utf8');
const edit=readFileSync('src/app/operations/ProductEditPage.tsx','utf8');

describe('V3-B published product flow',()=>{
  it('makes database content authoritative over built-in route marketing copy',()=>{
    expect(app).toMatch(/trip\.catalogSource==='published'/);
    expect(app).toMatch(/trip\.localizedContent\?\.\[locale\]/);
    expect(app).toMatch(/t\.catalogSource==='published'\?null:featuredRoutePitch/);
  });
  it('exposes catalog refresh through context and refreshes after publish',()=>{
    expect(store).toMatch(/catalogRevision: number/);
    expect(store).toMatch(/window\.addEventListener\('focus',onFocus\)/);
    expect(edit).toMatch(/await refreshCatalog\(\)/);
  });
  it('edits operational content without discarding existing extension fields',()=>{
    const product={id:'trip',slug:'trip',status:'draft',catalogVersion:1,publishedRevision:null,draftRevision:1,title:'路线',heroImageUrl:null,gallery:[],updatedAt:'2026-09-13T00:00:00Z',content:{summary:'旧简介',itinerary:[{id:'s1',title:'第一站',custom:'keep'}],highlights:['亮点'],included:['交通'],excluded:['午餐'],notices:['准时'],locales:{ja:{title:'ルート'}},extension:{enabled:true}}} satisfies OperationsProduct;
    const draft=draftFromProduct(product);
    draft.summary='新简介';
    draft.itinerary[0].title='新第一站';
    expect(draftContent(product,draft)).toMatchObject({summary:'新简介',itinerary:[{id:'s1',title:'新第一站',custom:'keep'}],highlights:['亮点'],included:['交通'],excluded:['午餐'],notices:['准时'],locales:{ja:{title:'ルート'}},extension:{enabled:true}});
  });
});
