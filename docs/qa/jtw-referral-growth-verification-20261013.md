# JTW 路线邀请分享、推荐人次与 90 天优惠券规则 — 检测报告

检测日期：2026-10-13（JST）

被测 SHA：`76d111dbf996c993a3166472f19e68124ef4554a`

环境：Test / Supabase `hzxoofvodpqpdomtmzlf` / Stripe Test
最终结论：**FINAL：NOT READY**

## T01—T18

| ID | 结果 | 实际证据与说明 |
|---|---|---|
| T01 | PASS | 浏览器逐一打开 8 个 `lang`，卡片下拉值与路线标题均对应语言；Vitest 验证推荐码与链接语言保持。账户界面语言未被写入。 |
| T02 | BLOCKED | 公共邀请页与无效码降级已通过浏览器；未使用真实分享者 A 的有效码与独立未登录 B 做完整绑定。 |
| T03 | NOT_RUN | 浏览、班次、注册、邮箱验证、返回后的正式链路未执行；缺少本轮专用邮箱账号/验证凭证。 |
| T04 | NOT_RUN | 未以两个独立已登录 Test 用户验证既有 A 关系不被 C 覆盖及 B 生成自己的码。服务端不可覆盖约束与客户端白名单有代码/SQL覆盖。 |
| T05 | PARTIAL | 无效码浏览降级在 Test 浏览器 PASS；自荐与停用码未以正式账号端到端执行。 |
| T06 | PASS | 隔离事务 fixture 验证订单/席位独立口径、分组逐步从 2 到 4、同关系只生成 1 张普通推荐券；5 人正式 Test 支付未执行。 |
| T07 | PARTIAL | 拆分车辆组、免费/未完成、全退反转由 SQL fixture 和 migration 逻辑覆盖；正式部分退款接口未执行。 |
| T08 | PASS | SQL 回归覆盖 10 人次不自动 active、状态为 `content_pending`；Vitest 验证页面不可出现大使功能入口。 |
| T09 | PASS | 稳定 source event、唯一约束与 upsert 防止重复席位/券；CI database regression 通过。未做远程并发压力测试。 |
| T10 | PASS | SQL 回归实际断言新人券、推荐券 `expires_at - activated_at = interval '90 days'`；旧 24 小时触发入口被移除。 |
| T11 | PASS | migration 只更新 referral settings，不批量更新历史券；固定 source event/激活保护避免刷新续期；30 天活动券未被改写。 |
| T12 | NOT_RUN | 服务器时间/JST展示有代码路径；券预留、失败释放、付款核销及精确边界未以正式远程接口完成。 |
| T13 | PASS | SQL 保证现金资格时不发普通券，已有现金记录阻止普通券；既有规则版本与台账保留。 |
| T14 | PASS | fixture 证明 `staff_approval` 既有 active 资格经活跃刷新后仍保留；未修改 profiles 工作人员角色。 |
| T15 | PASS / CONTENT_PENDING | 正式内容默认未发布；10 人次只产生学习候选，不提供模拟通过按钮；运营激活受 passed/直授来源约束。正式题库未上线。 |
| T16 | PASS | SQL fixture 断言 60 天 `care_due`、90 天 `inactive`、新合资格事件恢复 `active`，且既有资格不被取消。 |
| T17 | PASS | 新表启用 RLS，只授予本人或 Operations 查询；anon/public 被 revoke；CI db lint 通过。未用两个真实家庭账号做越权浏览器测试。 |
| T18 | PARTIAL | Test 浏览器 360/390/430/1280 宽度均 `scrollWidth == clientWidth`；8 语言显示正常，Console 无 error/warning。系统分享取消及真实视频失败设备场景未实测。 |

## 自动化命令与结果

