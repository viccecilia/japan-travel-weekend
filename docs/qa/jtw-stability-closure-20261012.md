# JTW 前后端稳定性收口与三端完整验收

- 范围：Test only
- Test Supabase：`hzxoofvodpqpdomtmzlf`
- 开始基线：`6fda9e34acdde2fd4573571b86d0878e6e0fde87`
- 工作分支：`codex/stability-closure`
- Production：未访问 / 未部署 / 未写入 / 未使用 Live Stripe

状态只使用 `PASS`、`FAIL`、`BLOCKED`、`NOT_RUN`。实现但未完成规定验证的节点不得写为 `PASS`。

## Phase 0：基线与问题复核

| 编号 | 最新代码复核 | 根因/范围 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|---|
| 0.1 | GitHub 开发线、Test 前端及 API 均为 `6fda9e3`；API `mode=test` | 版本一致；`/ready` 因 `notificationReceiptSecret=false` 返回 503 | 本文件 | `GET /RELEASE_SHA`、`GET api-test.../health`、`GET api-test.../ready` | `6fda9e3` | FAIL |
| 0.2 | GitHub Actions run `38212661673`：application 与 database 均失败 | 应用 14 项失败；V7 财务 fixture 缺少 `policy_template_id` | 本轮候选已修复，等待新 SHA CI | 旧 run 与本地复现 | `6fda9e3` | FAIL |
| 0.3 | 本地全量测试复现并收口 | 14项失败已分类修复 | 相关实现与测试 | `npm test`：257 files / 1164 tests 全部通过 | 候选未提交 | PASS |
| 0.4 | migration 链更新为206个，lock为唯一权威清单 | restore manifest 双清单漂移 | `scripts/restore-preflight.mjs`、`supabase/migration-lock.json` | 隔离假目标 preflight：206 migrations verified | 候选未提交 | PASS |
| 0.5 | Test 实际 migration 版本 | 需通过受权 RPC 或 Test-only CLI 核对 | 无 | 尚未执行 | `6fda9e3` | NOT_RUN |
| 0.6 | 最新 Supabase breaking changes | Realtime schema 已锁定；不得修改 Realtime 内部对象 | 无 | Supabase 官方 changelog/docs | `6fda9e3` | PASS |

### 应用测试失败清单（基线）

1. `featuredRouteContent.test.ts`：数据库内容不完整时仍期待静态中文简介回退。
2. `growthPages.test.tsx`：两项可访问名称/标签断言已与当前文案漂移。
3. `productionCopy.test.tsx`：结账前置校验文案与旧“支付功能尚未开放”断言不一致。
4. `profileInvite.test.tsx`：2项，测试上下文缺少当前 UI locale。
5. `restoreManifest.test.ts`：2项，migration 数量仍锁定为168。
6. `restorePreflight.test.ts`：2项，同上。
7. `testFrontendDeployment.test.ts`：Nginx Test API 端口断言与现有配置不一致。
8. `v3bPublicationFlow.test.ts`：发布内容权威性断言匹配旧代码形态。
9. `vehicleInspectionPlaceholder.test.tsx`：占位提示断言与现有文案不一致。
10. `passengerUiPolish.contract.test.ts`：时间轴列数仍期待已废弃的第三列。

### V7 财务回归基线

`supabase/verification/v7_financial_convergence_regression.sql:50` 创建测试路线时未提供当前 schema 必填的 `policy_template_id`，因此在进入退款、佣金、通知幂等断言前即失败。

## Phase 1：游客预订链路

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 1A | 移除报名页旧30天截断并统一 departureId | `src/app/App.tsx` | 跨年、远期、同日多班次测试通过 | 候选未提交 | PASS |
| 1B | 加载、失败、空结果、旧数据刷新失败分离 | `src/app/store.tsx`、`src/app/App.tsx` | 缓存刷新失败保留旧数据；恢复重试测试通过 | 候选未提交 | PASS |
| 1C | 报名/报价/结账/登录/重试八语言错误映射 | `src/shared/i18n/passengerLocale.ts` | `bookingAvailabilityStates.test.tsx`及全量测试通过 | 候选未提交 | PASS |

## Phase 2：CI与数据库回归

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 2D | 14项应用测试逐项收口 | 相关实现与契约测试 | 257 files / 1164 tests 全通过 | 候选未提交 | PASS |
| 2E | V7 财务fixture适配当前政策模板 | `supabase/verification/v7_financial_convergence_regression.sql` | 本机无Docker，完整SQL未运行；必须由CI验证 | 候选未提交 | NOT_RUN |
| 2F | 必需发布门恢复 | `scripts/restore-preflight.mjs`等 | typecheck、build、build:server、diff-check通过；数据库CI待跑 | 候选未提交 | NOT_RUN |

## Phase 3：运行安全与更新保护

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 3G | 支付模式与 readiness 统一 | `server/paymentConfig.ts`、`server/runtime.ts`、`server/readiness.ts` | 无静默live降test；配置矩阵测试通过 | 候选未提交 | PASS |
| 3H | PWA 更新不打断操作 | `src/main.tsx`、`src/shared/pwaUpdate.ts`、`vite.config.ts` | 仅用户确认后激活；失败可重试；定向测试通过 | 候选未提交 | PASS |
| 3I | API 限流与可信代理 | `server/security.ts`、`server/runtime.ts`、Test Nginx配置 | 伪造XFF、无效token、账户隔离、回收测试通过 | 候选未提交 | PASS |

## Phase 4：工作人员现场功能

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 4J | 真实地图与持续更新 | `src/app/StaffPortal.tsx` | MapSurface、10秒/前台/联网重取、过期点过滤已实现；真实浏览器定位待验收 | 候选未提交 | NOT_RUN |
| 4K | 部分时段请假与任务冲突 | `src/app/staffLeave.ts`、StaffPortal、migration `20261012133709` | 半开区间、全天/部分、跨日/边界/未知结束时间测试通过 | 候选未提交 | PASS |
| 4L | 游客按订单小组展示 | `src/app/StaffPortal.tsx`、`src/styles.css` | 4+5人两订单、逐人操作、每单按需联系人测试通过 | 候选未提交 | PASS |

## Phase 5：通知发送与回执闭环

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 5M | outbox、Worker、provider、回执、重试完整闭环 | 无新增provider | 已有outbox/claim/retry/签名回执；未找到正式Test发送Worker入口、批准provider/测试收件目标；`notificationReceiptSecret`仍缺 | `6fda9e3`环境 | BLOCKED |

## Phase 6：三端集成验收与 Test 交付

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 6.1 | 冻结候选版本 | 待定 | 待执行 | 待定 | NOT_RUN |
| 6.2 | 隔离账号与班次 | 无 | 待执行 | 待定 | NOT_RUN |
| 6.3 | 三端完整业务链路 | 待定 | 待执行 | 待定 | NOT_RUN |
| 6.4 | 全量发布门 | 候选改动 | 本地test/typecheck/build/build:server/diff-check通过；数据库CI待跑 | 候选未提交 | NOT_RUN |
| 6.5 | 版本化 Artifact 与 Test 激活 | 待定 | 待执行 | 待定 | NOT_RUN |
| 6.6 | 发布后浏览器/接口回归 | 待定 | 待执行 | 待定 | NOT_RUN |

## 当前结论

`FINAL：NOT READY`。当前硬阻塞为 Phase 5 正式 Test 通知发送方、与其一致的回执 secret 及批准的测试收件目标缺失；数据库完整 reset/V7 回归需由 GitHub CI 执行，真实三端浏览器流程及 Test 发布后回归尚未开始。不得以本地模拟 adapter 或任意 secret 代替。
