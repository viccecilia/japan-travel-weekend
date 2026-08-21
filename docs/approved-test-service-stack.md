# 已批准测试服务栈

本地与测试环境采用 Supabase + Stripe + Google Maps Platform。当前提交只提供迁移、接口、校验和测试替身；没有外部账户、凭证、远程迁移、真实收费或生产连接。

## Supabase

迁移位于 `supabase/migrations/202608210001_test_stack_foundation.sql`。应用顺序为：测试项目创建 → CLI 链接测试项目 → dry-run／差异审阅 → 执行迁移 → RLS 负面测试 → 导入无个人信息的测试目录数据。严禁先导入订单、乘客或位置数据。

安全修正迁移位于 `202608210002_security_and_compensation.sql`：auth.users trigger 只创建 passenger profile；客户端只有读权限和受控的本人显示名 RPC，不能更新 role 或直接写业务表。服务端事务 RPC 只授予 service_role，accountId 必须来自服务端已验证 session。原始辅助需求与工作人员履约投影分表，司机／司导不能读取儿童年龄或完整说明。私有 Realtime 通过 `realtime.messages` topic 策略授权；订单文件 bucket 为 private，路径首段必须是 auth.uid。

当前机器没有 Docker，因此 Supabase CLI 本地数据库启动、SQL 实际执行、RLS 越权查询和 Storage／Realtime policy 实测均为 **NOT RUN**。单元测试中的 SQL 检查只叫“静态迁移审计”；并发、幂等、迟到支付和权限可见字段由独立领域模型做本地行为测试，不能替代 PostgreSQL 集成测试。

成员与聊天修正迁移位于 `202608210003_vehicle_group_membership_and_chat.sql`。RLS 不再直接依赖可能被下层 RLS 阻断的关联查询，而通过固定 `search_path`、撤销 public/anon execute、仅授予 authenticated 的 membership helpers 判断。普通本车乘客可以接收私有群内容；Trip Room 只有 `open` 时，成员或本车工作人员才能发送普通聊天，`frozen` 与 `closed` 均拒绝。该规则已通过独立领域行为测试；真实 PostgreSQL 策略递归、Realtime 授权和写入测试仍为 **NOT RUN**。

浏览器只使用项目 URL 与 publishable/anon key；service role key 只进入服务端秘密管理器。私密辅助需求使用独立表和加密载荷；普通 Vehicle Group 查询不连接该表。位置只允许本人、运营和本车工作人员读取。

库存由 `reserve_inventory` 在锁定 departure 行后计算有效 hold；订单幂等键和库存锁幂等键均唯一。`release_expired_inventory` 过期释放，`cancel_pending_order` 取消待支付订单并释放，`apply_payment_event` 去重支付事件并提交库存。车辆分配继续读取已确认订单和履约需求，Sequential Fill 算法保持先填满 Vehicle 1，已满车辆不重排。

## Stripe 测试模式

只接受 `sk_test_` 前缀。Payment Intent 由服务端按订单金额创建，客户端状态不推进订单。Webhook 端点必须取得原始请求体，先调用 Stripe 官方验签，再以 event ID 去重并写入 `payment_events`。`payment_intent.*` 从 PaymentIntent metadata 取内部订单；`charge.refunded` 的对象是 Charge，必须用其 `payment_intent` 在服务端订单库反查，不能信任 Charge／Refund metadata。失败、取消、成功、退款分别映射；乱序事件按供应商事件时间和不可逆业务状态处理。

本地单元测试使用 Stripe 官方测试签名生成器，不发网络请求、不收费。测试 key 缺失或误填 live key 时适配器不可用。

## Google Maps Platform

浏览器 key 仅用于地图展示，必须同时限制允许的网站来源和具体 Maps API。服务端 key 独立保存，不进入 Vite。步行导航入口使用 Google Maps URLs，不携带 key；集合点没有已确认坐标时保持“待确认／地图未连接”。位置分享仍需用户主动授权、有效期和本车工作人员范围。

## 远程测试阶段门

1. 产品批准测试项目名称、区域和费用预算。
2. 管理员创建三个测试账户并开启预算告警，不创建生产项目。
3. 安全负责人把服务端秘密注入测试环境，开发者只取得最小权限。
4. 迁移 dry-run、RLS 负面测试、Stripe CLI webhook 转发和 Maps 来源限制逐项通过。
5. 使用虚构乘客和 Stripe 测试卡完成端到端验收。
6. 删除测试数据、轮换临时密钥并保存审计记录。
