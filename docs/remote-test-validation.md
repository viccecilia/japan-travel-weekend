# Supabase 远程测试项目验证记录

本记录不包含项目 URL、project ref、账户、密码或 API key。

## 迁移结果

- `202608210001_test_stack_foundation.sql`：远程 SQL Editor 首次执行成功。
- `202608210002_security_and_compensation.sql`：完整文件执行成功。此前一次失败是网页 CodeMirror 只替换了可见尾部、与旧 SQL 拼接导致的事务语法错误；不是迁移文件自身语法错误。
- `202608210003_vehicle_group_membership_and_chat.sql`：远程 SQL Editor 执行成功。

三份迁移在该远程测试项目的结构执行结果为 **PASS**。它们是顺序、一次性迁移，不应重复粘贴执行。网页 SQL Editor 不作为仓库迁移账本；本次人工执行由本记录保存证据。新建 fresh project 时应按文件名顺序执行一次，之后运行只读验收脚本。未来自动化环境应改用 Supabase CLI migration ledger，避免人工重复执行。

## 只读结构验收

运行 `supabase/verification/remote_structure_acceptance.sql`。脚本只读系统目录和 Storage bucket 元数据，可重复运行；先返回计数，再在关键对象不足时抛出 `FAIL` 异常。

已取得的远程结果：public tables 17、RLS tables 17、public policies 15、Realtime policies 2、Storage policies 3、security functions 4、auth triggers 1、private buckets 1。结构验收为 **PASS**。

## 行为联调状态

以下仍为 **NOT RUN**：虚构账户注册与登录、RLS 越权、Vehicle Group Realtime 收发、冻结群聊天拒绝、私有 Storage 上传与越权读取、库存并发最后一席、库存锁过期补偿，以及 Stripe Webhook 远程联调。结构存在不代表这些行为已通过。
