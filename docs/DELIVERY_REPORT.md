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
| 2 | 部分 | 连续详情、同班次报价及预约链接已实现；4 项新增组件/报价测试及相关回归共 8 项通过，类型检查通过。实际付款链路尚未验收 |
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
- Round 1 提交：e2da188；390px 实际浏览器日期按钮切换到 URL date=2026-09-20，页面宽度=scrollWidth=390。

## Round 2

- AppTrip 不再依赖三个 Tab 隐藏信息，改为同页段落锚点。
- 最近班次按真实出发时间而非最低价选择；显式有效 departureId 优先；过期/他路线 ID 不向预约页传递。
- 价格、集合点、日期、余位及两个预约入口共用同一班次。
- 已发布产品缺失语言、包含费用、准备物品等字段时不再填入种子内容承诺；无视频不生成播放器。
- singleSeatQuote 实际执行验证：8000×1=8000；8800×1×10% 单席券后7920；8800×10仍只减880，合计87120。未改结算核心。
- 本地浏览器 390px 连续三个内容段均可见，无整体溢出；另存430px截图。Google Places对本地来源返回403，保留原照片组件与已有回退，不冒充图片服务验收通过。
- 尚不能仅由这些测试证明“后端周末系数配置”“真实付款回调”和旧奖励券全部取消；将在全局核查明确结果。
