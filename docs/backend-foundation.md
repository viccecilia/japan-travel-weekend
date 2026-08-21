# 后端与真实账户基础

前端通过 `BackendGateway`、`AuthProvider`、`AccountRepository` 和 `SessionRepository` 接入账户能力。development/demo 使用仅限本地的内存 provider，密码只以摘要形式存在，会话为 8 小时不透明令牌且不写入 localStorage；刷新后本地账户和会话消失。

production 默认使用 `unavailable-production`，账户写入和登录必须明确失败为“正式账户服务尚未连接”，绝不能回退到内存 provider。正式接入需要提供 API 基址、数据库、服务端密码散列（建议 Argon2id）、安全 HttpOnly/SameSite Cookie、CSRF 防护、速率限制、邮箱验证、密码重置、会话撤销、审计与数据保留政策。

数据库迁移应至少包含 accounts、sessions、orders、passengers、passenger_assistance、departures、vehicle_assignments、vehicle_groups、staff_assignments、trip_rooms 和审计表。迁移由后端事务执行，当前前端仓库不伪装已拥有生产数据库。
