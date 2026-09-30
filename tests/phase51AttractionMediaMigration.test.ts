import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const sql=readFileSync(resolve('supabase/migrations/20260929064156_phase51_attraction_media_foundation.sql'),'utf8');

describe('Phase 5.1 attraction media migration',()=>{
  it('models the required metadata and preserves a restricted operations write boundary',()=>{
    expect(sql).toContain('create table public.attraction_media_assets');
    for(const field of ['media_type','attraction_id','storage_path','original_filename','status','orientation','season','created_at','updated_at'])expect(sql).toContain(field);
    expect(sql).toContain("check (media_type in ('image','video'))");
    expect(sql).toContain("check (status in ('active','inactive'))");
    expect(sql).toContain("check (season in ('all-season','spring','summer','autumn','winter'))");
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('public.is_operations()');
  });
  it('uses narrowly-scoped RPCs so the passenger path can only obtain active media',()=>{
    expect(sql).toContain('create or replace function public.get_operations_attraction_media');
    expect(sql).toContain('create or replace function public.create_operations_attraction_media');
    expect(sql).toContain('create or replace function public.update_operations_attraction_media');
    expect(sql).toContain('create or replace function public.get_public_attraction_media');
    expect(sql).toContain("and m.status='active'");
    expect(sql).toContain("and a.status='published'");
  });
});
