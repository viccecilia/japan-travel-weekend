# 安全与容量内部基线（2026-08-26）

## 执行摘要

本次是工程内部基线，不等于独立第三方安全审查，也不定义正式业务容量。检查范围为 React/Vite/PWA 前端、Node HTTP 测试 API、Supabase/Stripe 适配层、依赖树与测试 VPS 运行时。未发现已证实的 Critical 或 High 风险；生产依赖 `npm audit --omit=dev` 为 0 项。测试 API 已补充安全响应头、请求体上限、请求超时、每连接请求上限和按会话材料摘要的固定窗口速率护栏。

受限容量脚本只访问批准的 `https://api-test.japan-travel.info/health`，硬限制最多 100 请求、并发最多 10，不触发数据库写入、Stripe 或翻译供应商。2026-08-26 的分级复测结果为：25 请求／并发 2（失败 0、中位 9 ms、P95 101 ms、最大 142 ms），50 请求／并发 5（失败 0、中位 13 ms、P95 77 ms、最大 112 ms），100 请求／并发 10（失败 0、中位 12 ms、P95 272 ms、最大 313 ms）。此前 25 次 dependency-aware readiness 探测同样失败 0。该结果只证明当前测试时刻、当前单实例和脚本硬上限内的工程基线，不是正式业务容量或 SLO。

## 已修复项目

### SEC-001 — API 缺少滥用与资源上限

- 严重度：Medium（已修复）
- 位置：`server/runtime.ts:18`、`server/runtime.ts:26`、`server/runtime.ts:33`，`server/security.ts:14`、`server/security.ts:23`
- 证据：Checkout 每会话材料 30 次／分钟，登车与翻译操作 60 次／分钟；请求体分别限制为 16 KB、64 KB 或 Stripe Webhook 1 MB；Node request/header/keep-alive timeout 均显式设置。
- 影响：原实现允许已登录或无效会话重复占用解析、认证与下游资源，且超大请求只返回模糊 500。
- 验证：远程测试连续 30 个超限请求均返回 413，第 31 个返回 429、`Retry-After: 59`，未访问支付或数据库写入流程。
- 限制：内存 limiter 只适合当前单实例测试 API；生产多实例必须改为边缘或共享存储限流，并由业务批准真实阈值。

### SEC-002 — API 缺少统一浏览器安全响应头

- 严重度：Low（已修复）
- 位置：`server/security.ts:4`、`server/runtime.ts:20`
- 证据：所有 JSON 与预检响应包含 `nosniff`、`DENY`、`default-src 'none'; frame-ancestors 'none'`、`no-referrer` 和禁用 camera/geolocation/microphone 的 Permissions Policy。
- 验证：测试 HTTPS API 实际响应头已读取并与配置一致。

### SEC-003 — 测试 Web 静态站点安全响应头

- 严重度：Medium（测试环境已关闭；正式环境仍需重新验证）
- 位置：`deploy/nginx/weekend-test-common.conf:5`–`10`
- 证据：2026-08-26 读取 `https://weekend.japan-travel.info/app` 的实际 HTTPS 响应，确认 `noindex,nofollow`、CSP、`DENY`、`nosniff`、`no-referrer` 和 Permissions Policy 均由 Nginx 返回。
- 限制：该证据只覆盖 noindex 测试站；未来正式域名、CSP 来源或托管方式变化后必须重新读取线上响应头，不得直接沿用本结论。

## 尚未关闭的项目

### SEC-004 — 独立安全审查与业务容量目标仍待外部确认

- 严重度：Release gate
- 证据：本次检查由项目实现代理执行，不具备独立性；也没有获批的同时在线人数、Checkout RPM、每车消息频率、位置更新频率和延迟 SLO。
- 下一步：业务批准目标后在测试环境逐级压测；另由独立审查者覆盖认证、RLS、越权、Webhook 重放、库存并发、二维码、文件、CORS、日志和秘密管理。发现 High/Critical 必须修复复测。

## 依赖与高风险前端用法检查

- `npm audit --omit=dev`：生产依赖 363 个，已知漏洞 0。
- 未发现 `dangerouslySetInnerHTML`、`innerHTML`、`document.write`、`eval`、`new Function` 或不受控 `postMessage`。
- 外部导航均使用固定 Google Maps URL 或受约束的应用来源，并为新窗口链接设置 `rel="noreferrer"`。
- `localStorage` 仅保存紧凑布局等 UI 偏好；生产账户会话由 Supabase 客户端管理，应用代码不自行持久化访问令牌。
- 浏览器环境变量契约只允许 publishable/anon key 和公开配置，服务端秘密被显式拒绝进入 `VITE_` 变量。

因此内部工程检查与当前脚本上限内的容量基线已经完成，但 `capacity_and_security_review` 仍保持 `test_pending`：独立安全审查和业务容量目标尚未批准，不得据此移除 noindex 或称为生产就绪。
