# 最终收口 Round 1：阶段验收记录

日期：2026-09-21。**部分完成，不能作为 Round 1 整体完成或 Round 2 全链路就绪报告。**

## 安全封箱 checkpoint（2026-09-21）

- 按用户要求暂停开发：本轮仅检查、更新记录、创建本地提交；允许普通push，不部署。下方“未提交/未push”描述属于封箱前阶段记录；本checkpoint由包含此记录的Git提交标识。
- 本轮重新执行：git status、git diff --check、typecheck、19个相关测试文件（106测试）、build、build:server，全部通过。保留原有前端大包警告；未宣称全仓lint通过。
- 六个新增migration及159项完整迁移清单、哈希锁保留并通过targeted校验；未应用远端migration，未执行数据库写入或支付。
- 代码与已有行为验证已完成的范围：单open群直达、一次同意、首页引导/路线卡布局、八语导航及西语翻译基础、原订单恢复付款、游客位置、司机新定位接口、临时电话权限、私有群照片基础。**不是这些业务的完整上线验收。**
- 仍需完成：ProfileInvite / PassengerMessages / PassengerChatRoom 等剩余整页八语；真实Stripe test恢复支付、回调和并发；真实Storage图片字节上传与下载；真实身份位置/电话/照片页面验收；frozen与多群场景截图及完整16项验收。Round 2尚未开始。
- 外部依赖：先前api-test就绪检查为503且notificationReceiptSecret=false，封箱未重试或改配置；后续联调需复核。
- 用户照片组件和素材不纳入此提交、未修改；截图和运行输出继续保留本地。实际构建含用户未提交照片修改，**不等同于纯GitHub构建**。
- 照片组件SHA256保持：GuidedTourPhoto.tsx `DE1FC1667399F6E25A4189047F0181D43EE936508061F132042507AE1FE636CF`；RoutePlacePhoto.tsx `FD78E1A6D066206AC29BDB601C7F631401E524BB564B579A5B07E5A134C716C4`。
- 本地页面：http://127.0.0.1:5188/app。构建资源：index-DvkIb89Y.js / index-Dcd4uURa.css。无服务器发布、无上线授权变更。

## 工作区与构建来源

- 正式目录：C:/Users/pangv/Documents/Codex/2026-08-21/japan-travel-weekend-production-work/work/japan-travel-weekend
- 分支：feature/production-app-foundation
- HEAD：ad3719c24cefd4a9b235ff799ebe548103e76082（本轮未提交）
- 未 push、未 deploy。新增迁移未持久应用远端。
- 用户 GuidedTourPhoto.tsx / RoutePlacePhoto.tsx 修改和全部素材保留；哈希与开始时一致。
- 本地产物包含本轮未提交修改及用户照片修改，**不等同于 GitHub HEAD**。
- 本次追加后的构建资源：index-DvkIb89Y.js / index-Dcd4uURa.css。
- 本地测试：http://127.0.0.1:5188/app

## 分项状态

| 项目 | 本轮修改和结果 | 尚未验收 |
|---|---|---|
| A1 单群直达 | PassengerMessages：唯一 open 群自动替换路由进入真实群；指定无权限 group 不回退另一群；多个 open 保留选择器；closed 保留历史入口。组件测试通过；真实游客会话自动进入 group f150ff2f-d54e-41c4-9a64-07ee1b32a0f2，390/430 截图 | frozen 与双 open 的真实浏览器数据场景仍待验；不能用组件 Mock 当数据库权限验收 |
| A2 游客位置 | 新增真实坐标写入，先定位再明确确认，15分钟快照共享；可停止；刷新读取共享状态。本人和本车有效 Staff 可读，其他游客、撤销派班不可读；冻结/关闭群拒绝。组件及隔离数据库行为通过 | 迁移未部署，尚未实际手机定位和跨身份浏览器验收；这是位置快照，不是持续后台定位，不产生签到或上车记录 |
| A3 Staff 位置 | 发现旧 publish_driver_location 已撤销 authenticated 权限，而群聊仍调用它。改为已有 start_driver_location_session_v2 + append_driver_location_point；未重新开放旧RPC。真实数据库验证 open 写入、frozen/closed/撤销派班及旧token拒绝 | 仍需浏览器实际定位、拒绝定位、锁屏和停止共享验收；保留现有 driving/guiding 职责矩阵，不额外赋予导游驾驶定位能力 |
| A4 群照片 | 新增独立私有 trip-chat-media、房间/消息UUID路径、5MB JPG/PNG/WebP/GIF白名单；游客/Staff共用上传组件。上传后RPC确认再生成消息；失败重试同一消息ID；认证下载为临时blob，不使用公开URL。隔离数据库权限、重复发布、冻结/关闭拒绝通过 | 尚未实际 Storage 文件字节上传、下载及刷新浏览器验收。数据库对象元数据测试不能代替真实上传。新bucket和迁移均未持久应用 |
| A5 电话 | 服务端要求本车有效Staff或operations，open/可执行/未完团，且集合active或原配置出发后联系窗口。本人付款乘客归属校验及成功访问审计保留；点击临时取号调用tel，不展示完整号码列表。数据库及调用行为测试通过 | 尚未实际手机拨号验收；打开拨号不代表接通；无真实电话呼叫 |
| B 八语言 | 新增统一八语一级导航字典；西语加入 chatLanguages、设备语言识别、8类 Staff 模板、API 类型、服务器目标白名单、数据库偏好/缓存白名单及服务 RPC | 五页面、ProfileInvite、PassengerMessages、PassengerChatRoom 仍有硬编码中文。西语外部机器翻译未实发验证 |
| C 一次同意 | 新增 migration；保留原时间戳，首次必须分别同意，后续无需重新同意；UI 隐藏已接受 checkbox 但保留法律链接 | 迁移未部署，故未在正常远端浏览器执行新保存链路；数据库已实际调用新函数并回滚 |
| D 向下引导 | 双向下 SVG；内部 SVG 2.2s/ease-in-out/5px 循环，点击区域固定；减少动态效果关闭动画；点击进入 Trips 已浏览器验证 | 本轮未重新执行上滑手势回归；手势代码未改 |
| E 两列卡 | 标题/简介/景点均最多2行；统一文本占位高度和原图片比例；390/430真实数据同排等高、无整体横向溢出 | 已截西语页面，但尚未逐项验收英/西/越长文本边界 |
| F Resume Payment | 新增 test-only POST /v1/payments/resume；列表进入原订单详情，继续支付加载原 PaymentElement。服务端本人订单、pending、有效hold、历史已确认quote，旧PI复用或同order生成替代，订单+旧PI作为供应商幂等代际键。CAS防旧响应覆盖，旧取消/失败回调不得取消替代订单。API/组件及隔离数据库测试通过 | 尚未用真实 Stripe test PI 和 webhook 完整验收；尚未多连接并发压测。数据库测试没有执行Stripe支付，不得当作已付款闭环 |

