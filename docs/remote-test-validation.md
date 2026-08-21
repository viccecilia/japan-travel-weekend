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

四个虚构角色账户均已通过 Supabase Auth 真实登录。远程 RLS 读取结果如下，数字表示可见记录数：

| 角色 | 订单 | 私密协助 | 工作人员履约投影 | 车辆群 | 位置共享 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 订单本人 | 1 | 1 | 1 | 1 | 1 |
| 无关乘客 | 0 | 0 | 0 | 0 | 0 |
| 本车司机 | 0 | 0 | 1 | 1 | 1 |
| 运营人员 | 1 | 1 | 1 | 1 | 1 |

账户登录与上述 RLS 读取边界为 **PASS**。

### Trip Room 聊天

- Trip Room 为 `frozen` 时，订单本人写入普通消息被拒绝：PASS。
- 在事务内临时改为 `open` 时，订单本人可以写入；测试事务随后回滚：PASS。
- 无关乘客即使房间临时为 `open` 仍被拒绝；测试事务随后回滚：PASS。

以上验证的是数据库消息写入策略。Supabase Realtime WebSocket 实际广播、接收、断线重连仍为 **NOT RUN**。

### 私有 Storage

使用“订单本人 UUID／订单 UUID／测试文件”的授权路径上传新文件成功。读取结果：订单本人 `true`、无关乘客 `false`、本车司机 `false`、运营人员 `true`，结果为 **PASS**。

当前策略仅允许新对象 INSERT，没有 UPDATE 权限；对已有同名对象使用 `upsert` 会失败，这是当前预期限制。正式产品应优先使用不可变唯一文件名；若确需覆盖，必须另行设计受限 UPDATE policy、所有权校验和审计，不得直接放宽现有策略。

以下仍为 **NOT RUN**：Realtime WebSocket 实际收发，以及 Stripe 签名 Webhook 端到端联调。

## 库存阶段门

远程库存验证曾发现 `reserve_inventory` 的幂等重试查询存在 PostgreSQL 42702：`RETURNS TABLE` 输出变量 `order_id` 与 `inventory_locks.order_id` 裸列引用冲突。004 修复迁移已经在测试项目远程执行成功。

修复迁移为 `202608210004_fix_reserve_inventory_ambiguity.sql`，未修改已经执行的旧迁移。函数内订单、库存锁、Departure 和聚合列全部使用明确表别名，同时保留 trusted-service 限制、参数一致性、Departure 行锁、过期 hold、容量计算和幂等返回。

`supabase/verification/reserve_inventory_regression.sql` 已远程执行成功并回滚。该单事务回归验证第 1–6 席、精确满 6、第 7 席拒绝、相同参数返回相同订单/hold ID、同 key 参数不一致拒绝、零席、过期时间和关闭 Departure 边界。

另以两个独立 SQL 会话完成真实最后一席竞争：容量为 1；事务 A 成功预留并在持有 Departure 行锁期间等待后提交；事务 B 等待锁释放后以 `insufficient inventory` 被拒绝。没有超卖。单事务回归与双会话并发均为 **PASS**，库存阶段门为 **PASS**。

## 支付事件与补偿函数

`supabase/verification/payment_and_compensation_regression.sql` 已在远程测试项目成功执行并回滚。event ID 幂等、旧事件不回退新状态、有效 hold 成功后 committed + paid、过期或已释放 hold 的成功支付进入 `payment_review`、退款、`release_expired_inventory` 以及 `cancel_pending_order` 首次/重复调用边界均为 **PASS**。这只证明数据库函数行为；Stripe 签名、HTTP Webhook、事件对象提取和供应商投递仍为 **NOT RUN**。
