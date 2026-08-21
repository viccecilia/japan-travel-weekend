# 测试后端接线

## 浏览器边界

浏览器只允许 Supabase URL、publishable key 和 HTTPS API base URL。`ProductionBrowserServices` 提供登录、当前用户、本人订单读取和结账调用；Supabase RLS 继续约束直接读取。浏览器结账只向 `/v1/checkout` 发送 access token 与业务参数，不接触 service-role、Stripe secret 或数据库连接。

AppContext 接受可选 production services；没有公开配置时为 `null`，正式模式保持 fail closed。development/demo 继续使用本地 provider，不混入远程测试数据。

## 服务端结账边界

服务端先用 Supabase Auth 验证 Bearer token，并从验证结果推导 accountId；请求体不能指定 accountId 或支付金额。随后调用 service-role 库存 gateway 预留 15 分钟 hold。卡支付金额只能由服务端 pricing gateway 根据 Departure 和席数取得；价格未配置时取消订单、释放 hold 并 fail closed。

- 卡支付：仅 Stripe Standard 测试模式 gateway 可用时创建 Payment Intent；响应只返回客户端确认所需 client secret，不返回服务端 key。创建失败会取消待支付订单并释放 hold。
- 银行转账：不调用 Stripe，订单进入 `pending_manual_review`。005 迁移只允许 service-role 调用状态函数；人工核账前不得标记已支付。状态写入失败会取消订单并释放 hold。

005 已远程执行，首次/重复转换、状态和数据库 execute 权限六项回滚验收为 PASS。HTTPS 测试 API 尚未部署，因此浏览器到服务端的银行转账链路仍为 NOT RUN。

本实现不支持 Stripe Express/Connect 账户，也不读取商户数据或发起真实扣款。

## 外部凭证门

远程启动测试 API 仍需要由服务端秘密管理器提供 Supabase server secret/service-role 和 Stripe Standard test secret；这些值不得使用 `VITE_` 前缀。还需部署受控 HTTPS API runtime、执行 005 迁移、配置 Stripe 测试 Webhook secret，并完成 CORS、速率限制、审计和错误监控。以上均为 **NOT RUN**，当前自动测试使用依赖替身，不代表远程 API 已连接。