## 数据库迁移

1. 20260921011836_account_profile_consent_once.sql
   - 锁定本人 profiles 行，序列化首次写入。
   - 只对缺失 consent timestamp 要求明确同意；已有记录不可清空或覆盖。
   - 保留个人资料审计，匿名禁止。
2. 20260921011919_chat_spanish_language.sql
   - 八语偏好和消息译文约束；修复旧偏好 RPC 白名单遗漏。
   - 保持翻译 context/store 仅 service_role 执行，保留本车授权判断。

3. 20260921013345_resume_existing_order_payment.sql：历史quote/hold恢复上下文、PI比较更新和当前PI回调保护，仅service_role。
4. 20260921014034_round1_contact_window.sql：集合/配置窗口与本车电话访问审计。
5. 20260921014412_passenger_location_coordinates.sql：明确授权的15分钟坐标快照，RLS与停止/过期隔离。
6. 20260921014907_private_trip_chat_photos.sql：私有图片bucket、上传预约、发布与Storage权限。

migration-lock.json 与 restore-preflight.mjs 注册完整迁移序列及 SHA256，现为159个；没有改旧147个迁移或关闭校验。

## 已实际运行

- 2026-09-21 本次追加后的最终相关回归：19文件、106测试通过。包含原有 PassengerChatRoom、司机定位读取/停止/新会话写入、位置新鲜度、付款、照片、消息路由、翻译和迁移清单。
- 本次追加后 typecheck、前端 build、server build 均通过；新组件及测试 lint 无新增问题。全项目 lint 仍不能标通过（下述既有问题保留）。
- 司机定位旧测试曾因期待已撤销的 publish_driver_location 失败，已改为验证真实新会话及定位点RPC、15分钟时长、准确坐标和调用次数，重跑通过；没有恢复旧权限。
- 以下45测试及旧截图属于此前同一Round的阶段记录，不代表本次新增付款/照片/位置已经通过真实浏览器验收。
- npm run typecheck：通过。
- targeted tests：6文件、45测试通过。
  - passengerFrameBehavior / discoverBehavior / chatTranslation / translationBackend / restoreManifest / restorePreflight。
- npm run build：通过；仍有现存大包警告。
- npm run build:server：通过。
- 涉及文件 lint：除 App.tsx 外通过；App.tsx 11 errors + 2 warnings，和 HEAD 原代码诊断相同。
  - scripts/round1-lint-baseline.mjs 对比完整诊断和代码片段，仅归一化因插入行发生偏移的行号；没有禁用规则。
  - 这不是全项目 lint 通过。
- node scripts/verify-round1-consent-rollback.mjs --rollback-test：真实隔离数据库通过。
  - 未同意首次保存被拒；仅同意条款被拒。
  - 首次明确同意成功；后续 false/false 保存成功，两个原时间戳不变。
  - 再次 true/true 不覆盖原时间戳。
  - 西语偏好实际 RPC 写入成功。
  - 游客调用可信翻译写入被权限拒绝；匿名资料保存被权限拒绝。
  - DDL和数据在同一事务测试后全部 rollback；没有重置或创建账号。
