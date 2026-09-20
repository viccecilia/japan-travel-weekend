# Continuous Delivery — 2026-09-19

> 2026-09-20 发布进展以 [BLOCKER_RELEASE_20260920.md](BLOCKER_RELEASE_20260920.md) 为准：代码已推送，测试数据库补丁已安装，前端已切换至 4a3f441 并通过发布核验。下文“未提交/未部署”为上一轮结束时快照，不代表真实身份业务验收已通过。

## 最新：最终 Blocker Closure（2026-09-19）

**本节取代下方历史报告中的本轮阻断状态，历史证据保留。没有重新实施 Round 0–5，也没有重构 Home、Route Detail、Booking、AI Guide、Travelers Boost 或 Staff App。**

结果：本轮本地可解决项已修复并验证；真实登录与外部服务边界见 [HUMAN_BLOCKERS.md](HUMAN_BLOCKERS.md)。本轮修改尚未提交、推送或部署，四个 SQL 迁移仅在隔离库事务内应用后回滚，线上修复与真实登录验收不标通过。

### 八项结论

| 项 | 修改/核查 | 实际结果及边界 |
|---|---|---|
| 1. P01 / D01 / A01 | 按既有 ID 只读核对 auth.users、profiles、项目配置及内部凭据文件 | 三个账号仍存在、已验证、未封禁/删除；内部文件保存的旧邮箱已不存在，账号邮箱已变化。已定位为凭据文件失效；当前密码未验证。需要更新这三个既有账号的安全登录信息，未重置/新建/绕过鉴权 |
| 2. Boost 服务端同意 | `20260919100132_travelers_boost_explicit_consent.sql` | 直接 RPC 也要求 `share-link-limited-v2` 与精确 JSON 布尔授权：authorized、mention_confirmed、display、monitoring、repost 为 true，download、editing、reupload、paid_ads 为 false。空值、缺字段、字符串 true、旧版本、额外权利及付费广告授权均拒绝；正确有限授权真实写入并回滚。保留原有资格、活动和订单校验 |
| 3. Assignment 权限 | `20260919100755_staff_assignment_capability_boundary.sql`、`verify-blocker-closure.mjs` | 原接口只判断本车工作人员，确有职责过宽。现按 assignment 校验车辆操作/导游操作；兼任由运营专用版本化 RPC 明确授权并审计。撤销或变更 assignment 清除兼任权限，不因无导游/永久档案自动授权。真实 RPC 正负向验证通过；未扩展管理 UI，未伪称真实司机浏览器验收 |
| 4. 0920/0970/0980 | 原样归档至 `supabase/patch-archive/blocker-closure`；正式承接迁移 `20260919100111`；preflight、manifest hash lock | 三个原稿不直接登记：存在旧查询回退、列返回不符及 scalar JSON 错用 RETURN QUERY。以最终登记实现承接 17 个读取函数的显式权限拒绝并修正聚合类型。当前为 147 个不变历史迁移 + 4 个核验后新增迁移 = 151，不是改期望为 150。完整名称、序号、排序、非空和全文件哈希检查保留；篡改、漏文件、多文件仍失败 |
| 5. 周末价格 | 只读样本、0035 定价迁移、日价写入链路及数据库数值运算 | `round(5500*1.10/100.0)*100 = 6100`，即 6050 按百日元取整。9/21 琵琶湖 5500、9/26 6100 当前样本与此一致。0035 是一次性写入，不是每次报价时运行的引擎；后续后台日价可覆盖，游客/报价读 departures.seat_price_jpy。没有历史写入审计不能断言样本最后操作者；未改生产价格 |
| 6. Booking 人数 | 未修改 App.tsx、订单/库存/支付规则 | 现有 `max="6"` 保留。10 人只用于单席优惠券数学测试，不能作为十人订单通过证明 |
| 7. Staff /profile | `VehicleInspectionPlaceholder.tsx`、StaffPortal.tsx、组件测试 | 增加“车辆 / 出库检查”明确未接入说明，无强制勾选/假检查结果/阻断按钮。顺带修复该文件两处既有 lint 错误：无效选中任务在渲染时受控重置；位置会话只在实际开启时初始化，非渲染期间制造假会话 |
| 8. 八语聊天 | `20260919101135_restore_korean_translation_context.sql`、数据库测试 | 发现最终库繁体缓存写入与韩语上下文/写入限制仍落后于现有服务配置，已恢复现有七语。七语真实上下文及缓存读写通过，游客直接写缓存被拒、撤销工作人员无上下文。西语自动生成明确未接通；未调用或新增付费翻译服务 |

