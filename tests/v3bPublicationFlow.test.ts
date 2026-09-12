import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

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
  it('edits operational content instead of replacing the revision with two fields',()=>{
    for(const field of ['itinerary','highlights','included','excluded','notices','locales'])expect(edit).toContain(`name="${field}"`);
    expect(edit).toContain('...product.content');
  });
});
