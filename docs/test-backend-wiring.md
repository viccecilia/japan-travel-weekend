# 测试后端接线

## 浏览器边界

浏览器只允许 Supabase URL、publishable key 和 HTTPS API base URL。`ProductionBrowserServices` 提供登录、当前用户、本人订单读取和结账调用；Supabase RLS 继续约束直接读取。浏览器结账只向 `/v1/checkout` 发送 access token 与业务参数，不接触 service-role、Stripe secret 或数据库连接。

各能力独立启用：`authAvailable`、`ordersAvailable`、`tripRoomAvailable` 和 `realtimeAvailable` 由 Supabase 公开客户端决定，`checkoutAvailable` 仅由 HTTPS API base URL 决定。只配置 Supabase URL/publishable key 时，用户仍可登录和按 RLS 读取本人订单；结账按钮明确禁用并显示服务未连接，不会让整个 App 一并失效。

AppContext 接受可选 production services；没有公开配置时为 `null`，正式模式保持 fail closed。development/demo 继续使用本地 provider，不混入远程测试数据。

## 服务端结账边界

服务端先用 Supabase Auth 验证 Bearer token，并从验证结果推导 accountId；请求体不能指定 accountId 或支付金额。随后调用 service-role 库存 gateway 预留 15 分钟 hold。卡支付金额只能由服务端 pricing gateway 根据 Departure 和席数取得；价格未配置时取消订单、释放 hold 并 fail closed。

- 卡支付：仅 Stripe Standard 测试模式 gateway 可用时创建 Payment Intent；响应只返回客户端确认所需 client secret，不返回服务端 key。创建失败会取消待支付订单并释放 hold。
- 银行转账：不调用 Stripe，订单进入 `pending_manual_review`。005 迁移只允许 service-role 调用状态函数；人工核账前不得标记已支付。状态写入失败会取消订单并释放 hold。

005 已远程执行，首次/重复转换、状态和数据库 execute 权限六项回滚验收为 PASS。HTTPS 测试 API 已部署，但浏览器到服务端的银行转账链路仍为 NOT RUN。

测试 API 在 `https://api-test.japan-travel.info` 提供 `/health`、`/v1/checkout` 与 `/v1/webhooks/stripe`。Node 服务只绑定 VPS 的 `127.0.0.1:18773`，由 Nginx 提供 HTTPS 并执行严格 Origin 检查；Webhook 使用原始请求体验签。009 迁移增加 `seat_price_jpy` 和受 service-role 限制的 Payment Intent 记录函数；未配置服务端票价时，卡支付保持关闭。

`scripts/verify-stripe-webhook.mjs` 使用虚构测试资料生成签名事件，验证 HTTPS、Stripe 验签、订单 paid、库存 committed、事件落库和重复投递幂等。该验收已在测试环境通过，不创建真实 Stripe 付款。

`scripts/verify-stripe-test-payment.mjs` 只接受 `sk_test_` 密钥，使用虚构 Supabase 账户和 Stripe 测试卡完成公开 HTTPS Checkout、100 日元测试 PaymentIntent、Stripe Webhook、订单 paid、库存 committed 与支付事件落库的完整验收。100 日元仅写入 `JTW RLS Test Trip` 技术测试班次，不代表正式商品定价；其他班次及正式路线仍保持待定价状态。

本实现不支持 Stripe Express/Connect 账户，也不读取商户数据或发起真实扣款。

## 公开客户端账户与 Trip Room

配置 Supabase URL 与 publishable key 后，正式中文界面通过公开客户端完成账户登录、会话恢复、当前角色读取、退出和本人订单读取。订单查询依赖 RLS；加载中、读取失败、无订单和有订单均有独立状态。公开配置缺失时界面明确显示服务不可用，绝不回退到开发种子或本地演示订单。

Trip Room 先读取当前账户可访问的房间与历史消息，再订阅该车辆群的私有 Realtime channel。发送入口同时要求数据库房间状态为 `open` 且实时连接为已连接；`frozen`、`closed`、连接中或断线均禁用并显示中文原因。成员资格和实际消息写入仍由数据库 RLS 终审。司机、司导和运营只读取工作人员履约投影，不读取乘客私密原始协助数据。

以上前端状态门、缺配置 fail closed 和适配器边界已通过本地自动测试。使用真实虚构账户进行浏览器登录、远程订单读取、WebSocket 收发、断线重连及角色入口验收仍为 **NOT RUN**，不能据此声称远程 Realtime 已连接。

## 外部凭证门

本机与 VPS 私密配置已连接 Supabase service-role、Stripe Standard test secret 和测试 Webhook secret；Stripe 只读检查确认 `livemode=false`，签名 Webhook 端到端验收为 PASS。仍需配置经业务确认的服务端票价，并完成浏览器 Checkout、速率限制、审计和错误监控；在此之前不得声称用户支付链路已完成。