### Assignment 最小服务端矩阵

| 当前 assignment | 车辆定位/车辆行程推进 | 开始集合/乘客核销 | 群聊、查看、联系 |
|---|---|---|---|
| driver | 按原任务/状态校验允许 | 拒绝 | 仍按原本车范围 |
| guide | 拒绝 | 按原任务/状态校验允许 | 仍按原本车范围 |
| driver + 明确的 guiding grant | 两者允许 | 两者允许 | 仍按原本车范围 |
| 未派班、其他车、撤销/不可执行任务 | 拒绝 | 拒绝 | 原有读取边界不放宽 |
| 运营 | 保留原授权及业务状态校验 | 保留原授权及业务状态校验 | 原运营范围 |

受保护 RPC：record_staff_execution_event、advance_vehicle_group_journey、advance_vehicle_group_to_itinerary_stop、update_vehicle_group_meeting、start_driver_location_session_v2、append_driver_location_point、publish_driver_location、set_staff_passenger_checkin、mark_vehicle_group_order_boarded、verify_boarding_credential。集合地点维护是司机/导游共享动作，开始集合仍限导游/明确兼任。保留原执行状态、幂等、归属、核销和私有服务调用权限。

`operations_set_assignment_guiding(assignment, enabled, expected_revision, reason)` 仅运营可执行；无 grant 的版本为 0，重复旧版本拒绝并保留审计。直接表写未开放给 authenticated；司机不能自授予权限。未把“管理员派班”等同司机确认，也未修改现有人员状态。

### 本轮实际验证

| 层级 | 结果 | 证据 |
|---|---|---|
| 类型检查 | 通过，exit 0 | runtime/blocker-typecheck.log |
| 全量单元/组件测试 | **190 文件，787/787 通过** | runtime/blocker-test.log |
| 前端构建 | 通过，exit 0；保留 >500kB bundle 提醒，不扩展重构 | runtime/blocker-build.log |
| Server build | 通过，exit 0 | runtime/blocker-server-build.log |
| 涉及文件 lint | 0 错误、0 警告，exit 0；未关闭规则 | runtime/blocker-lint.log |
| Manifest | 151 个文件完整校验通过；额外原稿、缺失、内容篡改拒绝 | runtime/blocker-restore-manifest.json；restoreManifest / restorePreflight 测试 |
| 隔离数据库增量行为 | 通过，91 条证据记录（不是 91 项端到端用例） | [脱敏回执](evidence/blocker-closure-database.json)；scripts/verify-blocker-closure.mjs |
| 浏览器三身份 | 阻断，未重新用旧密码反复尝试 | HUMAN_BLOCKERS.md；保留上一轮 invalid_credentials 截图 |
| 部署/全量空库恢复/外部翻译 | 未执行 | 不以增量回滚测试或构建替代 |

数据库测试在现有 restore-test 项目 `hzxoofvodpqpdomtmzlf` 执行；明确 `--rollback-test` 后才运行，使用既有三个测试身份 ID，未创建认证账号。业务 fixture、假定已付款的资格测试订单、群组、活动、位置会话、集合事件、授权审计及 outbox 均在同一未提交事务内，最后回滚并确认 fixture 不存在。该 paid fixture 仅测权限/Boost 资格，**不是支付回调成功证据**；同一司机身份的 assignment 临时变体是数据库矩阵测试，不是真实三种角色登录验收。

具体正负向包括：17 个运营 RPC 对游客/司机拒绝、对运营执行；司机可创建车辆定位会话但不能发起导游集合或自授权；导游可集合但不能驾驶操作；显式兼任可集合；过期授权版本拒绝；撤销后拒绝，重新恢复 assignment 不自动恢复兼任；私有权限 helper 不能由游客/司机调用；Boost 正确授权落库、缺少/扩大权利拒绝；翻译服务角色可保存七语缓存、游客不可写、撤销人员不可读。

