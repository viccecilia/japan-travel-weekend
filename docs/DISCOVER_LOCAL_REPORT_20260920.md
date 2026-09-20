# Discover 小范围精修：本地验收

日期：2026-09-20（Asia/Tokyo）。

正式目录：C:/Users/pangv/Documents/Codex/2026-08-21/japan-travel-weekend-production-work/work/japan-travel-weekend

分支：feature/production-app-foundation。
基线 HEAD：74e707b42a095daf74490039193ca705fc6bc197。
本批未提交、未 push、未部署。当前本地源码与构建包含未提交修改，不等同 GitHub HEAD。
用户已有 GuidedTourPhoto.tsx、RoutePlacePhoto.tsx 修改及素材未覆盖；没有修改 Booking、价格、支付、订单、调度或 Staff 业务逻辑。

## 修改文件

- src/app/App.tsx：Discover 入口、五个导航标签/所属栏目、动态两列整卡路线、将原 VIP/团体入口移至路线页下方。
- src/app/Discover.tsx：当前视频按需加载、Soul/路线区别、动态切换、触摸及鼠标滑动、封面回退。
- src/app/discover.css：只限 Discover 和新路线卡片的样式、标题 3 秒保持 + 0.7 秒淡出、控件 2.2 秒闲置 + 0.3 秒渐变。
- src/shared/discover.ts：内容类型、三个初始视频、既有产品绑定、八语言标签与源文回退。
- src/app/operations/MarketingCenter.tsx：复用原首页推荐入口，嵌入 Discover 编辑区。
- src/app/operations/DiscoverManager.tsx：上传、更换、标题/副标题、语言、可选产品、启用/排序、版本失败保留输入。
- src/app/operations/discoverManager.css：只限 Discover 维护区域的布局。
- src/app/operations/discoverUpload.ts：复用现有 H.264/AAC、50 MB 校验，浏览器解码并自动提取 JPG 封面，不加入转码服务。
- src/shared/integrations/supabaseOperations.ts：读公开/运营内容、保存版本化内容，媒体上传沿用现有 route-media。
- supabase/migrations/20260920054451_discover_video_heroes.sql：最小独立内容表及读写 RPC。
- supabase/migration-lock.json、scripts/restore-preflight.mjs：登记新增迁移及真实 SHA256；保留原 147 + 4 条链。
- tests/discoverBehavior.test.tsx：新页面、导航、产品关系、数量、失败回退及编辑行为。
- tests/appHomeUpcomingBehavior.test.tsx：旧首页班次断言改为 Discover 不复制交易字段；原班次日期/价格测试保留。
- tests/passengerNavigation.test.tsx：更新已明确变更的标签及 VIP/团体所属栏目。
- scripts/verify-discover-rollback.mjs：隔离库事务回滚行为/权限检查。
- scripts/discover-browser-check.js：本地实际浏览器检查，可重复执行。
- public/media/discover/：三个 H.264/AAC MP4 和三个 JPG。
- 本报告及 output/playwright/discover-* 截图证据。

## 新迁移及边界

原 product_merchandising 以 trip_id 为非空主键，不能表达不关联产品的 Soul 视频，也没有视频/封面/多语言文案字段。因此没有挪用 locale_readiness 或改原营销表，而是新增 discover_heroes。

公开 RPC 仅返回启用内容，关联产品须为 published；页面进一步使用现有公开产品目录校验 ID/slug。运营读写复用 is_operations，不新增或降低角色权限。客户端无表写权限。保存带版本检查、事务及独立内容历史；价格、班次、库存等非白名单字段被拒绝。

总迁移数 152 = 原冻结 147 + 既有追加 4 + 本次 1。不是仅改测试数字；新增文件已注册并锁定哈希。

**没有将迁移应用/登记到在线环境。** 唯一数据库写入验证是在既有 restore-test 隔离库单事务执行新 DDL 和测试内容，然后 ROLLBACK；未持久化表、内容或迁移版本，未改真实人员、订单或价格。

## 自动及数据库验证

| 检查 | 结果 |
| --- | --- |
| npm run typecheck | 通过（包含现有 server 类型配置） |
| 9 个相关测试文件 | 49 项通过 |
| npm run build | 通过；保留已有大 bundle 提示，不扩展为代码拆分 |
| 本批新增文件及相关独立文件 lint | 通过 |
| App.tsx lint 基线对比 | HEAD 和本地均为同样 12 项既有发现，无新增；未关闭规则 |
| git diff --check | 通过 |
| 迁移 manifest/preflight | 全链数量、顺序和哈希通过 |
| 运营创建、读取、修改、版本递增、启停 | 隔离库实际 RPC 执行通过，全部回滚 |
| 游客运营读取/保存、直接写表 | 服务端拒绝，SQLSTATE 42501 |
| 匿名运营读取 | 服务端拒绝，SQLSTATE 42501 |
| 旧版本重试/并发版本冲突 | 服务端拒绝，SQLSTATE 40001 |
| 价格字段注入、非法语言 | 服务端拒绝，SQLSTATE P0001 |
| 公开输出 | 启用/停用生效，不输出操作者历史字段 |
| 自动封面 | Chromium 对真实 H.264 文件实际解码；生成 image/jpeg，174389 bytes |

