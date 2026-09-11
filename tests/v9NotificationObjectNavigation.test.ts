import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest';
const app=readFileSync('src/app/App.tsx','utf8');
const sql=readFileSync('supabase/migrations/202609110127_notification_payload_owner_read.sql','utf8');
describe('V9 notification classification and object navigation',()=>{
  it('keeps message hub and object actions localized',()=>{
    for(const locale of ["'zh-CN'","'zh-TW'",'ja:','en:','es:','vi:','ne:','ko:'])expect(app).toContain(locale);
    expect(app).toContain('notificationHubCopy');
    expect(app).toContain('item.orderId');
    expect(app).toContain('/app/orders/${encodeURIComponent(item.orderId)}');
  });
  it('grants only the payload column without weakening row-level policy',()=>{
    expect(sql).toContain('grant select(payload)');
    expect(sql).not.toContain('disable row level security');
    expect(sql).not.toContain('using(true)');
  });
});
