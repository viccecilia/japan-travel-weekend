import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(join(process.cwd(),'supabase','migrations','202609090090_safe_route_catalog_patch.sql'),'utf8');

describe('U0 safe route catalog patch',()=>{
  it('rejects stale concurrent edits',()=>{
    expect(sql).toContain('catalog_version');
    expect(sql).toContain("raise exception 'route version conflict'");
    expect(sql).toContain('for update');
  });
  it('merges content and preserves media unless explicitly patched',()=>{
    expect(sql).toContain("current_trip.content||coalesce(p_patch->'content','{}'::jsonb)");
    expect(sql).toContain("case when p_patch ? 'gallery' then p_patch->'gallery' else current_trip.gallery end");
    expect(sql).toContain("case when p_patch ? 'heroImageUrl'");
  });
  it('records the changed fields in the audit trail',()=>{
    expect(sql).toContain("'route_catalog_patched'");
    expect(sql).toContain("'changedFields'");
  });
});
