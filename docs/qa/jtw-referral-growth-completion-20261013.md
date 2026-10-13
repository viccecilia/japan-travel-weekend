# JTW 路线邀请分享、推荐人次与 90 天优惠券规则收口 — 完成报告

日期：2026-10-13（JST）

Classification：INSPECT → IMPLEMENT → AUTOMATED VERIFY → TEST RELEASE → REPORT
最终结论：**FINAL：NOT READY**

> 本结论不是代码或部署失败。实现、数据库 migration、CI、Test artifact 和 Test 激活均已完成；但原任务规定的正式接口端到端验收未全部执行，不能以构建、SQL fixture 或 HTTP 200 代替。

## 1. 本轮确认并落地的规则

- 指标严格拆分为：新注册人数（账号）、推荐订单数（订单）、有效付费人次（合资格完成的付费席位）、奖励券数量与现金奖励金额（独立台账）。
- 一张 5 人家庭订单仍是 1 个账号、1 张订单；5 个合资格完成席位计 5 个有效付费人次，不拆成 5 张订单或 5 个账号。
- 有效人次增加不扩大已批准的发券张数：同一推荐关系/首笔合资格订单的普通推荐人奖励券保持唯一来源约束。
- 新人旅行券与普通推荐奖励券均在各自正式触发点激活，期限为精确 90 天；不批量修改其他活动券或历史券。
- 达到 10 个有效付费人次只进入 `content_pending` / 学习资格，不自动成为推广大使。
- 正式教材、题目和答案未获批准，本轮只交付占位、权限和不可绕过边界，未发布旧草案。
- 60/90 天活跃状态与现金资格、认证、链接、提现能力分离；暂未活跃不会取消既有资格或推荐码。
- 已有大使、司机/导游、公司直授资格和已形成奖励不因本 migration 自动取消。

## 2. 已完成内容

### 2.1 路线邀请页与推荐归属

- 新增 `/r/:code` 与 `/r/:code/:slug` 路线邀请入口。
- 邀请页支持简中、繁中、日、英、韩、西、越、尼 8 种卡片语言；切换语言不改推荐码。
- 页面优先展示路线，推荐码无效时仍允许浏览路线，但隐藏会造成虚假归属的注册动作。
- 路线、语言、有效班次和推荐来源只以白名单字段写入 `sessionStorage`，不接受任意跳转地址。
- 注册/登录回跳复用捕获的路线与推荐来源；服务端 RPC 才是推荐码有效性的权威。
- 未知路线 slug 不再回退到无关路线。
- 分享取消不提示成功；不支持视频分享时使用封面、文案和链接降级。

### 2.2 有效付费席位与奖励生命周期

- 新增 `referral_qualified_seats`，以乘客、订单、推荐关系及实际履约证据去重记录有效付费席位。
- 仅 `paid` 且已登车、车辆组行程完成的席位进入有效人次；拆分车辆组按实际完成部分计数。
- 免费、取消、未完成及全额退款席位不计；全退可反转有效席位并冻结/失效关联奖励。
- 普通推荐券与现金奖励互斥；已有现金资格不会同时生成普通推荐券。
- 移除旧的付款后/24 小时激活路径，普通推荐奖励在正式完成条件满足后激活。
- 新人券规则版本：`referral-newcomer-90d-v1`。
- 普通推荐券规则版本：`referral-completed-90d-v1`。

### 2.3 学习资格与活跃状态

- 新增 `referral_learning_eligibilities`、`referral_certification_config`、`ambassador_activity_states`。
- 10 人次时写入学习候选和 `content_pending`，不自动写入 active/approved。
- 运营审核只允许既有直授来源，或未来正式学习状态为 `passed` 后激活。
- 60 天关怀、90 天暂未活跃、存在首单已付款待出行时保持 active、后续合资格完成后恢复 active。

### 2.4 页面与后台口径

- 推荐成长页分别展示账号数、订单数、有效付费人次和奖励券。
- 大使中心显示真实有效人次进度；10 人次但内容未发布时只显示“学习认证内容正在准备中”。
- 分享者面板根据普通券/现金资格显示对应规则，不混淆两类奖励。

## 3. 主要修改文件

