# JTW 真实 GPS 地图与 UI 文案隔离本地完成报告

日期：2026-10-16（Asia/Tokyo）
分类：IMPLEMENT → VERIFY（LOCAL ONLY）
本地基线：`eab63ac3db0093776262d32ebc0dfc9c8e0bf8bc`
当前 Test 前端/API：`505f409f75be037253b729df4e853898c580e31d`，`mode=test`

## 结论

代码与自动化范围已经完成；没有 commit、push、数据库应用或 Test 部署。当前不能标记 `REAL_MOBILE PASS`：实际 Test 页面仍明确显示地图服务配置缺失或不可用，本轮代码与两条迁移也尚未进入 Test，司机手机与游客手机的真实授权、移动、停止共享闭环尚未执行。

发布决策：`BLOCKED`。当前工作树为 detached `eab63ac3`，而最新远端/Test 应用基线为 `505f409f`；两者已分叉，远端包含当前 HEAD 没有的 106 个提交，当前 HEAD 另有 1 个未进入远端的提交。Test 数据库已应用 214 条迁移至 `20261016123000`，当前工作树基线只有 188 条。本轮两条未提交迁移已改为更晚的新版本号并通过本地 190 条锁校验，但必须先把现有地图补丁移植到最新基线并使用最新的 214 条迁移锁重新登记，不能从此旧基线直接发布。

## 本轮完成

- `/staff/map` 使用真实 Google Maps JS 底图；加载失败时显示真实降级提示，不使用图片或模拟坐标。
- 地图同时支持司机本机 GPS、正式集合点、服务端车辆共享位置和本车游客主动共享位置。
- 本机 GPS 与服务端车辆共享状态分开；司机主动开启或停止共享，标记显示采样时间与精度。
- 司机端每 10 秒同步一次游客及车辆位置，并在网络恢复、窗口聚焦或页面回到前台时刷新。
- 车辆位置超过 30 秒未更新时改为“车辆最后位置”，不再冒充实时位置。
- 游客端先读取单次坐标供确认；确认后才持续采样，约 8 秒节流上传，15 分钟后停止，不承诺锁屏后台定位。
- 后端更新复用同一条仍有效的游客共享记录，避免每个 GPS 样本创建新会话；保留成员、开放群聊、可执行班次、未结束行程和有效期检查。
- 地图标记列表可单独选择重叠点，并显示游客名称、更新时间、精度与导航入口。
- 集合信息改为只读正式资料；工作人员无法在该页修改正式集合点。运营更新入口改用 operations-only RPC。
- 行程到站和自由活动只允许选择已发布路线节点，不接受任意自由文本节点。
- 清理登录、付款、行程房间、Discover 与产品媒体管理中的测试环境、数据库、Supabase、Payment Intent 等非用户文案；在 `AGENTS.md` 增加长期 UI 文案隔离规则。

## 本轮主要文件

- `src/app/StaffLiveMap.tsx`
- `src/app/MapSurface.tsx`
- `src/app/PassengerLocationShare.tsx`
- `src/app/StaffPortal.tsx`
- `src/shared/i18n/locationShare.ts`
- `src/shared/i18n/passengerLocale.ts`
- `src/shared/services/mapSession.ts`
- `src/shared/integrations/supabaseProduction.ts`
- `src/styles.css`
- `supabase/migrations/20261016152000_reuse_active_passenger_location_share.sql`
- `supabase/migrations/20261016152100_restrict_meeting_updates_to_operations.sql`
- `tests/staffLiveMap.test.tsx`
- `tests/passengerLocationShare.test.tsx`
- `tests/locationShareContinuityMigration.test.ts`
- `tests/staffPortal.test.tsx`
- `tests/passengerLocale.test.ts`
- `AGENTS.md`

`src/app/App.tsx` 原本已有其他未提交修改，本轮只增加了两处面向用户的文案清理；既有修改未覆盖。工作树内 Discover、结账测试、历史发布副本和其他未跟踪目录均按原状保留。