相关测试文件：discoverBehavior、appHomeUpcomingBehavior、homeUpcomingDepartures、passengerNavigation、restoreManifest、restorePreflight、bookingCalendarContinuity、operationsNavigationBehavior、productSpotVideo。

## 浏览器实测

使用 Playwright 技能进行实际 Chromium 浏览器验收，保留本地窗口；不是以 HTTP 200 代替页面验收。

| 项目 | 实测结果 |
| --- | --- |
| 390×844、430×844 Discover | 首屏高度 844；scrollWidth 分别 390、430，无整体横向溢出 |
| 三个视频 | 每个实际 playing=true、720×1280；非仅显示 poster |
| Soul | 指定中文源文；没有价格、商品标签或查看旅程 CTA |
| 左右按钮/横滑 | 路线分别绑定 amanohashidate-ine、miyama-katsuoji-arashiyama |
| 标题显示/淡出/轻触恢复 | 3 秒保持后淡出；实测 idle opacity=0，轻触后=1 |
| 控件透明度 | 操作后=1；闲置后=.28 |
| CTA | 实际点击进入对应现有路线详情 |
| 上滑/双 chevron 胶囊 | 均进入 /app/trips |
| 触摸事件 | Chromium CDP 真实 touchStart/move/end：横滑及上滑通过，不只测试鼠标 |
| 两列网格 | 实际读取 9 条公开路线，2 列，整卡单链接无嵌套按钮；末尾保留原 VIP/团体入口 |
| 八语言 | 简/繁/英/日/韩/西/越/尼均可切换，430px 无整体横向溢出；未提供营销译文使用源文回退 |
| 封面回退 | 触发实际媒体 error 事件后保留可见 JPG，不出现整块黑屏 |
| 未登录导航 | 订单/我的正常进入原登录 returnTo；未绕过认证 |
| 已登录游客 | 既有隔离游客身份打开 orders/notifications/profile：我的行程/通知/我的，导航唯一高亮，430px 无溢出 |
| 已登录运营 | 既有真实运营身份进入 marketing；真实原营销数据可读，新增 Discover 区显示明确未初始化状态 |
| 报名日历 | 430px 仍为七列，月历宽 347px，无整体横向溢出；原 6 人/班次逻辑未修改 |

Discover 后台截图不是“保存闭环通过”的证据：线上没有新 RPC，读返回 404，上传/保存按钮禁用；初始内容明确标注为本地参考。没有使用浏览器假响应模拟保存成功。

未登录通知入口原有 notification_outbox 请求返回 401；游客实际登录后页面读取通过。本批未改通知权限。

## 截图

- output/playwright/discover-390.png
- output/playwright/discover-430.png
- output/playwright/discover-route-390.png
- output/playwright/discover-route-430.png
- output/playwright/discover-trips-390.png
- output/playwright/discover-trips-430.png
- output/playwright/discover-poster-fallback-430.png
- output/playwright/discover-operations-1366.png
- output/playwright/discover-operations-editor-1366.png（全页编辑区参考）

## 静态视频

原始 HEVC 文件只读取，未改名、未覆盖、未删除。生成网页 H.264/AAC、720×1280、yuv420p、faststart 文件：

| 静态路径 | bytes | SHA256 |
| --- | ---: | --- |
| /media/discover/autumn-soul.mp4 | 1850992 | dc4afa968aa58f49eebc8c058b9e8c2ca06473f8cf2aa92f57e67e9ad74c3bf6 |
| /media/discover/amanohashidate-ine.mp4 | 6168865 | 11f35e14bbc5df67bd2cf6e12c8ae60de8f4f986572528a252f90f7dfcd6f2a2 |
| /media/discover/katsuoji-arashiyama.mp4 | 11312007 | e9612c23bee2ae0eed8008785f76a86aacd217f096502cf737a411a9698ee040 |

同名 .jpg 为自动提取封面。影片仅当前 Hero 加载，没有加入 PWA precache。

## 访问及阻断

- 本地发现：http://127.0.0.1:5188/app
- 本地路线：http://127.0.0.1:5188/app/trips
- 本地后台：http://127.0.0.1:5188/app/operations/marketing
- 启动命令：npm run dev -- --host 127.0.0.1 --port 5188 --mode production（本地进程；使用既有正式认证配置，并非部署到生产）。

阻断：本轮明确不部署，因此新内容迁移没有持久应用。后台真实上传→保存→刷新→公开读取整链尚未实测，不能标记完成。数据库保存权限/版本检查已通过回滚测试。没有引入新媒体服务或重新搭建认证。

游客部分已发布路线的简介/地点字段仍为空；卡片忠实显示现有公开字段，未编造营销文案或修改数据补齐。

本地等待人工验收，不继续开展其它模块，不自动 push 或部署。