| 命令/检查 | 结果 |
|---|---|
| `npm ci` | PASS；npm audit 报告既有 2 moderate / 4 high，未自动升级依赖以避免扩大范围 |
| `npm test` | PASS：263 files / 1182 tests |
| focused Vitest | PASS：5 files / 16 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run build:server` | PASS |
| `npm run check:content` | PASS |
| `npm run check:launch` | PASS：Test、安全门锁定、noindex |
| 修改文件 ESLint | PASS |
| `git diff --check` | PASS |
| Test transaction rollback verifier | PASS：seats/learning/invitation/activity；事务已回滚 |
| CI database reset/lint/V7 regression | PASS |

CI：[run 38364151121](https://github.com/viccecilia/japan-travel-weekend/actions/runs/38364151121)

- application job：PASS
- database job：PASS
- head SHA：`76d111dbf996c993a3166472f19e68124ef4554a`

## 浏览器证据

- Test URL：`https://weekend.japan-travel.info/r/INVALID99/kyoto-nara-classic?lang=<locale>`
- 8 语言结果：`zh-CN`、`zh-TW`、`ja`、`en`、`ko`、`es`、`vi`、`ne` 均展示相应路线标题，未进入 NotFound。
- 无效码显示本地化警告，并保留“查看路线详情”；未显示虚假推荐已绑定/奖励到账。
- 360/390/430/1280 宽度：页面无横向溢出。
- Console：未捕获 error 或 warning。
- 既有截图：
  - `artifacts/referral-growth/invitation-360.png`
  - `artifacts/referral-growth/invitation-390-vi.png`
  - `artifacts/referral-growth/invitation-430-ja.png`
  - `artifacts/referral-growth/invitation-desktop-en.png`

注意：`document.documentElement.lang` 当前仍为站点默认 `zh-CN`，卡片内容和控件语言正确，但文档级语言元数据未随卡片语言更新；属于可访问性/SEO残余风险。

## 数据库与 Test 发布证据

- migration：`20261013071140_route_referral_growth_convergence`
- migration lock SHA256：`d26819f300b51815c29e1c791c5852e92a44036e1c5635c928dbc7820940e425`
- 应用脚本返回：`status=PASS`，project=`hzxoofvodpqpdomtmzlf`，result=`applied`；重跑识别为 `already_applied`。
- rollback verifier：`status=PASS`，fixture 在事务内执行并最终 rollback。
- Test release：`jtw-referral-growth-20261013-76d111d`
- Artifact SHA256：`a6dbf2c231f47aa1fa9cc4d02014e6241223888ec027c756a8257cfc866d04cc`
- 前端/API SHA：均为 `76d111dbf996c993a3166472f19e68124ef4554a`
- `/api/health`：200，`ok=true`、`mode=test`。
- `/api/ready`：503；database、stripeModeSafe、webhookSecret 为 true，既有 notificationReceiptSecret 为 false。

## Test fixture 与清理

- CI 使用本地隔离 Supabase 并执行 db reset。
- Test 项目验证脚本在单一事务中写入 fixture，`finally` 强制 rollback。
- 未创建运营班次、真实订单、真实提现或真实通知。
- 未使用 SQL 冒充正式 Test 支付/Webhook/邮箱验证验收。

## 残余风险与结论

阻塞/未运行：T02 正式有效码双浏览器、T03、T04、T12，以及 T05/T07/T18 的正式接口或真实设备部分。路线级动态初始 OG HTML 也未证明对无 JavaScript 抓取器有效。

因此：**FINAL：NOT READY**。代码和 Test 环境可供下一轮正式 E2E 验收，但尚不满足原任务的全部放行条件。

Production：**未访问 / 未部署 / 未写入 / 未使用 Live Stripe**。

---

## 第二轮验证（当前有效；上方保留第一轮历史）

被测/已部署应用 SHA：`196b4d8ee9cdd192723023b5c9fdb8f047cf545e`

Test Release：`jtw-referral-growth-round2-20261013-196b4d8`