## 自动化结果

- 地图、定位、集合权限、语言文案与恢复链定向测试：7 files / 43 tests，通过。
- TypeScript：`npm run typecheck`，通过。
- 前端生产构建：`npm run build`，通过；仅有既有大 chunk 提示。
- 服务端构建：`npm run build:server`，通过。
- 恢复链门禁：本地 190/190 条迁移名称、顺序、内容与 SHA256 锁一致，通过。
- `git diff --check`：通过；仅报告 Windows 换行提示。

限定到主 `tests`、排除未跟踪历史副本后的全量结果为 231 files：225 passed / 6 failed；962 tests：938 passed / 24 failed。失败集中在产品编辑及路由 mock、路线详情旧服务 mock、推荐页旧 state mock、Discover 既有断言和游客入口顺序，均不属于地图定向测试；最新远端基线包含当前 HEAD 没有的 106 个提交，因此不能用本 detached 基线的全量结果作为最终发布结论。

## 实际浏览器检查

2026-10-16 15:05（日本时间）再次只读打开当前 Test `/staff/map`：

- 当前任务为今天 09:30“海之京都：天桥立与伊根舟屋一日游”。
- 正式集合点“日本桥2号口”已显示。
- 本车游客 5 人，当前主动共享位置账号 0 个，地图点位 1 个。
- 页面显示“地图服务配置缺失或暂不可用，不能显示实时地图”。
- 实际页面脚本只有当前应用包与 Stripe，未注入 Google Maps JavaScript API；浏览器控制台没有 Maps 警告或错误。因此失败点在地图加载器之前：当前 Test 构建没有取得可用的浏览器地图 Key，而不是脚本加载后才被域名限制拒绝。

这证明 Test 的 Google Maps 浏览器 Key、API 启用或域名限制仍需在安全发布窗口核对，不能用自动化或静态截图冒充真实地图验收。

## 5＋3＋2 只读状态

2026-10-16 15:08—15:15（日本时间）从 Test 数据库只读核对：

- 5席：车辆 `M019-350080`，已支付/计划 5 席，集合 `active`、行程 `meeting`、群聊 `open`，2 名工作人员均已确认，0 个订单已登车。
- 3席：车辆 `TEST-904782`，已支付/计划 3 席，集合/行程尚未开始、群聊 `open`，1 名工作人员尚未确认。
- 2席：车辆 `TEST-947009`，已支付/计划 2 席，集合/行程尚未开始、群聊 `open`，1 名工作人员尚未确认。
- 三组当前均无有效游客位置共享、无有效司机位置会话。

5席班次正处于集合执行，3席与2席的工作人员/游客群聊也已开放；当前不是安全发布窗口。

## 发布前最小动作

1. 在最新 `505f409f` 基线上移植现有地图补丁；使用最新 214 条迁移锁登记两条新迁移，不能从 detached `eab63ac3` 发布。
2. 等 5＋3＋2 当前开放/执行会话结束或进入用户明确确认的安全发布窗口。
3. 在 Google Cloud 核对 Test 的 Maps JavaScript API、HTTP referrer `https://weekend.japan-travel.info/*`、账单与配额；将 Key 写入安全 Test 构建配置 `VITE_GOOGLE_MAPS_BROWSER_KEY`，不得贴入聊天或提交 Git。
4. 构建固定 SHA artifact，部署 Test 后核对前端/API SHA 一致及 `mode=test`。
5. 用司机手机和游客手机执行：游客授权共享 → 司机地图出现 → 移动后约 10 秒更新 → 游客停止共享 → 标记消失。
6. 保存两台设备的截图、采样时间、精度和服务端同步读回后，才能把 `REAL_MOBILE` 标记为 PASS。

## 未触碰

