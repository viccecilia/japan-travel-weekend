# 安全与容量内部基线（2026-08-26）

## 执行摘要

本次是工程内部基线，不等于独立第三方安全审查，也不定义正式业务容量。检查范围为 React/Vite/PWA 前端、Node HTTP 测试 API、Supabase/Stripe 适配层、依赖树与测试 VPS 运行时。未发现已证实的 Critical 或 High 风险；生产依赖 `npm audit --omit=dev` 为 0 项。测试 API 已补充安全响应头、请求体上限、请求超时、每连接请求上限和按会话材料摘要的固定窗口速率护栏。

受限容量脚本只访问批准的 `https://api-test.japan-travel.info/health`，硬限制最多 100 请求、并发最多 10，不触发数据库写入、Stripe 或翻译供应商。基线实际为 50 请求／并发 5／失败 0／中位 27 ms／P95 420 ms／最大 1079 ms；随后 25 次 dependency-aware readiness 探测失败 0。该结果只证明当前测试时刻的低流量健康基线。

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

## 尚未关闭的项目

### SEC-003 — 正式 Web 静态站点 CSP／边缘响应头尚无运行时证据

- 严重度：Medium（上线阻塞）
- 位置：`index.html:1`；正式静态托管配置不在本仓库内。
- 证据：HTML 当前保持 `noindex,nofollow`，仓库内没有正式静态站点的 header 配置。API 的 CSP 不能证明 Web 页面 CSP。
- 影响：若正式站点边缘没有 CSP、clickjacking、nosniff 与 Referrer Policy，浏览器缺少纵深防御。
- 修复：确定正式静态托管后，以响应头配置与 Stripe/Supabase/Maps 实际来源兼容的 CSP，先报告模式验证，再强制执行并读取线上响应头。
- 误报说明：现有服务器或 CDN 可能另行设置；目前没有正式产品 URL 的权威响应证据，因此不能判定已通过。

### SEC-004 — 独立安全审查与业务容量目标仍待外部确认

- 严重度：Release gate
- 证据：本次检查由项目实现代理执行，不具备独立性；也没有获批的同时在线人数、Checkout RPM、每车消息频率、位置更新频率和延迟 SLO。
- 下一步：业务批准目标后在测试环境逐级压测；另由独立审查者覆盖认证、RLS、越权、Webhook 重放、库存并发、二维码、文件、CORS、日志和秘密管理。发现 High/Critical 必须修复复测。

因此 `capacity_and_security_review` 继续保持 `test_pending`，不得据此移除 noindex 或称为生产就绪。
