# Supabase 远程测试项目验证记录

本记录不包含项目 URL、project ref、账户、密码或 API key。

## 迁移结果

- `202608210001_test_stack_foundation.sql`：远程 SQL Editor 首次执行成功。
- `202608210002_security_and_compensation.sql`：完整文件执行成功。此前一次失败是网页 CodeMirror 只替换了可见尾部、与旧 SQL 拼接导致的事务语法错误；不是迁移文件自身语法错误。
- `202608210003_vehicle_group_membership_and_chat.sql`：远程 SQL Editor 执行成功。
- `202608210006_align_realtime_vehicle_group_chat.sql`：远程执行成功。该迁移不修改 003 helper；它严格解析 vehicle group topic 后直接调用 helper，避免 Realtime policy 再查询受 RLS 保护的业务表。只读策略验收返回 `SELECT authenticated` 接收策略与 `INSERT authenticated` 发送策略，helper 与 topic 解析边界均为 **PASS**。
- `202608210007_secure_boarding_credentials.sql`：远程执行成功。首次回归发现受限 `search_path` 下未限定 schema 的 `digest()` 无法解析；没有绕过安全边界。
- `202608210008_fix_boarding_digest_search_path.sql`：远程执行成功，以 `extensions.digest()` 修复 trusted verifier，同时保持受限 `search_path` 和原有最小执行权限。
- `202608250019_persistent_chat_attendance.sql`：远程执行成功。聊天发送改为每次请求重新检查房间状态与本车成员资格的 durable RPC；客户端改订阅 Postgres Changes，房间 frozen/open 切换不再要求离开并重新加入频道。新增乘客签到、工作人员点名、联系升级审计与集中时限配置。
- `202608260020_chat_translation_preferences.sql`：远程执行成功。新增个人翻译偏好、消息按目标语言缓存、原始语言与模板键；普通账户只能读写自己的偏好和本车可见译文，翻译上下文与缓存写入函数只授予 service role。

001–020 在该远程测试项目的适用迁移均已执行。它们是顺序、一次性迁移，不应重复粘贴执行。网页 SQL Editor 不作为仓库迁移账本；本次人工执行由本记录保存证据。新建 fresh project 时应按文件名顺序执行一次，之后运行验收脚本。未来自动化环境应改用 Supabase CLI migration ledger，避免人工重复执行。

020 结构验收返回 **PASS**：偏好表、译文缓存表、消息模板键、authenticated 偏好 RPC 以及两项 service-role-only 函数权限全部符合预期。虚构乘客账户登录后成功写入并读回日语偏好，RLS 查询只返回本人 1 行；验收结束后已恢复为跟随设备语言。Google Translation 计费适配器保持关闭，未产生翻译调用或费用。

测试 API 已部署翻译端点并完成边界验收：无会话请求返回 401，已登录但不可见的消息返回 403，本车可见消息在供应商关闭时返回 503 `translation_unavailable`。`/ready`、systemd 服务和本机监听端口均正常；服务端未配置翻译密钥，也未发生外部翻译调用。

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

以上数据库消息写入策略与后述 Realtime WebSocket 角色矩阵均已远程验证。

### 私有 Storage

使用“订单本人 UUID／订单 UUID／测试文件”的授权路径上传新文件成功。读取结果：订单本人 `true`、无关乘客 `false`、本车司机 `false`、运营人员 `true`，结果为 **PASS**。

当前策略仅允许新对象 INSERT，没有 UPDATE 权限；对已有同名对象使用 `upsert` 会失败，这是当前预期限制。正式产品应优先使用不可变唯一文件名；若确需覆盖，必须另行设计受限 UPDATE policy、所有权校验和审计，不得直接放宽现有策略。

Realtime 私有 WebSocket 已使用四个虚构角色完成远程验收：订单本人、本车司机和运营在开放房间重新加入频道后均订阅成功并收到广播；无关乘客加入被拒绝且未收到广播；冻结房间中本车三个授权角色可以订阅，但普通消息发送超时拒绝。测试结束后唯一测试 Trip Room 已恢复为 `frozen`，结果为 **PASS**。

019 已替代上述依赖频道加入时发送授权的旧实现。`supabase/verification/persistent_chat_attendance_acceptance.sql` 远程返回 **PASS**：客户端 Broadcast send policy 已移除，durable message RPC、签到 RLS、集中配置以及三张 Postgres Changes publication 表均存在。

四个虚构账户在同一批 WebSocket 连接上完成 frozen → open → frozen 验收：冻结时订单本人发送被拒；开放状态更新由原连接收到，订单本人 durable RPC 发送成功；同车乘客、司机和运营均在未重连情况下收到持久消息；再次冻结的状态更新仍由原连接收到，随后发送立即被拒。订单本人签到写入成功，订单本人仅见本单 1 名乘客，司机与运营见本车 1 名乘客，结果为 **PASS**。测试结束后 Trip Room 已恢复 `frozen`。

夹具审计发现原“无关乘客”账户当前已被分配进同一 Vehicle Group，membership helper 返回 true，因此它收到消息属于正确的同车权限，不能继续充当无关账户 WebSocket 夹具。使用事务内随机 authenticated 身份执行 `can_receive_vehicle_group` 拒绝验证并回滚，结果为 **PASS**；真正无关、已登录账户的 WebSocket 拒收复测为 **NOT RUN**，需要独立测试账户或解除现有测试关联后再执行。未擅自创建第五个云账户。

