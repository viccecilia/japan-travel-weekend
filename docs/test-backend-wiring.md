# 测试后端接线

## 浏览器边界

浏览器只允许 Supabase URL、publishable key，以及 HTTPS API base URL 或本地开发同源代理路径。`ProductionBrowserServices` 提供登录、当前用户、本人订单读取和结账调用；Supabase RLS 继续约束直接读取。浏览器结账只向 `/v1/checkout` 发送 access token 与业务参数，不接触 service-role、Stripe secret 或数据库连接。本地验收使用 Vite `/api-test` 反向代理，代理固定指向测试 API 并重写为已批准的测试来源；正式构建不依赖该开发服务器代理。

各能力独立启用：`authAvailable`、`ordersAvailable`、`tripRoomAvailable` 和 `realtimeAvailable` 由 Supabase 公开客户端决定，`checkoutAvailable` 仅由 HTTPS API base URL 决定。只配置 Supabase URL/publishable key 时，用户仍可登录和按 RLS 读取本人订单；结账按钮明确禁用并显示服务未连接，不会让整个 App 一并失效。

AppContext 接受可选 production services；没有公开配置时为 `null`，正式模式保持 fail closed。development/demo 继续使用本地 provider，不混入远程测试数据。

## 服务端结账边界

服务端先用 Supabase Auth 验证 Bearer token，并从验证结果推导 accountId；请求体不能指定 accountId 或支付金额。随后调用 service-role 库存 gateway 预留 15 分钟 hold。卡支付金额只能由服务端 pricing gateway 根据 Departure 和席数取得；价格未配置时取消订单、释放 hold 并 fail closed。

- 卡支付：仅 Stripe Standard 测试模式 gateway 可用时创建 Payment Intent；响应只返回客户端确认所需 client secret，不返回服务端 key。创建失败会取消待支付订单并释放 hold。
- 银行转账：不调用 Stripe，订单进入 `pending_manual_review`。005 迁移只允许 service-role 调用状态函数；人工核账前不得标记已支付。状态写入失败会取消订单并释放 hold。

005 已远程执行，首次/重复转换、状态和数据库 execute 权限六项回滚验收为 PASS。HTTPS 测试 API 已部署，但浏览器到服务端的银行转账链路仍为 NOT RUN。

测试 API 在 `https://api-test.japan-travel.info` 提供 `/health`、`/ready`、`/v1/checkout`、`/v1/boarding/issue`、`/v1/boarding/verify`、`/v1/webhooks/stripe` 与 `/v1/webhooks/notifications`。`/health` 只证明进程存活；`/ready` 实际读取 Supabase 配置表，并要求 Stripe 测试密钥、Stripe Webhook secret 和至少 32 字符的通知回执 secret，任一失败即返回 503，响应不包含密钥值。Node 服务只绑定 VPS 的 `127.0.0.1:18773`，由 Nginx 提供 HTTPS并执行严格 Origin 检查；Webhook 使用原始请求体验签。通知供应商接收请求只记为 `submitted`，只有签名回执才能转为 `delivered` 或 `failed`；后台仅展示最小异常投影，人工重试必须填写原因并写入审计。登车接口先验证 Bearer 会话，签发只返回一次原始 token，核验要求工作人员权限与幂等键。009 迁移增加 `seat_price_jpy` 和受 service-role 限制的 Payment Intent 记录函数；未配置服务端票价时，卡支付保持关闭。

`scripts/verify-stripe-webhook.mjs` 使用虚构测试资料生成签名事件，验证 HTTPS、Stripe 验签、订单 paid、库存 committed、事件落库和重复投递幂等。该验收已在测试环境通过，不创建真实 Stripe 付款。

`scripts/verify-stripe-test-payment.mjs` 只接受 `sk_test_` 密钥，使用虚构 Supabase 账户和 Stripe 测试卡完成公开 HTTPS Checkout、100 日元测试 PaymentIntent、Stripe Webhook、订单 paid、库存 committed 与支付事件落库的完整验收。100 日元仅写入 `JTW RLS Test Trip` 技术测试班次，不代表正式商品定价；其他班次及正式路线仍保持待定价状态。

浏览器付款使用 Stripe Payment Element，前端只接受公开的 `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`，服务端秘密仍只保存在 VPS。第 010 号迁移提供 `list_sellable_departures()`：只返回已发布、开放且已定价的班次，并在数据库内扣除已提交库存和未过期占位。前端首页、选班次、核对价格与支付因此共用服务端权威数据；没有测试公钥、API、账户会话或可售班次时均关闭付款，不降级为模拟成功。

本实现不支持 Stripe Express/Connect 账户，也不读取商户数据或发起真实扣款。

## 公开客户端账户与 Trip Room

配置 Supabase URL 与 publishable key 后，正式中文界面通过公开客户端完成账户登录、会话恢复、当前角色读取、退出和本人订单读取。订单查询依赖 RLS；加载中、读取失败、无订单和有订单均有独立状态。公开配置缺失时界面明确显示服务不可用，绝不回退到开发种子或本地演示订单。

Trip Room 先读取当前账户可访问的房间与历史消息，再订阅该车辆群的私有 Realtime channel。发送入口同时要求数据库房间状态为 `open` 且实时连接为已连接；`frozen`、`closed`、连接中或断线均禁用并显示中文原因。成员资格和实际消息写入仍由数据库 RLS 终审。司机、司导和运营只读取工作人员履约投影，不读取乘客私密原始协助数据。

以上前端状态门、缺配置 fail closed 和适配器边界已通过本地自动测试。四个虚构账户的浏览器登录、远程订单读取、WebSocket 收发、房间状态切换及角色入口已经远程验收；019 的持久聊天和签到结果见 `remote-test-validation.md`。真正无关且已登录的第五账户 WebSocket 负面复测仍未执行，现有随机 authenticated 身份数据库负面测试不能替代它。

## 外部凭证门

本机与 VPS 私密配置已连接 Supabase service-role、Stripe Standard test secret 和测试 Webhook secret；Stripe 只读检查确认 `livemode=false`。2026-08-25 已用虚构乘客和 Stripe 官方测试卡完成浏览器 100 日元支付：支付结果页、本人订单详情、Webhook 事件、订单 `paid` 与库存 `committed` 均为 PASS。该结论仅适用于测试环境；正式票价、速率限制、审计、错误监控和生产支付批准仍未完成。