- 未修改 5＋3＋2 订单、班次、集合、登车或履约数据。
- 未写入任何 GPS 假数据。
- 未访问、部署或写入 Production；未使用 Live Stripe。
- 未 commit、push 或部署 Test。

## 最新基线移植与发布阻塞清除（2026-10-16）

### 基线与隔离
- 旧工作树保持在 `eab63ac3db0093776262d32ebc0dfc9c8e0bf8bc`，未清理、未覆盖；完整 tracked patch 与逐文件清单位于旧工作树 `_artifacts/gps-map-port-20261016/`。
- `origin/feature/production-app-foundation`、`origin/codex/referral-growth`、Test 前端 `RELEASE_SHA` 与 Test API SHA 均核对为 `505f409f75be037253b729df4e853898c580e31d`。
- 移植工作树：`C:\Users\pangv\.codex\worktrees\gps-map-port\Japan travel weekend`，从上述远端基线建立，未 commit、未 push、未部署。

### 已移植
- Google Maps loader：语言/日本区域参数、来源策略、鉴权失败回退、cooperative 手势。
- 司机地图：本机 GPS 与服务端共享位置分离；主动开启/停止车辆共享；集合点、游客授权位置、更新时间与精度；约 10 秒刷新及前台/网络恢复。
- 游客位置：明确确认后开启 15 分钟共享，页面活动期间约 8 秒节流持续更新；恢复前台/网络后刷新；停止共享；八语说明。
- 集合信息：司机/导游只读并可导航；Operations 使用独立 RPC 修改正式集合资料。
- 行程节点：优先选择已发布路线节点，不再允许工作人员以任意自由文本替代已发布节点。
- UI 文案：地图/集合/行程及关联运营页面移除一部分内部实现说明，并把长期文案隔离规则写入 `AGENTS.md`。

### 迁移对账
- Test 只读核对：已应用 214 条，最后一条为 `20261016123000_meeting_revision_passenger_arrival`。
- 本地候选链：216 条；新增 `20261016152000_reuse_active_passenger_location_share.sql` 与 `20261016152100_restrict_meeting_updates_to_operations.sql`。
- 版本号无冲突；历史迁移未改写；migration lock 已加入两条实际 SHA-256。
- 隔离恢复链检查通过：216 条全部按锁校验。两条迁移未应用到 Test。

### 未盲目移植
- 旧工作树 `App.tsx`、`Discover.tsx`、`discover.css` 及支付/路线工具等混合 dirty changes 未进入新工作树。
- 旧版 `passengerLocale.ts` 的整文件文案替换未复制；最新基线已新增账户页、日期与路线多语言规则，整文件覆盖会回退新功能。本轮仅移植与地图/集合信息直接相关的八语位置文案和可安全独立替换的 UI 提示。

### 验证
- 定向：8 个测试文件、51 项通过。
- 修复后重跑：2 个测试文件、9 项通过。
- Typecheck：通过。
- Build：通过（保留既有大 chunk 警告）。
- Build:server：通过。
- migration lock / restore preflight：通过，216 条。
- `git diff --check`：通过。
- 最新基线全量：273 个文件中 271 个首次通过；1230 项中 1228 项首次通过。一个文案断言已修复并通过；一个恢复锁测试在全量并发时因 5 秒超时，单独重跑及正式 preflight 均通过，判定为并发 I/O 超时而非迁移链错误。

### Test 只读状态
- 实际 Test 地图页没有 Google Maps 脚本，页面显示地图不可用；构建未包含非空 `VITE_GOOGLE_MAPS_BROWSER_KEY`。因此 Maps JavaScript API、域名限制、账单与配额无法在当前构建内完成端到端验证。
- 5 席班次处于 `meeting` 且群聊开放；3 席与 2 席班次为 `pending` 且群聊开放。三组均已有司机，5 席组另有导游。当前存在真实验收会话，不是安全部署窗口。

### 发布决策
**BLOCKED**

