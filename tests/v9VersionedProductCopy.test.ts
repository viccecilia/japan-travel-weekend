import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest';
const sql=readFileSync('supabase/migrations/202609110128_versioned_product_copy.sql','utf8');
const repository=readFileSync('src/shared/integrations/supabaseOperations.ts','utf8');
const ui=readFileSync('src/app/operations/ProductCenter.tsx','utf8');
describe('V9 versioned product copy',()=>{
  it('locks and verifies the source catalog version before copying',()=>{
    expect(sql).toContain('where id=p_source for update');
    expect(sql).toContain('v_source.catalog_version<>p_expected_catalog_version');
    expect(sql).toContain("'sourceCatalogVersion',p_expected_catalog_version");
    expect(sql).toContain("'product_copied'");
  });
  it('returns the new id and selects that draft after copy',()=>{
    expect(repository).toContain("rpc('operations_copy_product_versioned'");
    expect(repository).toContain('id:error?null:String(data)');
    expect(ui).toContain('sourceVersion:copySource.catalogVersion');
    expect(ui).toContain('sourceId:copySource.id');
    expect(ui).toContain('await reload(result.id)');
  });
});