测试过程中发现并修正了 varchar/text 与 bigint 聚合返回类型不匹配，以及真实库繁体缓存约束回退；没有通过删校验或把读取失败当空数据规避。

### 构建来源 / 保留情况

- 分支：feature/production-app-foundation；HEAD：`d16b8290269ef186264a6603b51706e31d2dfd68`。本轮修改仍在工作区，未创建新提交、未推送、未部署。
- 构建含本轮修复和用户已有 GuidedTourPhoto.tsx、RoutePlacePhoto.tsx、本地照片素材；**不等于纯 GitHub HEAD 产物**。
- 保留用户 tests/v3dOperationsControl.test.ts 的既有内容，只把其原稿读取路径改为归档路径。该旧源码断言保留作历史检查，真正权限结论来自上述数据库执行，而非字符串匹配。
- 三个 SQL 原稿内容哈希和承接关系见归档 README；所有未跟踪照片、视频和历史验证文件保留。
- dist/index.html SHA256：`6DC221BA58830C4AEF1B6A05080F071802925E0146050EFEC58408D6988BF732`。
- dist/assets/index-D3IzcSva.js SHA256：`2547611CC884624CFBE9BA00D498A0919ABA871F23B616A6FE04096BF6890B5C`。
- dist/sw.js SHA256：`CED525FC4D5A50929E5EA9ECE3F857D9E6B2A21EBFD1845D88D048CB8CFAA844`。

**停止条件：** 本轮本地修复与验证已完成；等待原三个测试身份的当前安全凭据，外部西语能力如实保留未接通。不继续尝试旧密码、不重做页面、不将历史待验收业务标为通过。

---

## 以下为 Blocker Closure 之前的历史报告（状态不覆盖上方最新结论）

阶段交付 / 外部验收阻断，**不是全部 Round 验收通过报告**。依据 TASKPACK.md / CODEX_START_PROMPT.txt，已连续实施 Round 0–5 并执行 Round 6 可用检查；三身份登录未通过，不能宣称闭环完成。未推送、未部署，未执行支付、退款、外部通知或资金操作。

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
| 1 | 部分 | 东京日期及 URL 筛选、真实班次价格/ID、按日去重、日期在前、权益和包车在后；16 项相关测试通过；新增文件 lint 无错误；类型检查、构建成功。真实账户权益完整汇总未接通 |
| 2 | 部分 | 连续详情、同班次报价及预约链接已实现；4 项新增组件/报价测试及相关回归共 8 项通过，类型检查通过。实际付款链路尚未验收 |
| 3 | 部分 | 指定本车组导览、集合打断阅读、服务端版本确认、定位新鲜度已实现；3 项组件行为测试通过。实时 AI、真正即时集合推送和真实三身份验收未完成 |
| 4 | 部分；服务端硬门槛阻断 | 三项前提、限用途授权、失败恢复及候选状态已实现，3项组件测试通过；既有数据库函数缺少授权布尔校验，不能标完整通过 |
| 5 | 部分 | 本车紧凑群聊、五Tab保留、8语言缓存展示、输入失败恢复及幂等重试；25项相关测试通过；细分角色服务端矩阵未验收 |
| 6 | 部分 / 登录验收阻断 | 类型检查、前后端构建通过；785 项测试 782 通过、3 项原有迁移校验失败。真实公开数据页面已检查；三身份认证均返回 invalid_credentials，登录后跨端联调未执行 |

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
- Round 2 提交 e7ddde5；构建成功。

## Round 3

- 移除公共 AI 入口的固定岚山路线、假初始坐标和“点击模拟到达”；不修改用户 GuidedTourPhoto 文件。
- 从 MyTrip 的真实车辆组生成导览深链，要求服务端返回同一可访问组，权限失效清空资料，不回退其他组。
- 复用既有集合/路线/RPC/订阅；独立景点阅读退出后回总览。集合 active 或群关闭会退出阅读，确认提交集合 revision，已确认不等于已上车。
- 断网暂停；5秒轮询加既有消息订阅补偿。现有订阅不直接监听集合表，因此不能宣称即时推送已经通过。
- 定位仅用户点击读取，显示采样时间和超过2分钟过期；不上传、不自动核销。
- 真实 AI 服务未连接，明确展示静态景点/集合资料，不伪造回答、入口出口、距离或 ETA。
- typecheck、新增组件 lint、构建通过；组件测试验证阅读→集合打断→确认，以及跨组拒绝及无参数入口。尚无真实服务端确认回执或三身份截图。
- Round 3 提交 351a917。