本地候选已具备进入发布准备的代码与迁移锁条件，但暂不能安全发布：
1. 先在 Google Cloud 中确认 Maps JavaScript API 已启用、账单/配额有效，并将浏览器 Key 限制为 `https://weekend.japan-travel.info/*`（如另有 Test 域名一并加入）；再通过安全发布环境注入 `VITE_GOOGLE_MAPS_BROWSER_KEY`，不要在聊天或仓库中粘贴 Key。
2. 等 5+3+2 当前验收会话结束或明确进入维护窗口。
3. 发布前由用户明确授权 commit / push / Test migration / Test deployment；迁移必须先于依赖新 RPC 的前端/API 切换。
4. 发布后使用司机与游客真机完成“开启共享 → 司机显示 → 更新 → 停止后消失”，保存时间、精度、服务端同步及截图后，才可标记 `REAL_MOBILE PASS`。

Production 未访问、未部署、未写入；未使用 Live Stripe。

### 最终复跑补充
- 扩大超时后的最新全量测试：272/273 个文件、1229/1230 项通过。唯一失败为无关的 `profileInvite.test.tsx` 并发时序（测试在异步失败态尚未呈现时即查找重试按钮）。
- `profileInvite.test.tsx` 与文案清理相关 `discoverBehavior.test.tsx` 单独复跑：2 个文件、22 项全部通过。本轮未修改 Profile 业务代码。
- 最终 Typecheck、Build、Build:server、`git diff --check`、216/216 migration lock 均通过。

## Google Maps 配置与发布前复核（2026-10-16）

### 安全配置
- 用户通过本机安全终端输入 JTW Test 浏览器 Key；保存文件为 Git 忽略的 `.env.google-maps.test.local`，未提交、未打印明文、未写入聊天或测试日志。
- Key 格式校验通过；仅记录不可逆 SHA-256 指纹 `30b5a1e26b1bcf11f08d3a04cb90cd4edc9f8f8e9e06c4282985d142e89d6f53`。
- 使用现有 `.env.acceptance.local` 作为其余 Test 公共配置来源，在构建进程内合并地图 Key。构建指纹确认：Test Supabase `hzxoofvodpqpdomtmzlf`、`/api-test`、Stripe Test、Live payments=false、seed=false、地图 Key 已嵌入。

### 实际浏览器验证
- 在真实 Chrome 中以 `https://weekend.japan-travel.info/app` 为页面来源加载 Maps JavaScript API：脚本加载成功、`google.maps` 就绪、地图实例创建成功；没有 `InvalidKeyMapError`、`RefererNotAllowedMapError`、`ApiNotActivatedMapError` 或结算错误。
- 首次探测发现当前 CSP 阻止 `maps.googleapis.com` 地图瓦片及 `maps.gstatic.com` 静态资源；这会造成 Key 有效但底图空白。
- 已在本地候选 `deploy/nginx/weekend-test-common.conf` 最小补充 Maps 脚本、瓦片、静态资源、字体、连接及 worker 来源，并在相同 Test 来源下以候选 CSP 复测：底图完整显示、无 CSP 阻断。
- 实际截图：`output/playwright/google-maps-key-probe.png`。
- 当前线上仍是旧 `505f409...` 构建，尚未包含 Key或 CSP 修正，因此线上地图仍显示降级提示；这不是发布完成证据。

### 迁移与恢复安全门禁
- Test 仍为 214 条已应用迁移；本地候选仍为 216 条，新增两条版本继续晚于 Test 最新版本且无冲突；未执行数据库 migration。
- 修复恢复脚本保护清单：将当前 Test 项目 `hzxoofvodpqpdomtmzlf` 加入不可作为 disposable restore target 的项目集合，并增加回归断言。
- 隔离恢复 preflight：216/216 通过。

