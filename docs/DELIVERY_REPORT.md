# Continuous Delivery — 2026-09-19

进行中，非最终验收通过报告。依据 TASKPACK.md / CODEX_START_PROMPT.txt，未部署。

## 基线与保留边界

- 正式目录：japan-travel-weekend-production-work/work/japan-travel-weekend。
- 分支 feature/production-app-foundation，起始 HEAD 8a4fbde01a9daf99323748e77d0d69360cd52fe6。
- 保留 GuidedTourPhoto.tsx、RoutePlacePhoto.tsx、tests/v3dOperationsControl.test.ts 的已有修改，以及全部未跟踪照片、素材、历史验证输出。
- 未跟踪 0920、0970、0980 三个 SQL 补丁仍保留原处；未将其当成已核验正式迁移发布。
- 按锁文件使用现有依赖，不升级依赖。

## Round 状态

| Round | 状态 | 证据及剩余 |
|---|---|---|
| 0 | 完成基线检查；存在既有失败 | 类型检查、构建成功；769 测试中 766 通过、3 失败，均为迁移数量 147/150 不一致；完整 lint 1498 errors/18 warnings，包含参考目录/嵌套副本解析问题。未关闭迁移校验 |
| 1 | 部分；正在验证 | 东京日期及 URL 筛选、真实班次价格/ID、按日去重、日期在前、权益和包车在后；16 项相关测试通过；新增文件 lint 无错误；类型检查、构建成功 |
| 2 | 待执行 | 连续详情及预约链路 |
| 3 | 待执行 | 景点导览与集合 |
| 4 | 待执行 | Boost 授权硬门槛 |
| 5 | 待执行 | Staff 统一体验 |
| 6 | 待执行 | 跨端回归 |

## Round 1 边界

- 首页仅展示已获真实价格、库存且在可售目录内的班次，不在前端乘周末系数。
- 下一次行程读取已有本人订单和账单快照接口，不从可售目录推断已付款行程；按身份重新挂载，防止旧账户摘要残留。
- 优惠券使用已有推荐权益接口。等级、完成次数、旅行金缺少已核验账户汇总来源，尚未实现完整权益数字；不使用本地默认 0 冒充接口结果。
- Demo 的旧 5% 推荐旅行金规则不采纳，现有首单现金佣金业务未修改。
- 本地 390px 空状态与参考截图：output/playwright/continuous-home-390.png、continuous-home-reference-390.png。这不是已部署页面或真实身份端到端验收。
- 基线日志：runtime/continuous-{typecheck,tests,lint,build}-baseline.log。
- Round 1 构建日志：runtime/continuous-round1-build.log。