- `src/app/RouteInvitation.tsx`
- `src/app/routeInvitation.css`
- `src/app/routeInvitationCopy.ts`
- `src/shared/referralAttribution.ts`
- `src/app/GrowthPages.tsx`
- `src/app/AmbassadorCenter.tsx`
- `src/app/AuthPages.tsx`
- `src/router/Router.tsx`
- `src/shared/integrations/supabaseProduction.ts`
- `src/shared/backend/productionServices.ts`
- `supabase/migrations/20261013071140_route_referral_growth_convergence.sql`
- `supabase/verification/route_referral_growth_regression.sql`
- `scripts/apply-referral-growth-test.mjs`
- `scripts/verify-referral-growth-rollback.mjs`
- 相关 Vitest 测试与 `artifacts/referral-growth/` 截图。

提交：

- `f62eba44d5b82fe8a4d4c614694eee7747ae157e` — 功能实现
- `76d111dbf996c993a3166472f19e68124ef4554a` — 保留既有调度分配唯一约束的修复

GitHub：`origin/codex/referral-growth` 与 `origin/feature/production-app-foundation` 均指向 `76d111d…`。

## 4. Test 发布基线

- Release ID：`jtw-referral-growth-20261013-76d111d`
- Artifact：`jtw-referral-growth-20261013-76d111d.tar.gz`
- Artifact SHA256：`a6dbf2c231f47aa1fa9cc4d02014e6241223888ec027c756a8257cfc866d04cc`
- Frontend SHA：`76d111dbf996c993a3166472f19e68124ef4554a`
- API SHA：`76d111dbf996c993a3166472f19e68124ef4554a`
- mode：`test`
- Test Supabase：`hzxoofvodpqpdomtmzlf`
- migration：`20261013071140_route_referral_growth_convergence`
- Test 当前软链接：`/var/www/jtw-test-releases/jtw-referral-growth-20261013-76d111d`
- 回滚：release 目录保留 `ROLLBACK_FROM`；API 安装流程保留 `.server-dist.before-<release-id>` 与环境备份。

重复执行安装器时出现的 `INSTALL_FAILED exit=1` 是防覆盖检查 `test ! -e "$release"` 拒绝重复安装；当前 Test 已是目标 SHA，没有发生回滚。交互脚本已改为先检测当前 SHA，已激活时直接报告成功。

## 5. 已验证结果摘要

