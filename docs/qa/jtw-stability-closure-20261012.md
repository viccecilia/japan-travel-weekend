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
| 0.1 | 开始时 GitHub 开发线、Test 前端及 API 均为 `6fda9e3`；API `mode=test` | 版本一致；`/ready` 因 `notificationReceiptSecret=false` 返回 503 | 本文件 | `GET /RELEASE_SHA`、`GET api-test.../health`、`GET api-test.../ready` | `6fda9e3` | FAIL |
| 0.2 | 旧 run `38212661673` 的 application/database 失败已收口 | 应用14项失败；财务fixture与当前政策、增长及派车schema漂移 | 本轮实现、fixture及向前migration | GitHub Actions run `38259558729` application/database全绿 | `bb2bee6` | PASS |
| 0.3 | 本地全量测试复现并收口 | 14项失败已分类修复 | 相关实现与测试 | 本地257 files / 1164 tests；CI同SHA全量通过 | `bb2bee6` | PASS |
| 0.4 | migration链更新为207个，lock为唯一权威清单 | restore manifest双清单漂移 | `scripts/restore-preflight.mjs`、`supabase/migration-lock.json` | CI空库重建207个migration及DB lint通过 | `bb2bee6` | PASS |
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
| 1A | 移除报名页旧30天截断并统一 departureId | `src/app/App.tsx` | 跨年、远期、同日多班次测试通过 | `91d62bb` | PASS |
| 1B | 加载、失败、空结果、旧数据刷新失败分离 | `src/app/store.tsx`、`src/app/App.tsx` | 缓存刷新失败保留旧数据；恢复重试测试通过 | `91d62bb` | PASS |
| 1C | 报名/报价/结账/登录/重试八语言错误映射 | `src/shared/i18n/passengerLocale.ts` | `bookingAvailabilityStates.test.tsx`及全量测试通过 | `91d62bb` | PASS |

## Phase 2：CI与数据库回归

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 2D | 14项应用测试逐项收口 | 相关实现与契约测试 | CI同SHA全量test/typecheck/build/build:server/content/launch通过 | `bb2bee6` | PASS |
| 2E | 财务fixture适配当前政策、完整履约及派车schema；修复提现中/已支付退款追偿 | verification、新migration `20261012145500` | CI空库完整执行，退款、佣金冲回/追偿、通知幂等断言到末尾通过 | `bb2bee6` | PASS |
| 2F | 必需发布门恢复 | `scripts/restore-preflight.mjs`等 | GitHub Actions run `38259558729` application/database全部通过 | `bb2bee6` | PASS |

## Phase 3：运行安全与更新保护

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 3G | 支付模式与 readiness 统一 | `server/paymentConfig.ts`、`server/runtime.ts`、`server/readiness.ts` | 无静默live降test；配置矩阵测试通过 | `91d62bb` | PASS |
| 3H | PWA 更新不打断操作 | `src/main.tsx`、`src/shared/pwaUpdate.ts`、`vite.config.ts` | 仅用户确认后激活；失败可重试；定向测试通过 | `91d62bb` | PASS |
| 3I | API 限流与可信代理 | `server/security.ts`、`server/runtime.ts`、Test Nginx配置 | 伪造XFF、无效token、账户隔离、回收测试通过 | `91d62bb` | PASS |

## Phase 4：工作人员现场功能

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 4J | 真实地图与持续更新 | `src/app/StaffPortal.tsx` | MapSurface、10秒/前台/联网重取、过期点过滤已实现；真实浏览器定位待验收 | `91d62bb` | NOT_RUN |
| 4K | 部分时段请假与任务冲突 | `src/app/staffLeave.ts`、StaffPortal、migration `20261012133709` | 半开区间、全天/部分、跨日/边界/未知结束时间测试通过 | `91d62bb` | PASS |
| 4L | 游客按订单小组展示 | `src/app/StaffPortal.tsx`、`src/styles.css` | 4+5人两订单、逐人操作、每单按需联系人测试通过 | `91d62bb` | PASS |

## Phase 5：通知发送与回执闭环

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 5M | outbox、Worker、provider、回执、重试完整闭环 | 无新增provider | 已有outbox/claim/retry/签名回执；未找到正式Test发送Worker入口、批准provider/测试收件目标；`notificationReceiptSecret`仍缺 | `6fda9e3`环境 | BLOCKED |

## Phase 6：三端集成验收与 Test 交付

| 编号 | 节点 | 修改文件 | 验证/证据 | Commit/SHA | 状态 |
|---|---|---|---|---|---|
| 6.1 | 冻结候选版本 | GitHub开发线 | CI绿色业务候选已冻结 | `bb2bee6` | PASS |
| 6.2 | 隔离账号与班次 | 无 | 待执行 | 待定 | NOT_RUN |
| 6.3 | 三端完整业务链路 | 待定 | 待执行 | 待定 | NOT_RUN |
| 6.4 | 全量发布门 | 候选改动 | run `38259558729`：application/database均PASS，0 failed/0 skipped门禁 | `bb2bee6` | PASS |
| 6.5 | 版本化 Artifact 与 Test 激活 | 待定 | 待执行 | 待定 | NOT_RUN |
| 6.6 | 发布后浏览器/接口回归 | 待定 | 待执行 | 待定 | NOT_RUN |

## 当前结论

`FINAL：NOT READY`。应用与数据库发布门已在同一候选 SHA 全绿；当前硬阻塞仍为 Phase 5 正式 Test 通知发送方、与其一致的回执 secret 及批准的测试收件目标缺失。真实三端账号浏览器流程及 Test 发布后回归尚未完成，不得以本地模拟 adapter、任意 secret 或单元测试代替。
