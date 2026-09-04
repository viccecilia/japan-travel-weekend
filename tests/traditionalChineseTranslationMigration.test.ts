import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609040063_traditional_chinese_chat_translation.sql','utf8');
describe('繁体中文聊天翻译',()=>{
  it('偏好、读取上下文和缓存写入均接受六种语言',()=>{
    expect((sql.match(/'zh-TW'/g)??[]).length).toBeGreaterThanOrEqual(5);
    expect(sql).toContain('update_own_chat_translation_preference');
    expect(sql).toContain('get_message_translation_context');
    expect(sql).toContain('store_message_translation');
  });
  it('乘客翻译上下文仍限已付款或已确认订单',()=>{
    expect(sql).toContain("o.status in ('paid','confirmed')");
  });
});
