import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609110118_autumn_route_media.sql','utf8');

describe('reviewed autumn route media publication',()=>{
  it('maps each reviewed photo to its matching attraction',()=>{
    expect(sql).toContain("when '贵船神社'");
    expect(sql).toContain('/images/routes/kifune/kifune-autumn-01.jpg');
    expect(sql).toContain("when '大原三千院'");
    expect(sql).toContain('/images/routes/sanzenin/sanzenin-autumn-01.jpg');
    expect(sql).toContain("when '岚山·渡月桥'");
    expect(sql).toContain('/images/routes/arashiyama-autumn/togetsukyo-autumn-01.jpg');
  });

  it('creates a new published revision without rewriting order snapshots',()=>{
    expect(sql).toContain("'published'");
    expect(sql).toContain("state='superseded'");
    expect(sql).not.toMatch(/update public\.order_snapshots/);
  });
});
