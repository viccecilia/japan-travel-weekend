import {readFileSync} from 'node:fs';import {join} from 'node:path';import {describe,expect,it} from 'vitest';
const revision=readFileSync(join(process.cwd(),'supabase','migrations','202609090091_product_revision_publication.sql'),'utf8');
const seed=readFileSync(join(process.cwd(),'supabase','migrations','202609090092_seed_nine_product_catalog.sql'),'utf8');
describe('U1 product publication',()=>{
  it('upgrades legacy published rows while the completeness trigger remains enabled',()=>{expect(revision).toMatch(/update public\.trips set content=content\|\|jsonb_build_object/);expect(revision).toContain('not public.route_catalog_complete(content)');expect(revision).not.toMatch(/disable trigger/i)});
  it('keeps draft and published revisions separate and uses version checks',()=>{expect(revision).toContain('current_published_revision_id');expect(revision).toContain('current_draft_revision_id');expect(revision).toContain('product version conflict');expect(revision).toMatch(/current_draft_revision_id=created_id[\s\S]*catalog_version=catalog_version\+1/)});
  it('publishes atomically and exposes only the published pointer',()=>{expect(revision).toMatch(/list_public_product_catalog[\s\S]*r\.id=t\.current_published_revision_id/);expect(revision).toMatch(/operations_publish_product[\s\S]*current_published_revision_id=draft\.id,current_draft_revision_id=null/)});
  it('seeds every existing route idempotently',()=>{for(const slug of ['kyoto-nara-classic','amanohashidate-ine','biwako-shirahige','wakayama-family','kobe-arima-rokko','uji-nara-onsen','miyama-katsuoji-arashiyama','arashiyama-train-hozugawa','sanzenin-kibune-arashiyama-autumn'])expect(seed).toContain(slug);expect(seed).toContain('on conflict(slug) do nothing')});
});
