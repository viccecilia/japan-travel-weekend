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

## 邀请卡 V2 视觉与发布收口（2026-10-14，当前有效）

被测/已部署应用 SHA：`9eb91849bc533a11763e50f1e017b01a4a6a743c`

Test Release：`jtw-referral-invitation-v2-final-20261014-9eb9184`

Artifact SHA256：`26ab72d19151218fec013d084f396c0fbf3e2ff11842978d668b08c53d66adac`

CI：[38486828996](https://github.com/viccecilia/japan-travel-weekend/actions/runs/38486828996)（application/database PASS；264 files / 1193 tests PASS）

### 视觉、内容与状态验证

- `/r/:code` 保留 8 条路线目录；`/r/:code/:slug` 只展示单张邀请卡，不在底部重复路线目录。
- 语言选择位于媒体右上角；卡片顶部旧占位已清除。390px 实测卡片宽 390px、媒体/正文宽 388px，`scrollWidth=viewport=390`。
- 桌面实测卡片宽 390px、媒体/正文宽 388px；修复了全局 `main > section` 桌面 padding 把卡片内容压窄的问题。
- 视频实测 `readyState=4`、原生 controls 开启并持续播放；长标题、详细介绍和播放控件不再互相覆盖。
- 主文案只读取当前已发布的对应语言详细介绍并只显示一次；天桥立样板只汇总实际景点：天桥立、智恩寺文殊堂、伊根舟屋。
- 价格与出发地点来自同一 `departureId`；语言切换后详情/注册链接继续携带相同的脱敏 Test 推荐码与班次 ID。
- 有效码显示“来源已核验”和新人券条件；无效码只显示无效/停用提示，不显示确定性领券文案或注册领券按钮。核验中、网络失败和不符合新人条件另有独立状态及自动化覆盖。
- 8 个语言初始 HTML 均为 200、正确 `<html lang>`、非空路线级 OG、`x-jtw-share-render=published-route-v1`、`cache-control=no-store, max-age=0`；未知路线为 404。
- 有效码、无效码与路线目录的浏览器 Console 均为 0 error / 0 warning。

截图：

- `artifacts/referral-growth/invitation-v2-final-390-zh.png`
- `artifacts/referral-growth/invitation-v2-final-390-en.png`
- `artifacts/referral-growth/invitation-v2-final-desktop-ja.png`
- `artifacts/referral-growth/invitation-v2-final-390-invalid-zh.png`

### 自动化、发布和环境一致性

- focused Vitest：2 files / 12 tests PASS。
- CI 全量 Vitest：264 files / 1193 tests PASS；typecheck、build、build:server、content、launch、数据库 reset/lint/V7 regression 均 PASS。
- 前端 SHA、API 环境 SHA、内网 `/health` 和公网 `/api/health` 均为 `9eb91849bc533a11763e50f1e017b01a4a6a743c`，`mode=test`。
- Nginx `/api/` 上游为 `127.0.0.1:18773`；构建指纹为 Test Supabase `hzxoofvodpqpdomtmzlf`、Stripe Test、`live_payments=false`、`seed_data=false`。
- `/api/ready` 仍为 503；database、stripeModeSafe、webhookSecret 为 true，唯一既有缺口为 `notificationReceiptSecret=false`。
- 首次 V2 桌面截图暴露卡片内部被全局 padding 压窄，已修复；随后 CI 捕获二维码异步任务卸载后回写，已加入生命周期取消保护。最终 CI 及 Test SHA 均以 `9eb9184` 为准。

### T02—T18 正式 E2E 状态

| ID | 当前结论 | 当前正式状态 |
|---|---|---|
| T02 | BLOCKED | 有效/无效公开页已实测；仍缺 A/B 独立邮箱账号完成正式绑定。 |
| T03 | NOT_RUN | 缺可实际收信、验证并回跳的独立新账号会话。 |
| T04 | NOT_RUN | 缺 A/B/C 三个独立登录会话验证归属不覆盖与 B 自有码。 |
| T05 | BLOCKED | 无效码实测通过；自荐和停用码仍缺正式账号场景。 |
| T06 | BLOCKED | 自动化 5 席口径通过；未创建正式 5 人 Stripe Test 订单。 |
| T07 | BLOCKED | 自动化退款反转通过；未获准对正式 Test 订单执行部分退款。 |
| T08 | PASS | 自动化确认 10 人次只进入 `content_pending`，不会自动激活大使资格。 |
| T09 | PASS | source event、唯一约束、upsert 和数据库回归保持通过；正式重复回调将在主案例付款后读回。 |
| T10 | PASS | 新人券、推荐券精确 90 天及旧触发移除已有自动化证据。 |
| T11 | PASS | 历史券不批量改写、固定来源不因刷新续期已有自动化证据。 |
| T12 | NOT_RUN | 只有代码/自动化覆盖；正式券预留、付款失败或超时释放、成功付款核销及远程边界尚未执行。 |
| T13 | PASS | 现金/普通券互斥和既有台账保护已有自动化证据。 |
| T14 | PASS | 既有直授资格与工作人员角色保护已有自动化证据。 |
| T15 | CONTENT_PENDING | 正式题库仍未发布，不用草案或模拟通过代替。 |
| T16 | PASS | 60/90 天状态及恢复回归保持通过。 |
| T17 | BLOCKED | RLS/lint 通过；缺两个真实家庭账号做浏览器越权验证。 |
| T18 | BLOCKED | 本轮视觉、语言、视频和异常码浏览器验收通过；批准渠道的私密发送/接收/取消与多设备仍未执行。 |

开始正式 E2E 所需最小人工动作见下方“5＋3＋2 条件预检”。不得在聊天粘贴秘密，也未用 SQL 伪造邮箱、付款、登车、完成或奖励。

因此整体仍为 **FINAL：NOT READY**。视觉单项及 Test 发布为 PASS；正式业务 E2E 未完成，不降低原验收标准。

Production：**未访问 / 未部署 / 未写入 / 未使用 Live Stripe**。

### 5＋3＋2 条件预检（2026-10-14）

本节只做只读预检，没有创建账号、班次、订单，没有付款、退款、履约完成或外部分享。

不依赖远程账号的定向回归已复跑：`routeInvitation`、推荐归属、推荐增长 migration、推荐券、完成奖励、退款截止与券核销共 7 files / 26 tests，全部 PASS。

| 验收节点 | 已有条件 | 还缺什么 | 用户需要完成的最小动作 |
|---|---|---|---|
| 应用与环境 | 预检起始 GitHub `feature/production-app-foundation` 与上一份报告提交均为 `8b3db461…`；Test 前端/API 均为应用 SHA `9eb91849…`、`mode=test`；Supabase 为 `hzxoofvodpqpdomtmzlf` | 无版本漂移；当前浏览器 Service Worker 仍显示旧页面版本 `76d111db…`，已提示有新版待更新 | 正式验收前保存其他页面工作后点击“现在更新”，再核对页面版本为 `9eb91849…` |
| A/B/C/D/E 账号与独立会话 | Chrome 中存在已授权 Operations 会话 `s_pang@daitora-jp.com` | 没有已验证可复用的普通游客 A、三名新游客 B/C/D、第二推荐人 E 的独立账号与隔离浏览器会话；A 的初始人次/资格也未读回 | 准备 A/B/C/D/E 的 Test 邮箱；只在各自可见浏览器中登录或收取验证码，不在聊天粘贴密码、Token 或验证码 |
| 邮箱验证与回跳 | 注册、验证和回跳代码/自动化已有覆盖 | 未证明 B/C/D 的新邮箱能实际收信并完成验证；未证明验证后回到原推荐路线 | 指定三个可实际收信的新游客 Test 邮箱，并在收到邮件后完成验证链接操作 |
| Stripe Test / Webhook | `/api/ready` 显示 `stripeModeSafe=true`、`webhookSecret=true`；现有自动化已覆盖 Test PaymentIntent/Webhook | 当前工作区没有加载 Stripe/Supabase 测试密钥；本轮没有获批创建三张 Test 订单、确认 Test 支付和后续退款 | 明确批准三张 `5＋3＋2` Stripe Test 订单，以及另一个独立退款/核券异常案例；只使用 Stripe Test 卡 |
| 专用 Test 路线/班次 | `ROUTE-STUDIO-V1-QA · Test Only` 的 10/20 08:30 班次为 open、¥100、0 已付款、0 锁定、销售容量 8；有可用的 9 席和 6 席 Test 车辆 | 单一班次容量 8，无法容纳三单合计 10 席；还没有为 5、3、2 三阶段分别确认的三个可售班次、车辆组和完成时点 | 批准新建/选定三个 Test-only 班次并分配 Test 车辆组；每个阶段只在其实际允许的销售、开群和履约时点推进 |
| 登车与行程完成 | 已有 Operations 会话可进入正式调度与运行页面；Test 中存在隔离司机资源 | 现有隔离司机资源在后台提示未绑定登录账号；尚未指定由 Operations 会话还是获准工作人员账号执行登车/完成 | 指定一个获准执行正式 Test 登车和完成的账号；若使用现有 Operations 会话，只需确认该范围，不提供秘密 |
| 退款与核券 | 自动化已覆盖退款收敛、90 天规则和幂等 | T12 正式预留/释放/核销、正式部分/全额退款尚未执行；不能拿主案例退款后仍宣称 10 人达标 | 优先批准一个独立异常订单做退款与核券；若必须动主案例，先保存 0/5/8/10 完整证据 |
| 家庭权限隔离 | RLS/revoke、数据库 lint 已通过 | 没有两个独立家庭游客账号做正式浏览器越权检查 | B、C 登录后分别检查自己的订单、联系人和奖励，不共享会话 |
| 私密分享 | 分享页、链接、语言与异常码视觉已通过 | 没有获准的私密渠道、接收人/设备及接收确认 | 指定一个私密接收目标和渠道；发送前另行确认，取消分享单独验证 |

#### 待批准执行方案

- 检查点按 `0 → 5 → 8 → 10` 顺序保存，不事后补造中间截图。
- A 初始必须为 0 人次且无既有大使、司机/导游或公司直授资格；不重置真实账号历史。
- B/C/D 分别使用 5、3、2 席订单，付款、Webhook、正式配车、登车、行程完成后才累计。
- 每阶段保存页面截图、正式接口读回、脱敏订单/履约事件、推荐人次、券来源与数量及应用 SHA，并重新登录 A 排除前端缓存。
- E 只用于验证 B 已绑定 A 后不可覆盖；B 生成自己的推荐链接时必须使用 B 自己的码。
- 正式题库继续为 `CONTENT_PENDING`；10 人次只验证学习资格，不自动激活大使或现金资格。

当前结论：条件预检完成，正式 `5＋3＋2` 尚未获批执行，**FINAL：NOT READY**。

---

## 第二轮验证（历史基线；上方邀请卡 V2 小节为当前有效）

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