### 本次复跑
- 地图、GPS、集合权限、CSP、恢复链定向测试：11 个文件、84 项通过。
- 全量测试：273/273 个文件、1232/1232 项通过；此前并发时序失败未复现。
- Typecheck：通过。
- Build（含安全注入地图 Key）：通过，仅保留既有大 chunk 警告。
- Build:server：通过。
- `git diff --check`：通过，仅有既有 LF/CRLF 提示。

### 最新发布判断
**BLOCKED（业务安全窗口）**

Google Maps 配置阻塞已经清除，本地候选具备发布技术条件；但 5 席班次仍处于 `meeting`、群聊开放，3 席与 2 席班次也仍有开放群聊和工作人员会话。未获得 commit、push、Test migration、Test deployment 授权，因此本轮不发布。

进入发布阶段只需用户完成两项：
1. 确认当前 5＋3＋2 操作已暂停或进入可维护窗口。
2. 明确授权 `commit → push → Test migration → 固定 SHA Artifact → Test deployment`。

发布后仍需两台真实手机完成 A01—A20；在真实游客共享、司机显示、更新、停止及权限隔离证据齐全前，`REAL_MOBILE PASS` 保持 `NOT_RUN`。

## Test 安全发布最终预检（2026-10-17 13:28 JST）

### 版本、迁移与工作树
- `origin/feature/production-app-foundation`、`origin/codex/referral-growth`、Test 前端 `RELEASE_SHA` 与 Test API SHA 仍一致为 `505f409f75be037253b729df4e853898c580e31d`；API `mode=test`。
- Test 数据库仍为 214 条已应用迁移，最新为 `20261016123000_meeting_revision_passenger_arrival`；两条候选迁移仍未应用。
- 本地迁移目录与 lock 均为 216 条；隔离恢复 preflight 再次 216/216 通过；新增两条迁移的文件名、顺序及 SHA-256 与 lock 一致。
- 隔离工作树共 27 个 task-scoped modified/untracked 路径；未发现 `App.tsx`、支付、订单或其他旧工作树混合改动。地图 Key 文件继续由 Git 忽略。

### 业务安全窗口
- 5 席车组仍为 `meeting=active`、`journey=meeting`、群聊 `open`，未完成行程；最近业务写入为 2026-10-16 00:59 UTC。
- 3 席与 2 席车组的群聊仍为 `open`，行程状态尚未建立；三组当前均无有效游客/车辆位置共享。
- 虽然没有发现 10 月 16 日 00:59 UTC 之后的新写入，但未完成的 5 席行程及开放群聊仍是需要保护的业务会话，不能据此确认安全维护窗口。

### Google Maps Key 限制复核
- Test 正式来源 `https://weekend.japan-travel.info/app` 对照探测仍可成功加载脚本、创建地图和显示底图。
- 非授权来源 `https://example.com` 的对照探测没有触发 `RefererNotAllowedMapError` 或 `gm_authFailure`。因此只能确认 Key 可用，不能确认浏览器来源限制已经生效。
- 发布前需在 Google Cloud 凭据页确认：应用限制为网站，允许来源仅含实际 Test 域名（例如 `https://weekend.japan-travel.info/*`）；API 限制至少限定为 Maps JavaScript API。保存后等待策略生效，再要求非授权来源探测被拒绝。

### 最终决定
**BLOCKED — 未执行发布。**

停止原因：
1. 5＋3＋2 尚未形成可证实的安全维护窗口，5 席业务会话仍处于集合中。
2. Google Maps Key 的非授权来源对照没有被拒绝，来源限制无法确认。

因此本轮未 commit、未 push、未执行 Test migration、未构建发布 Artifact、未切换 Test。Production 未访问、未部署、未写入；未使用 Live Stripe。`REAL_MOBILE PASS` 仍为 `NOT_RUN`。

## Google Maps 来源限制复核与维护窗口准备（2026-10-17 15:17 JST）

