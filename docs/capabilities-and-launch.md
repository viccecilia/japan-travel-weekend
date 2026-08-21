# 地图、登车、通知与上线门禁

地图、登车验证和通知通过独立 adapter 接入。已确认集合点坐标可直接使用无需 API key 的 Google Maps URL 打开步行导航；这不等于 Maps API 或实时地图已连接。司机位置只有在真实坐标存在、行程有效且本车权限成立时才生成入口。没有正式服务端签发和验证不生成有效 Boarding Pass；没有通知供应商配置不发送外部消息。

登车凭证契约使用不透明、256 位随机量、可撤销且一次性 token，二维码不得编码订单 ID、邮箱、电话或其他个人资料。原始 token 仅在签发时返回一次，服务内部只保存 SHA-256 摘要；核验、撤销和幂等指纹均使用摘要，结果与错误不得回显 token。服务端核验状态为 valid、used、expired、revoked、wrong-vehicle；扫描请求需要本车工作人员授权和幂等键。本地实现不包含生产秘密。

007 数据库迁移新增私有凭证表和核验审计表。凭证表只保存 32 字节 token digest 与版本；审计表只保存请求指纹 digest、扫描者、车辆群组、结果、核验时间和 90 天保留期限。`verify_boarding_credential` 仅允许 service role/Postgres 调用，使用幂等 advisory lock 与凭证行锁：同一幂等请求返回原结果，不同参数拒绝；不同幂等键并发扫描同一凭证时只有首笔为 valid。乘客仅通过安全视图读取本人登车状态，看不到 digest 或核验审计。

远程执行 007 后运行 `supabase/verification/boarding_credential_regression.sql`，验证 driver、guide、operations、无权乘客、五种结果、幂等冲突、重复扫描和 grants。脚本在末尾回滚。真实并发门还需两个独立 SQL 会话同时核验同一未使用凭证，预期一个 valid、一个 used；007 尚未远程执行，该并发验证为 **NOT RUN**。

通知契约覆盖订单确认、待转账、集合信息变更、Trip Room 开放、发车前提醒、延误和登车完成。必要履约通知与可选通知偏好分离；provider 不可用时 fail closed，事件 ID 防止重复投递。本轮不连接任何外部通知供应商。

`validateLaunch` 把 API、数据库、认证、支付、地图、通知、法律文本、运营配置和 noindex 作为发布门禁。任何一项未满足时不得称为生产已就绪，也不得移除 noindex。