Artifact SHA256：`d1d256cb32f4611cb2d798b33f0e6124a87f4b355d32b96b1a1c676e2d3c7c13`
CI：[38369894188](https://github.com/viccecilia/japan-travel-weekend/actions/runs/38369894188)（application/database PASS）

第二轮状态只使用 `PASS`、`BLOCKED`、`NOT_RUN`、`CONTENT_PENDING`；自动化覆盖与正式 E2E 分层记录，不再用 `PARTIAL` 混合结论。

| ID | 自动化/只读验证 | 正式远程 E2E | 当前结论 |
|---|---|---|---|
| T01 | 8 语言发布数据、初始 HTML、客户端切换与文档语言通过 | 浏览器英/日实测通过 | PASS |
| T02 | 无效码降级、有效码 RPC 约束覆盖 | 缺少 A/B 独立账号凭证 | BLOCKED |
| T03 | 回跳与归属代码/测试覆盖 | 邮箱注册、验证、返回链路未执行 | NOT_RUN |
| T04 | 不覆盖约束和白名单覆盖 | 缺少 A/B/C 独立账号凭证 | NOT_RUN |
| T05 | 无效码真实浏览器通过；自荐/停用码自动化覆盖 | 正式账号场景未执行 | BLOCKED |
| T06 | 5 席位、订单、账号、人次和唯一奖励 SQL 回归通过 | 真实 5 人 Stripe Test 支付未执行 | BLOCKED |
| T07 | 拆车、免费、未完成、全退反转回归通过 | 正式部分退款接口未执行 | BLOCKED |
| T08 | 10 人次仅 `content_pending`，不自动 active | 无需付款即可验证的规则已通过 | PASS |
| T09 | source event、唯一约束、upsert 与 CI 数据库回归通过 | 并发压力未单独执行 | PASS |
| T10 | 两类券精确 90 天与旧触发移除回归通过 | 无需额外远程 E2E | PASS |
| T11 | migration 未批改历史券；固定来源防续期 | 无需额外远程 E2E | PASS |
| T12 | 时间与状态转换代码覆盖 | 券预留、失败释放、成功核销和边界未执行 | NOT_RUN |
| T13 | 现金/普通券互斥和既有台账保护通过 | 无需额外远程 E2E | PASS |
| T14 | 既有直授 active 与 staff 角色保护通过 | 无需额外远程 E2E | PASS |
| T15 | 不可绕过和运营审核门禁通过 | 正式教材/题库未发布 | CONTENT_PENDING |
| T16 | 60/90 天状态与恢复回归通过 | 无需额外远程 E2E | PASS |
| T17 | RLS/revoke 与 CI lint 通过 | 两个真实家庭账号越权验证未执行 | BLOCKED |
| T18 | 响应式、8 语言、Console、爬虫 HTML/OG、缓存隔离通过 | 第三方真实发送/取消/多设备未执行 | BLOCKED |

### 分享 HTML 与发布内容证据

- 后台字段链路：中文 `content.description`；外语 `content.locales[locale].description`；公共页只读取 `list_public_product_catalog()` 的当前发布 revision。
- 8 个语言 `zh-CN/zh-TW/ja/en/ko/es/vi/ne` 均得到路线级初始 HTML、正确 `lang`、非空 OG description、canonical、`no-store`。
- 交叉请求 `CACHEA01/amanohashidate-ine/ja` 与 `CACHEB02/kyoto-nara-classic/en` 不串码；未知路线 `BAD99999/not-a-real-route/en` 返回 404。
- `kobe-arima-rokko` 当前只有中文详细介绍，英文真实浏览器按设计显示英文缺译说明，没有把中文正文当英文。
- 390px 英文截图：`artifacts/referral-growth/referral-round2-390-en.png`。
- 1280px 日文截图：`artifacts/referral-growth/referral-round2-desktop-ja.png`。

### 命令与发布检查

| 检查 | 第二轮结果 |
|---|---|
| `npm ci` | PASS |
| `npm audit` | PASS，0 vulnerabilities |
| focused Vitest | PASS，5 files / 18 tests |
| full Vitest 最终复跑 | PASS，264 files / 1189 tests |
| typecheck / build / build:server | PASS |
| check:content / check:launch | PASS |
| ESLint / `git diff --check` | PASS |
| CI database reset/lint/V7 | PASS |
| 前端/API SHA 与 mode | `196b4d8…` / `196b4d8…` / `test` |
| `/api/ready` | 503；仅既有 notificationReceiptSecret=false |

首次并行全量测试出现 3 个 timeout；失败文件隔离复跑及最终单 worker 全量复跑全部通过，因此记录为已复测通过，不隐藏首次失败。首次 Supabase 只读核对曾因猜测不存在的表/字段失败，查明真实 schema 后重跑成功；未执行数据库写入或 migration。

最终：**FINAL：NOT READY**。阻塞原因是正式邮箱、双账号、支付/Webhook/履约、退款、核券和第三方真实分享 E2E 缺少安全凭证与批准的测试对象。分享 HTML、Test 发布和自动化门禁本身已通过。

Production：**未访问 / 未部署 / 未写入 / 未使用 Live Stripe**。