- scripts/round1-visual-check.js：实际已登录游客，读取真实隔离数据；390/430无整体横溢，路线每行等高，双行 clamp 生效；西语导航、减少动态效果及箭头点击通过。
- git diff --check：通过。

## 截图（不是生产部署证据）

位于 output/playwright/：

- round1-discover-390.png / round1-discover-430.png
- round1-trips-390.png / round1-trips-430.png
- round1-orders-390.png / round1-orders-430.png
- round1-profile-390.png / round1-profile-430.png
- round1-messages-open-390.png / round1-messages-open-430.png
- round1-spanish-discover-430.png / round1-spanish-trips-430.png

frozen 群截图尚缺，未伪造数据替代。现有测试群中历史“完团”消息和当前开放/集合状态有不一致，未改写历史数据；单群路由通过不等于该群完整履约状态验收通过。

## 本次追加的实现契约与验证边界

- Resume API已实现上述测试模式契约；最终支付成功仍须真实供应商回执，不能由前端自行标paid。
- 私有照片路径为roomId/messageUUID/image；无覆盖、无公开URL、无自动删除。读取用认证Storage下载再生成临时blob URL，卸载时释放。发布失败的临时对象保留供同ID重试，后续孤立对象清理未纳入本轮。
- 电话RPC已改为集合/联系窗口，数据库事务验证成功；未部署，所以不能声称线上电话能力已经更新。
- 本地 /api 原先没有代理而返回HTML，现与 /api-test 一并指向现有测试API。api-test /ready 仍503，notificationReceiptSecret=false；这是外部测试提醒配置问题，不能当作付款或其他流程通过。
- 支付环境文件未改。本地 VITE_STRIPE_MODE=test，VITE_LIVE_PAYMENTS_ENABLED=false；没有打开生产授权。JTW_STRIPE_MODE 在检查的 server test 文件未显式配置，需在恢复付款实现时明确核验运行时，不能仅凭前端 test 声称服务端安全门已全部验收。

## 修改文件

- src/app/App.tsx、Discover.tsx、PassengerMessages.tsx、discover.css
- src/shared/i18n/passengerFrame.ts
- src/shared/services/chatTranslation.ts
- src/shared/backend/productionServices.ts、testApi.ts
- src/shared/integrations/supabaseProduction.ts
- server/translation.ts
- 上述6个 migrations、supabase/migration-lock.json、scripts/restore-preflight.mjs
- tests/passengerFrameBehavior.test.tsx、chatTranslation.test.ts、translationBackend.test.ts
- scripts/verify-round1-consent-rollback.mjs、round1-visual-check.js、round1-lint-baseline.mjs
- 本记录

## 下一批顺序

1. B：剩余页面和组件全八语接线，尤其ProfileInvite、PassengerMessages、PassengerChatRoom；不以导航和新增控件翻译代替整页完成。
2. F：真实Stripe test恢复支付与回调、并发验证；A2–A5：真实Storage字节上传、位置和电话浏览器验收。
3. 完整16项验收与 frozen/open截图，最后重新执行必要门禁。
4. Round 1未整体通过前不开始Round 2。当前还有本地开发未完成项，不能全部标成外部阻塞。

## 新增文件与实测命令

- server/api/resumePayment.ts、src/app/ResumeOrderPayment.tsx、src/shared/i18n/resumePayment.ts。
- src/app/PassengerLocationShare.tsx、src/shared/i18n/locationShare.ts。
- src/app/ChatPhoto.tsx、src/shared/i18n/chatPhoto.ts。
- src/shared/services/contactPassenger.ts；TripRoom、PassengerChatRoom及Supabase适配器接线。
- tests/resumePayment.test.ts、resumeOrderPayment.test.tsx、contactPassenger.test.ts、tripRoomDriverLocation.test.ts、passengerLocationShare.test.tsx、chatPhoto.test.tsx。
- scripts/verify-resume-payment-rollback.mjs --rollback-test：实际隔离DB历史金额、原订单/库存、过期/付款/退款/取消/版本比较/旧回调及非服务端权限拒绝通过。
- scripts/verify-round1-contact-rollback.mjs --rollback-test：实际隔离DB电话/定位/照片权限与消息frozen/closed拒绝通过。照片部分只插入事务内Storage对象元数据，明确不是文件上传通过。
- 两脚本均限制既有隔离项目且 finally rollback；未创建、重置账号，未启用真实资源，未调用外部通知。恢复账号缺少资源时改用已有D01测试资源，仅在事务内新建虚构派班；导游职责验证不是独立导游登录验收。
- 新增组件lint通过；TripRoom原有ui依赖warning仍在；App.tsx与HEAD相同11 errors/2 warnings，没有新增诊断，未隐藏规则。

以上剩余项是**尚未完成的开发/验证**，不是一概归因于外部配置阻断。
