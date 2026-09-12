import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest';
const sql=readFileSync('supabase/migrations/202609110128_versioned_product_copy.sql','utf8');
describe('V9 versioned product copy',()=>{
  it('locks and verifies the source catalog version before copying',()=>{
    expect(sql).toContain('where id=p_source for update');
    expect(sql).toContain('v_source.catalog_version<>p_expected_catalog_version');
    expect(sql).toContain("'sourceCatalogVersion',p_expected_catalog_version");
    expect(sql).toContain("'product_copied'");
  });
  it('keeps server-side source version conflict protection',()=>{
    expect(sql).toContain('operations_copy_product_versioned');
    expect(sql).toContain('raise exception');
  });
});
