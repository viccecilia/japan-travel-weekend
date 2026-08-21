# 真实服务接入准备

## 现状与缺口

现有端口覆盖 TravelRepository、AccountRepository、SessionRepository、AuthProvider、InventoryProvider、PaymentProvider、MapProvider、BoardingProvider、NotificationProvider；本准备包新增 RealtimeProvider 和统一生产配置校验。仍需真实实现：服务端 API 路由、数据库驱动与迁移执行器、安全 Cookie／CSRF、邮箱验证和密码恢复、支付签名回调、地图坐标解析、Vehicle Group 私有 realtime 鉴权、通知回执／退订、对象存储、审计日志、监控与备份恢复。

production 必须 fail closed：缺少任一能力配置时仅禁用该能力，不得回退到 memory、seed 或 local sandbox。配置齐全只说明可以开始连接，不代表供应商已验证或生产可用。

## 环境变量分类

客户端公开变量仅允许：

- `VITE_RUNTIME_MODE`：运行模式。
- `VITE_API_BASE_URL`：正式 API 的公开 HTTPS 基址。
- `VITE_ENABLE_SEED_DATA`：仅 development/demo 有效；production 始终禁止种子。

服务端非秘密选择项：`PAYMENT_PROVIDER`、`MAPS_PROVIDER`、`REALTIME_PROVIDER`、`NOTIFICATION_PROVIDER`。

服务端秘密：`DATABASE_URL`、`DATABASE_ENCRYPTION_KEY`、`SESSION_SIGNING_SECRET`、`PAYMENT_SECRET_KEY`、`PAYMENT_WEBHOOK_SECRET`、`MAPS_SERVER_KEY`、`REALTIME_SERVICE_KEY`、`NOTIFICATION_API_KEY`、`NOTIFICATION_WEBHOOK_SECRET`。这些名称和值都不得使用 `VITE_` 前缀，值不得进入前端 bundle、日志、截图、错误信息或 Git。

## 安全边界

- 密钥由服务端秘密管理器注入；开发、预发布、生产使用独立凭证和数据库。
- 至少每 90 天审查密钥；人员离职、疑似泄漏或供应商事件时立即轮换。支持双密钥重叠窗口和快速吊销。
- Webhook 先验证原始请求体签名、时间戳和允许的偏差，再用 provider event ID 建立幂等记录；事务提交后才返回成功。重复事件返回既有结果。
- 会话使用 Secure、HttpOnly、SameSite Cookie；实现 CSRF、防暴力尝试、设备撤销和账户级审计。
- 订单本人只能读本账户订单；运营角色按职责授权；司机／司导仅可读本车履约必要字段；普通 Vehicle Group 乘客不能读取其他家庭隐私。
- Realtime 频道必须私有，服务端校验 accountId、vehicleGroupId 和 Staff Assignment；连接成功不等于获得所有字段权限。

## 数据迁移顺序

1. 建立 accounts、sessions、roles 和 audit_events。
2. 导入 Trip，再导入 Departure；未确认运营字段保持空值。
3. 建立 bookings、passengers、passenger_assistance 和 orders，验证所有权及字段加密。
4. 建立 inventory_holds、payments、payment_events，验证唯一幂等键和事务。
5. 建立 vehicle_assignments、vehicle_groups、staff_assignments、trip_rooms、boardings。
6. 最后启用 realtime、通知和地图坐标；逐能力灰度，不一次性切换。

每步必须支持向前迁移、校验查询、只读回退和备份恢复演练。回滚优先关闭 feature flag 和写入口；数据迁移采用向后兼容的 expand／migrate／contract，不回滚已确认支付事实。

## 接入阶段门

本地契约测试 → provider sandbox → 预发布迁移 → 权限负面测试 → Webhook 重放／签名测试 → 备份恢复 → 小范围运营演练 → 法律与费用批准 → 生产只读 → 生产写入 → 移除 noindex。任何阶段失败即关闭该能力，不影响其他正式空状态。