### 门禁一：Google Maps 浏览器 Key（PASS）
- 本地构建使用 Git 忽略文件 `.env.google-maps.test.local` 中的 `VITE_GOOGLE_MAPS_BROWSER_KEY`；未打印或提交明文。
- 本地 Key 与 Google Cloud 中 `JTW-Test-Google-Maps` 的不可逆 SHA-256 指纹均为 `30b5a1e26b1bcf11f08d3a04cb90cd4edc9f8f8e9e06c4282985d142e89d6f53`，确认是同一把 Key。
- Google Cloud 只读核对：应用限制为“网站”；唯一白名单为 `https://weekend.japan-travel.info/*`；API 限制仅选择 `Maps JavaScript API`。
- 真实 Chrome 正向探测：以 `https://weekend.japan-travel.info/app` 为 Referer，脚本加载、`google.maps` 与地图实例创建均成功。
- 真实 Chrome 反向探测：以 `https://example.com` 为 Referer，触发 `gm_authFailure` 与 `RefererNotAllowedMapError`，并明确返回未授权来源 `https://example.com`。
- 正反向结果证明来源限制已生效；探测未使用图片、模拟响应或仅凭“没有报错”判定。

### 门禁二：5＋3＋2 维护窗口数据快照（数据安全通过，人工暂停确认待完成）
- 快照时间：2026-10-17 06:16:59 UTC（15:16:59 JST）。
- 5 席：车辆 `M019-350080`，容量 9，已售/计划 5；班次 `closed`；集合 `active` revision 1；行程 `meeting` revision 1；1 条报到记录为 `at_meeting_point`；群聊 `open`、3 条 text 消息、乘客账户 1/乘客 5；司机和导游各 1，二者均已确认派班；订单 `paid`、Stripe `succeeded`、5 席；推荐生命周期为 `first_payment_completed`，尚无有效推荐席位。
- 3 席：车辆 `TEST-904782`，容量 6，已售/计划 3；班次 `closed`；集合/行程状态尚未建立；无报到；群聊 `open`、0 条消息、乘客账户 1/乘客 3；司机 1，尚未确认派班；订单 `paid`、Stripe `succeeded`、3 席；推荐生命周期为 `first_payment_completed`，尚无有效推荐席位。
- 2 席：车辆 `TEST-947009`，容量 6，已售/计划 2；班次 `closed`；集合/行程状态尚未建立；无报到；群聊 `open`、0 条消息、乘客账户 1/乘客 2；司机 1，尚未确认派班；订单 `paid`、Stripe `succeeded`、2 席；推荐生命周期为 `first_payment_completed`，尚无有效推荐席位。
- 三组均无有效游客/车辆位置共享；快照前 30 分钟内，聊天、工作人员事件、报到事件、订单更新及位置采样均为 0。
- 数据库即时运行检查：无锁定中的通知投递、无等待数据库锁、除本次只读查询外无活动客户端查询。当前连接权限无法读取 `cron` schema，因此不能用该接口独立列出所有计划任务；但未观察到其产生的目标业务写入或活动数据库连接。
- 两条候选 migration 均为函数/权限变更，不在迁移执行时更新订单、报到、群聊、集合、行程或推荐数据；第一条仅在游客后续主动发布位置时复用其有效共享行，第二条收紧集合点修改入口。迁移后至应用切换前，旧客户端的集合修改入口可能暂时失败，因此仍必须在设备暂停后执行。

### 当前发布判断
**BLOCKED（等待人工暂停确认；本任务明确不发布）。**

Google Maps 安全门禁已通过，现有未完成业务状态可以原样进入维护窗口；当前数据和迁移内容未发现会重置或损坏 5＋3＋2 的问题。但用户尚未在本轮明确确认全部司机、导游、游客与 Operations 设备均已暂停，且浏览器中仍保留 JTW Staff/Operations 页面，因此维护窗口尚未正式成立。

本轮未 commit、未 push、未执行 Test migration、未构建 Artifact、未部署 Test。Production 未访问、未部署、未写入；仅核对 Stripe Test 状态，未使用 Live Stripe。