- CI run [38364151121](https://github.com/viccecilia/japan-travel-weekend/actions/runs/38364151121)：application 与 database 均 PASS。
- 全量 Vitest：263 个文件、1182 个测试通过。
- 本轮 focused：5 个文件、16 个测试通过。
- `npm run typecheck`、`npm run build`、`npm run build:server`、`npm run check:content`、`npm run check:launch`、ESLint、`git diff --check`：通过。
- CI 隔离 Supabase：`db reset`、`db lint --level error`、V7 financial regression：通过。
- Test transaction rollback fixture：席位、学习、邀请 RPC、活跃状态检查通过且回滚。
- 浏览器：邀请页 8 种语言均显示对应路线文案；无效码不阻断路线浏览。
- 响应式：360/390/430/1280 CSS px 均无页面横向溢出。
- `/api/health`：`ok=true`、`mode=test`、前后端版本一致。

## 6. 范围边界与历史保护

- 未发布正式认证题库；状态为 **CONTENT_PENDING**。
- 未把有效人次转换为同数量奖励券。
- 未扩展到老客后续每次复购均累计。
- 未批量改写历史券 `expires_at`，未追发历史奖励，未撤销既有大使资格。
- 未新增通知供应商；`notificationReceiptSecret` readiness 缺口保持原状。
- 未进行真实第三方社交发帖或验证所有平台的视频卡片播放能力。
- 初始分享 HTML 仍为 SPA 静态壳；运行时会更新元信息，但未证明所有无 JavaScript 抓取机器人都获得路线级动态 OG 数据。

## 7. 真正未完成/阻塞项

以下属于原任务规定的必需正式验收，当前没有足够凭证或不应通过 SQL 伪造，因此不能标记 PASS：

1. 两个独立新游客账号的邮箱验证与回跳归属。
2. 一张真实 Stripe Test 5 人订单：正式支付 → Webhook → 正式履约完成 → 人次/奖励读回 → 重新登录一致。
3. 正式退款接口案例对人次与奖励的分别调整。
4. 券预留、失败释放、付款成功核销及精确到期边界的远程正式接口验收。
5. 已绑定 A 后打开 C 链接不覆盖，以及 B 登录后生成本人码的双账号浏览器验收。
6. 第三方实际发送、接收及用户取消的多设备验证。
7. 路线级动态初始 OG/爬虫 HTML 的服务端或预渲染能力。
8. `/api/ready` 为 503，唯一未就绪项为既有 `notificationReceiptSecret=false`；数据库、Stripe Test 安全模式和 Webhook secret 均正常。

## 8. 放行结论

**FINAL：NOT READY**

已完成部分可以继续在 Test 供人工验收；在上述正式 E2E 与退款/核券边界完成前，不能写“TEST SCOPE VERIFIED”。

Production：**未访问 / 未部署 / 未写入 / 未使用 Live Stripe**。

---

## 9. 第二轮收口（2026-10-13，替代本报告中有关分享 HTML 与当前发布基线的旧结论）

第二轮没有改写上面的历史记录；本节是当前有效结论。原报告所列“路线级动态初始 OG/爬虫 HTML 未证明”和“文档级语言未同步”已修复并实测，不再属于残余风险。

### 9.1 已完成

- 邀请页主介绍改为读取后台正式发布的“详细介绍”：中文来源为 `product_revisions.content.description`，其他语言为 `product_revisions.content.locales[locale].description`。
- 首次 HTTP 响应已按路线、语言生成 `title`、description、Open Graph、canonical 与 `<html lang>`；只读取当前已发布的公共目录，不读取草稿，也不使用广告文案替代详细介绍。
- 未翻译语言显示该语言的安全缺译说明，不借用中文正文。当前 `kobe-arima-rokko` 的 7 个外语详细介绍缺失，已按这一规则降级。
- `/r/` 的 Test Nginx 路由已接入服务端分享 HTML；响应使用 `no-store`，不同推荐码、路线和语言之间未发现缓存串线。
- 客户端切换卡片语言后，同步更新文档语言、页面标题与详细介绍；切换语言不会重建媒体节点或改变推荐码。
- 依赖漏洞以最小升级收口，最终 `npm audit` 为 0；未使用 `--force`，未引入 migration。

### 9.2 当前应用提交与 Test 发布

- 应用 Commit：`196b4d8ee9cdd192723023b5c9fdb8f047cf545e`
- GitHub：`origin/codex/referral-growth` 与 `origin/feature/production-app-foundation` 均已包含该提交。
- CI：[run 38369894188](https://github.com/viccecilia/japan-travel-weekend/actions/runs/38369894188)，application/database 均 PASS。
- Release ID：`jtw-referral-growth-round2-20261013-196b4d8`
- Artifact：`jtw-referral-growth-round2-20261013-196b4d8.tar.gz`
- Artifact SHA256：`d1d256cb32f4611cb2d798b33f0e6124a87f4b355d32b96b1a1c676e2d3c7c13`
- Frontend/API SHA：均为 `196b4d8ee9cdd192723023b5c9fdb8f047cf545e`
- mode：`test`
- 当前软链接：`/var/www/jtw-test-releases/jtw-referral-growth-round2-20261013-196b4d8`
- `/api/health`：200，`ok=true`、`mode=test`、版本一致。
- `/api/ready`：503；database、stripeModeSafe、webhookSecret 为 true，唯一缺口仍是既有 `notificationReceiptSecret=false`。

### 9.3 验证结果

- 全量 Vitest 最终单 worker 复跑：264 files / 1189 tests PASS。首次并行全量运行有 3 个 timeout，失败文件隔离复跑与最终全量复跑均通过，无断言失败。
- focused：5 files / 18 tests PASS。
- `npm ci`、`npm audit`、typecheck、build、build:server、check:content、check:launch、ESLint、`git diff --check`：PASS。
- 8 个语言的真实爬虫 HTTP 请求均返回 200、正确语言与路线级 OG，且 `x-jtw-share-render=published-route-v1`、`cache-control=no-store, max-age=0`。
- 不同路线/推荐码测试互不串线；未知路线返回 404。
- 390px 英文与 1280px 日文真实浏览器检查通过；390px `scrollWidth == clientWidth`，Console 0 error / 0 warning。
- 日文切换后 `<html lang="ja">`、标题和详细介绍同步；英文缺译路线显示英文缺译状态，不回退中文正文。
- 截图：`artifacts/referral-growth/referral-round2-390-en.png`、`artifacts/referral-growth/referral-round2-desktop-ja.png`。

### 9.4 第二轮仍未完成的正式验收

本轮没有可用的两个新游客邮箱凭证、Stripe Test 支付凭证、批准的测试收件箱或可安全变更的专用 Test 产品，因此没有绕过正式接口用 SQL 冒充以下流程：邮箱验证、A/B/C 双账号归属、5 人真实支付/Webhook/履约、退款、核券、第三方真实发送接收。Gate A 的专用产品草稿保存→发布也未执行，以避免修改现有运营内容。

当前结论仍为 **FINAL：NOT READY**；原因是正式业务 E2E 未完成，而不是应用构建、Test 发布或分享 HTML 失败。Production 仍为：**未访问 / 未部署 / 未写入 / 未使用 Live Stripe**。

---

## 10. 邀请卡 V2 续接收口（2026-10-14）

本节继续第二轮，不重建推荐系统。既有已发布详细介绍读取、OG/语言/缓存隔离、推荐人次、90 天券与资格占位均保留。

### 10.1 代码与体验结果

- 邀请卡按 V2 参考收口：语言选择进入媒体右上角，去掉顶部空白；视频、长标题、详细介绍和原生控制条互不重叠。
- `/r/:code` 为路线目录；`/r/:code/:slug` 聚焦单卡。
- 景点摘要仅汇总 attraction 节点；天桥立样板完整显示天桥立、智恩寺文殊堂、伊根舟屋。
- 同一个有效班次同时提供价格、集合点和 `departureId`，未写死生产示例值。
- 推荐核验中、有效、无效/停用、网络失败、不符合新人条件分别展示；只有有效状态显示条件性新人券文案。
- 修复桌面全局 section padding 压窄卡片内容；修复二维码异步生成在组件卸载后回写导致 CI unhandled rejection。

主要续接文件：`src/app/RouteInvitation.tsx`、`src/app/routeInvitation.css`、`src/app/routeInvitationCopy.ts`、`src/shared/integrations/supabaseProduction.ts`、`src/app/AmbassadorCenter.tsx`、`tests/routeInvitation.test.tsx`，以及本报告、检测 JSON 和四张脱敏截图。

提交：

- `4aab770082cd9b9f7a5ef6b064e815a5281bf92f` — 邀请卡 V2、真实班次/景点与推荐状态收口
- `16bf099dba6c8cea682bdebf8a64dae1997eeb8b` — 桌面卡片宽度修正
- `9eb91849bc533a11763e50f1e017b01a4a6a743c` — CI 捕获的二维码卸载后异步回写修复

### 10.2 最终 Test 发布

- Release ID：`jtw-referral-invitation-v2-final-20261014-9eb9184`
- Artifact SHA256：`26ab72d19151218fec013d084f396c0fbf3e2ff11842978d668b08c53d66adac`
- CI：[38486828996](https://github.com/viccecilia/japan-travel-weekend/actions/runs/38486828996)，application/database PASS。
- Frontend/API SHA：均为 `9eb91849bc533a11763e50f1e017b01a4a6a743c`；`mode=test`；Nginx API upstream 为 `127.0.0.1:18773`。
- Test Supabase：`hzxoofvodpqpdomtmzlf`；本续接未新增 migration。
- `/api/ready` 唯一既有缺口仍是 `notificationReceiptSecret=false`。

### 10.3 实际浏览器证据

- 390px 中/英文、桌面日文与无效码中文截图均已入库；卡片无横向溢出，桌面不再逐字换行。
- 视频真实加载并播放；切换语言后推荐码和班次不变。
- 三个实际景点完整；有效码与无效码优惠状态一致且不伪造承诺。
- 8 语言初始 HTML/OG/no-store、未知路线 404、Console 0 error/0 warning 均通过。

截图：`artifacts/referral-growth/invitation-v2-final-390-zh.png`、`invitation-v2-final-390-en.png`、`invitation-v2-final-desktop-ja.png`、`invitation-v2-final-390-invalid-zh.png`。

### 10.4 正式验收结论

邮箱验证与回跳、A/B/C 归属不覆盖、正式 5 人 Stripe Test 支付/Webhook/履约、正式退款、券预留/释放/核销、双家庭账号越权和批准渠道私密分享仍缺必要的真实账号会话或用户批准对象，未以 SQL 或模拟状态伪造。

因此视觉与发布单项为 PASS，但整体仍为 **FINAL：NOT READY**。正式题库保持 **CONTENT_PENDING**。

Production：**未访问 / 未部署 / 未写入 / 未使用 Live Stripe**。