## Round 4

- TravelShareCampaign 独立组件，要求有效平台帖子链接、@确认、限用途授权同时成立；未满足时按钮禁用，客户端服务也拒绝缺少同意的调用。
- 仅展示候选/核验状态，不编造播放量、排名或获选。网络失败保留输入并恢复按钮；成功后才清空。
- 授权写入现有 JSON 字段：仅指定帖展示/监测/原生 Repost，download/editing/reupload/paid_ads=false。
- 3 项组件行为测试通过；修复测试自身语法错误后重跑通过；类型、组件 lint、构建通过。
- 阻断：迁移0108中的 submit_travel_share_link 未验证 p_authorization_scope 布尔值，直接 RPC 仍可能绕过客户端同意检查。未将客户端测试写成数据库权限通过。需隔离数据库验证最小服务端补丁后才可交付完整硬门槛。
- 没有擅自创建真实活动、发布外帖、购买第三方采集服务或发送通知。
- Round 4 提交 b094e1f。

## Round 5

- 保留现有今日/行程/地图/消息/我的路由及鉴权；只替换任务群聊内部组件，群聊不再重复显示大块任务汇总。
- 现有消息读取/订阅/发送及成员读取接口复用。发送时锁定输入；失败保留内容与同一幂等键，成功后清空，防止重试重复消息。
- “+”显示相册、拍照、当前位置及联系运营；相册/拍照如实提示尚未接通群上传，未用私密订单文件上传冒充群功能；位置由用户授权并确认发送后才分享。
- 群成员按工作人员在前排列；现接口没有电话不伪造，不向游客增加手机号展示。
- 8语言目标选择可展示已有缓存译文、切回原文，自己发言显示原文。未新增付费翻译服务；现有服务端翻译目标只有7语，西语自动生成及偏好持久化尚未接通。
- 细分角色问题：当前任务投影只有 driver/guide/operations；档案有 driver_guide 但不能用永久档案角色替代每次派班授权。司机/导游/兼任的服务端操作矩阵需单独核验，本批没有仅靠隐藏按钮宣称权限通过。
- typecheck、群聊相关 lint、build 通过；2项群聊行为测试 + 23项既有司导回归通过。

## Round 6 实际结果（2026-09-19）

### 提交与修改位置

| 提交 | 主要文件 | 目的 / 业务影响 |
|---|---|---|
| e2da188 | App.tsx、HomeDatePicker.tsx、HomeNextTrip.tsx、homeUpcomingDepartures.ts、homeV3Copy.ts、homeV3.css | 日期选择、按日展示、本人订单摘要；只复用读取接口，不改变价格结算 |
| e7ddde5 | App.tsx、routeDetailContinuous.css | 连续详情、最近班次报价与预约 ID 一致；不改订单或库存 |
| 351a917 | AiGuide.tsx、TripRoom.tsx、tripCompanion.css | 指定车辆组读取、集合版本确认、静态内容诚实回退；复用既有授权 RPC |
| b094e1f | TravelShareCampaign.tsx、boostPost.ts、travelShareCampaign.css、supabaseProduction.ts | 前端提交条件、限用途同意信息、网络失败恢复；既有 RPC 参数适配，无数据库改动 |
| 7183ca1 | StaffChat.tsx、StaffPortal.tsx、staffChat.css | 群聊布局、原文/缓存译文、幂等重试；没有新增角色授权 |
| 0c3f761 | useCurrentTime.ts、App.tsx、HomeNextTrip.tsx、StaffChat.tsx、StaffPortal.tsx、currentTime.test.tsx | 日本零点/前台恢复重新计算，隐藏空内容条目，明确未接通权益汇总，处理订阅失败 |
| d637ff3 | HomeDatePicker.tsx、currentTime.test.tsx | 实测浏览器缺少部分 ICU 语言导致星期回退中文，改用明确八语星期标签；真实390截图复测无溢出 |

