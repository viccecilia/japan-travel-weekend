import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609140145_idempotent_journey_completion_replay.sql','utf8');

describe('V12 完团重试边界',()=>{
  it('先按操作者、幂等键和事件类型返回既有结果，再拒绝其他已完成请求',()=>{
    const replay=sql.indexOf("idempotency_key=p_idempotency_key and event_type=v_event");
    const completed=sql.indexOf("v_state.status='completed'");
    expect(replay).toBeGreaterThan(0);
    expect(completed).toBeGreaterThan(replay);
    expect(sql).toContain("'trip_completed'");
  });
});
