import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {SupabaseOperationsRepository} from '../src/shared/integrations/supabaseOperations';
import type {DiscoverHero} from '../src/shared/discover';

const migration=readFileSync('supabase/migrations/20261010065716_discover_hero_translation_metadata.sql','utf8');

describe('Discover translation persistence contract',()=>{
  it('keeps Operations authorization, optimistic locking, audit history and the strict translation allowlist',()=>{
    expect(migration).toContain("not coalesce(public.is_operations(),false)");
    expect(migration).toContain('previous.version<>p_expected_version');
    expect(migration).toContain("'before',to_jsonb(previous)-'history','after',to_jsonb(saved)-'history'");
    expect(migration).toContain("k not in('title','subtitle','highlight_phrase','_content_package')");
    expect(migration).toContain("k not in('source_hash','status','fields')");
    expect(migration).toContain("metadata_field.key not in('title','subtitle','highlight_phrase')");
    expect(migration).toContain("not in('missing','draft','reviewed','published','stale')");
    expect(migration).toContain("!~ '^fnv1a-[0-9a-f]+$'");
  });

  it('passes field-specific source hashes and statuses through the formal save RPC unchanged',async()=>{
    const rpc=vi.fn(async()=>({data:null,error:null}));
    const repository=new SupabaseOperationsRepository({rpc} as never);
    const hero:DiscoverHero={
      id:'ca631d49-42ee-4c6c-9630-09275e838001',video_url:'/media/discover/autumn-soul.mp4',poster_url:'/media/discover/autumn-soul.jpg',
      product_id:null,product_slug:null,enabled:true,sort_order:0,version:3,
      translations:{
        'zh-CN':{title:'中文标题',subtitle:'中文副标题'},
        'zh-TW':{title:'繁體標題',subtitle:'繁體副標題',_content_package:{fields:{
          title:{source_hash:'fnv1a-11111111',status:'draft'},
          subtitle:{source_hash:'fnv1a-22222222',status:'reviewed'},
        }}},
      },
    };
    await repository.saveDiscoverHero(hero);
    expect(rpc).toHaveBeenCalledWith('save_discover_hero',expect.objectContaining({
      p_expected_version:3,
      p_content:expect.objectContaining({translations:hero.translations}),
    }));
  });

  it('continues to accept the legacy title and subtitle-only shape in the SQL contract',()=>{
    expect(migration).toContain("jsonb_typeof(lang.value->'title')");
    expect(migration).toContain("jsonb_typeof(lang.value->'subtitle')");
    expect(migration).toContain("if lang.value ? '_content_package' then");
  });
});