对应组件行为测试：appHomeUpcomingBehavior、homeUpcomingDepartures、routeDetailContinuous、tripCompanionBehavior、travelShareCampaignBehavior、staffChatBehavior、currentTime。productionCopy 断言按新布局更新，未删除业务门禁。

### 最终命令与回执

| 检查 | 实际结果 | 日志 |
|---|---|---|
| npm run typecheck | 通过；新增时钟测试的 number/Date 类型问题已修复并重跑 | runtime/continuous-typecheck-final.log |
| npm test | 189 文件，782/785 通过，3 失败 | runtime/continuous-tests-final.log |
| npm run build | 通过；仍有大于 500kB 的 bundle 提醒 | runtime/continuous-build-final.log |
| npm run build:server | 通过 | runtime/continuous-server-build-final.log |
| 新增组件/时钟/行为测试文件 eslint | 通过；首次命令中的错误文件路径已纠正后重跑 | runtime/continuous-lint-new-final.log |
| 已修改旧文件 eslint | App 10 errors/2 warnings；StaffPortal 2 errors；TripRoom 1 warning；Supabase 集成 0 | runtime/continuous-lint-existing-final.json |
| 基线旧文件对比 | 起始 App 11 errors/3 warnings；StaffPortal 3 errors。仍存在的旧规范问题未通过关闭规则掩盖 | runtime/continuous-app-lint-baseline.json、continuous-staff-lint-baseline.json |
| 全仓 lint 基线 | 1498 errors/18 warnings，包含参考副本/运行目录问题；不是通过 | runtime/continuous-lint-baseline.log |

3 项全量测试失败仍来自 restoreManifest/restorePreflight：147 个登记迁移与目录实际 150 个 SQL 不一致。额外 0920/0970/0980 是原有未跟踪安全补丁，不是本轮新增；未擅自删掉、跳过、重新编号或发布这些补丁。需要核对其最终数据库函数与正式迁移归属，而不是直接将期望数量改成 150。

### 浏览器实际检查与失败边界

1. 本地正式配置前端 http://127.0.0.1:5189，读取真实公开目录/班次 RPC；不是已部署服务器截图，不是 Mock 页面。没有提交订单或修改远端数据。
2. 9/21 首页按日出现真实路线；详情选择天桥立与伊根，两个入口指向同一班次 e81f6c75-ed3b-454c-a8e0-51ef30ac958a，08:40、¥7,290；实际点击进入报名页，所选 radio 仍为该 ID。
3. 报名 1 人显示 ¥7,290；输入 10 人显示 ¥72,900，但现有输入 max=6 阻止继续。**十人仅报价公式自动测试通过，十人下单流程未通过**。本轮不偷偷改变既有订单人数规则。
4. 390px 报名截图已目视检查：七列日期，未见日期/时间/价格重叠；430px 和 1440px 另有截图。桌面实测 scrollWidth=1440、innerWidth=1440。
5. P01、D01、A01 各自独立 Chromium context；通过页面输入安全文件中的凭据。三者认证服务均返回 HTTP 400 / invalid_credentials，均停留登录页；没有改密码、创建替代身份、管理员冒充司导或绕过角色守卫。
6. 登录失败证据：output/playwright/continuous-real-identities/results.json，P01-login-failed.png、D01-login-failed.png、A01-login-failed.png。该失败阻断本人订单、Boost 成功落库、司机/导游/司导矩阵、集合三端回执和真实支付后续验收。
7. 本地 Google Places 返回 403，已有照片回退可用，但不能标记景点照片服务验收成功。
8. 本地 /api 不在现有 Vite /api-test 代理规则内；未尝试绕过到生产支付。进入 Checkout/Payment 的 API 联调须核准实际测试 API 配置。
9. 首页、详情、报名三页 × 390/430/1440 三种宽度，全部 scrollWidth 等于视口宽度；完整测量见 output/playwright/continuous-public-layout/measurements.json。英文、西语、越南语、尼泊尔语首页390px也无整体溢出；尼泊尔语星期回退已修复，最终图为 home-ne-390-corrected.png。公开产品未填写译文仍显示原文，不算内容翻译完成。
10. 六份 fixed Demo 已捕获390截图（同目录 reference-*.png），只作为参考，不作为真实身份验收截图；当前 Staff/AI/Boost 未完成逐屏登录对照，不能称像素级一致。