2026-08-25 浏览器测试卡验收为 **PASS**：虚构乘客从可售班次进入 Checkout，支付 100 JPY 后页面显示成功；数据库订单为 `paid`、库存锁为 `committed`，并记录 1 条成功 Stripe Webhook 事件。全程为 Stripe 测试模式，不产生真实费用。

### 旅行履约

011–013 已在测试项目执行。现有测试 Departure 使用第 1 辆 Alphard（6 客席），数据库核验为 5 booked／6 capacity、5 张本车订单、1 名已分配司机、1 条重要置顶消息，Trip Room 保持 frozen。虚构乘客浏览器可见集合时间、地址、车辆、步行导航和本车消息；虚构司机可见本车订单级返回／登车名单、最小化位置共享状态、特殊协助投影和八种模板。冻结状态下聊天、模板广播及标记登车均禁用。地图仅使用已确认集合坐标生成 Google Maps URL；司机 GPS、照片上传、机器翻译和外部通知仍未连接。

006 已运行只读且可重复的 `supabase/verification/realtime_vehicle_group_policy_acceptance.sql`，并完成上述虚构角色 WebSocket 验收。置顶履约信息继续从数据库读取，不依赖冻结期间 broadcast。

### 安全登车凭证

007 与 008 已在远程测试项目执行。`supabase/verification/boarding_credential_regression.sql` 使用现有虚构角色并在单一事务末尾回滚，验证签发边界、短摘要拒绝、乘客扫描拒绝、司机／导游／运营权限、首次有效扫码、幂等重试、幂等参数冲突、重复扫码、过期、撤销、错车、未知凭证隐私、原子更新和私有表／函数授权，结果为 **PASS**。数据库只保存 32-byte SHA-256 digest，不保存二维码明文。

014–016 已远程执行。浏览器使用虚构乘客签发一次性不透明凭证，再由本车虚构司机完成核验，结果为 **PASS**；数据库一度显示 boarded、1 次核验和 1 条 pending 通知。验收后已定向删除凭证、核验与通知测试记录，并把登车恢复为 not_issued、房间恢复为 frozen；只读复核为 credential 0、attempt 0、notification 0。该流程没有真实通知投递。

测试 API 已恢复为 systemd 受监督运行。`japan-travel-weekend-api.service` 为 enabled + active，由 systemd 管理的 Node 进程只监听 `127.0.0.1:18773`；Nginx HTTPS 健康检查返回测试模式、Supabase 与 Stripe 测试配置均正常。最近服务日志显示本次启动成功，无新的启动错误。

### 司机位置与通知生命周期

017、018 已在远程测试项目执行，结构验收返回司机位置表 1、位置函数 3、通知函数 2、authenticated 底层位置表授权 0、通知生命周期字段 5。虚构司机使用测试坐标发布 15 分钟位置，本车虚构乘客在正式中文 Trip Room 看到“步行寻找司机”和约 25 米测试精度；停止后入口立即隐藏。原“无关乘客”账户因后续测试订单已成为本车成员，因此负面测试改用事务内随机 authenticated 身份，读取结果为 0 行并整体回滚。

通知生命周期在事务内验证两条虚构事件：成功项为 delivered／attempts 1／锁释放，失败项为 pending／attempts 1／`provider-error`／锁释放，随后整体回滚。最终清理复核为 driver location 0 行、通知测试事件 0 行、Trip Room frozen；浏览器控制台错误 0。未连接外部通知供应商，未产生真实投递或费用。

## 库存阶段门

远程库存验证曾发现 `reserve_inventory` 的幂等重试查询存在 PostgreSQL 42702：`RETURNS TABLE` 输出变量 `order_id` 与 `inventory_locks.order_id` 裸列引用冲突。004 修复迁移已经在测试项目远程执行成功。

修复迁移为 `202608210004_fix_reserve_inventory_ambiguity.sql`，未修改已经执行的旧迁移。函数内订单、库存锁、Departure 和聚合列全部使用明确表别名，同时保留 trusted-service 限制、参数一致性、Departure 行锁、过期 hold、容量计算和幂等返回。

`supabase/verification/reserve_inventory_regression.sql` 已远程执行成功并回滚。该单事务回归验证第 1–6 席、精确满 6、第 7 席拒绝、相同参数返回相同订单/hold ID、同 key 参数不一致拒绝、零席、过期时间和关闭 Departure 边界。

另以两个独立 SQL 会话完成真实最后一席竞争：容量为 1；事务 A 成功预留并在持有 Departure 行锁期间等待后提交；事务 B 等待锁释放后以 `insufficient inventory` 被拒绝。没有超卖。单事务回归与双会话并发均为 **PASS**，库存阶段门为 **PASS**。

## 支付事件与补偿函数

`supabase/verification/payment_and_compensation_regression.sql` 已在远程测试项目成功执行并回滚。event ID 幂等、旧事件不回退新状态、有效 hold 成功后 committed + paid、过期或已释放 hold 的成功支付进入 `payment_review`、退款、`release_expired_inventory` 以及 `cancel_pending_order` 首次/重复调用边界均为 **PASS**。这只证明数据库函数行为；Stripe 签名、HTTP Webhook、事件对象提取和供应商投递仍为 **NOT RUN**。

## 银行转账人工审核

005 迁移已在远程测试项目执行成功。回滚式验收六项全部 **PASS**：首次转换成功、重复转换拒绝、订单状态为 `pending_manual_review`、anon 无 execute、authenticated 无 execute、service_role 有 execute。该状态只表示等待人工核账，不表示到账或支付成功；测试后端远程 API 仍未部署。
