# Japan Travel Weekend 上线前安全复核（2026-09-05）

## 执行摘要

本轮针对 React/Vite 游客端、工作人员端、运营端、Node API、Nginx 与 Supabase RLS 做了上线前内部复核。没有发现已确认的 Critical 或 High 级漏洞；依赖生产树 `npm audit --omit=dev --audit-level=high` 为 0。测试站点强制 HTTPS，并返回 CSP、`nosniff`、点击劫持、Referrer 与浏览器权限限制头。正式上线仍需独立审查者复核，尤其是生产 Stripe、Supabase 项目、日志与秘密管理；本报告不能替代日本法律专业审核。

## 已验证控制

- SEC-01（通过）：浏览器未打包 service-role、Stripe secret、Webhook secret、SMTP 密码或数据库加密密钥。只有受来源/API 限制的 Google 浏览器 key、Stripe publishable key 和 Supabase publishable key允许进入前端。
- SEC-02（通过）：`.env.*` 被 Git 忽略；版本库仅跟踪无凭证的 `.env.example`。
- SEC-03（通过）：认证使用 Supabase 会话与 `Authorization: Bearer`；敏感操作由服务端会话核验和数据库 RLS/RPC 再授权，前端角色显示不是最终权限边界。
- SEC-04（通过）：测试付款以服务端价格、库存锁、幂等键和已验签 Stripe Webhook 为权威；测试卡回归得到 paid 订单、committed 库存与单一 payment event。
- SEC-05（通过）：正式支付需要三重显式门禁：客户端 `VITE_STRIPE_MODE=live`、`VITE_LIVE_PAYMENTS_ENABLED=true` 与 `pk_live_`；服务端还要求 `JTW_STRIPE_MODE=live`、`NODE_ENV=production` 与 `sk_live_`。模式或密钥不匹配时失败关闭。
- SEC-06（通过）：司机只收到已付款且已分配到本人车辆的履约资料；普通游客看不到其他乘客联系方式、付款金额、证件、特殊需求或精确位置。
- SEC-07（通过）：登车凭证仅保存摘要，重复扫描返回 used；司机位置有时效并在停止共享或行程结束后不可读。
- SEC-08（通过）：跨域来源使用明确 allowlist；API 请求体有上限、状态变更端点有限速、错误响应不返回堆栈。
- SEC-09（通过）：页面未使用 `dangerouslySetInnerHTML`、`eval`、动态 Function 或非 UI 偏好的 localStorage 凭证存储。
- SEC-10（通过）：`returnTo` 经同站 `/app` 路径白名单处理；外部导航仅用于受控 Google Maps 和电话协议。

## 尚需外部收口

### SR-01 — 独立安全审查

- 严重性：上线阻塞（流程门禁，不是已发现漏洞）
- 证据：`docs/launch-gate-status.json` 的 `capacity_and_security_review` 仍为 `test_pending`。
- 影响：内部开发者复核不能替代独立人员对生产配置和运行环境的确认。
- 收口：由独立审查者复核认证/RLS、Webhook 重放、库存并发、文件、CORS、日志、备份和秘密轮换，并签署结果。

### SR-02 — 生产密钥与商户批准

- 严重性：上线阻塞
- 证据：测试环境仅配置 Stripe test key；代码不会自动开启 live。
- 影响：在公司 Stripe 审核和退款/争议责任人确认前，不能真实扣款。
- 收口：在秘密管理器中配置正式密钥、建立独立 live Webhook、先执行经用户单独确认的小额真实付款与全额退款。

### SR-03 — 法律文本与经营资料批准

- 严重性：上线阻塞
- 证据：法律页面仍标记为专业审核待完成，真实预订门禁保持关闭。
- 影响：工程实现正确不能证明旅行合同、取消规则、特商法披露或隐私留存符合实际经营主体要求。
- 收口：由日本合格专业人士和公司负责人确认最终文本、资质依据、合同主体、生效日期与版本。

### SR-04 — 实机与弱网验收

- 严重性：上线阻塞
- 证据：浏览器模拟已通过，但真实手机 GPS、相机/二维码、后台定位和弱网尚未签字验收。
- 影响：现场可能出现定位漂移、权限被拒绝、PWA 更新延迟或扫码失败。
- 收口：使用 iOS/Android 真机在清水寺、岚山完成路线、通知、扫码和断网恢复清单。

## 结论

工程内部安全基线通过，没有已确认的 High/Critical 代码问题。正式公开销售必须继续保持 `noindex` 与真实交易关闭，直至 SR-01 至 SR-04 均有可追溯的外部批准和实机证据。