### 业务规则逐项结论

| 规则 | 结果 |
|---|---|
| 周末基础价 ×1.10 | 未通过精确规则核对。只读样本琵琶湖 9/21 为 5500、9/26 为 6100；5500×1.10=6050。可能存在取整或逐日配置，尚未确定；不擅自修改价格引擎/已发布日价 |
| 10% 单人优惠券 | 计算行为通过：8800×10，折扣880，应付87120；真实十人付款未验证，且报名现有限6人 |
| 200日元评价券取消 | 本轮未新增该文案/奖励；未执行数据库历史权益核验，不能宣称历史奖励已彻底取消 |
| Boost 三前提 | 前端行为通过；服务端直接 RPC 同意布尔校验缺口仍在，完整硬门槛未通过 |
| Staff 角色权限 | 真实登录阻断；兼任 assignment 表达及服务端细分矩阵未验证，不通过 UI 隐藏按钮替代 |
| 八种翻译语言 | 选择器和现有缓存读取已实现；现有服务端七语、西语生成及偏好持久化未接通 |
| 出库检查 | 未新增检查流程、不阻断任务；“我的”独立占位说明尚未补齐 |
| 集合即时暂停 | 组件行为通过；现有订阅+5秒轮询不是即时保证；真实跨端确认未验证 |
| AI伴游 | 静态资料降级，非实时 AI；不伪造定位/ETA |

### 构建来源与资产保留

最终验证构建的代码 HEAD 为 d637ff3，产物内版本 d637ff36663d，包含用户未提交 GuidedTourPhoto.tsx、RoutePlacePhoto.tsx 和本地素材。测试还包含用户 tests/v3dOperationsControl.test.ts 改动。**不是纯 GitHub HEAD 构建，也没有推送或部署。** 随后的报告提交不改变应用代码。

- dist/index.html SHA256：FBDF47EACFA3BE634EA8D5E6782AE3165D2F70C2DBB400379BDFDB1A594FC3EB
- dist/assets/index-BHYC659D.js SHA256：AE039978DFCB7943E6DDEA4E48AE9437EF86D0766DA850C9C9E3163B0C861347
- dist/sw.js SHA256：8F22FFFD6FC92D9C519CF5712F1E5709F449DDA8084CBC5C3D8A302E6A81C93E
- 本地公共截图：output/playwright/continuous-public-layout/{home,route,booking}-{390,430,1440}.png；旧缓存/已安装 PWA 升级未验收。

## 真正剩余问题

**阻断：** 安全配置现有三身份凭据不被目标认证项目接受；Boost 数据库授权硬门槛未闭环；角色细分需最终生效函数与 assignment 核验；迁移目录 147/150 的原有补丁归属未解决。未将这些标为完成。

**待核准业务差异：** 精确周末 ×1.10 与日价样本不同；10 人案例与既有6人报名上限不同。涉及业务/生产数据风险，未自行修改。

**非阻断/部分能力：** 权益汇总、完整 Demo 视觉对齐、出库占位、缺失公开内容、旧文件 lint、真实手机软键盘与后台定位、待登录三端截图。

**外部依赖：** Google Places 本地域名授权；实时 AI；西语服务端自动翻译；外部提醒实际送达；测试 API 路由配置。没有新增付费服务或虚构成功回执。

## 最短最终人工检查入口（不是要求逐轮参与）

以下为恢复身份与解决上述门禁后的最终路径；当前不建议据此开放正式收款：

1. /app?date=2026-09-21：首页日期、真实路线、权益边界与包车入口。
2. /app/trips/amanohashidate-ine：连续详情与正确班次报价。
3. /app/booking/amanohashidate-ine：七列日期、人数及选中班次。
4. 本人订单的 Checkout/Payment：仅授权测试支付，核对同一报价。
5. 本人 MyTrip 的本车导览入口：不可手工替换成他人组。
6. 司机发起集合，游客确认：核对版本、未上车与已上车分离。
7. 现有分享活动入口：三前提、候选状态及刷新。
8. /staff：五个 Tab 与当前任务。
9. 本车任务群：发送重试、原文/译文、成员隐私。
10. /staff/profile：资料/出勤/推广/收益；不将缺数据当正常0。
