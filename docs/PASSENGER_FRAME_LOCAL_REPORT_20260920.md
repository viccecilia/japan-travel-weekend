# 游客端主框架收口：本地验收报告
日期：2026-09-20

## 1. 基线与边界
HEAD：5f50eca2a86c846158051c97b340921ff1671ca6
分支：feature/production-app-foundation
正式目录：C:/Users/pangv/Documents/Codex/2026-08-21/japan-travel-weekend-production-work/work/japan-travel-weekend
未提交、未推送、未部署。现有照片组件及素材保留，两个照片组件 SHA256 与开始时一致。构建包含本轮未提交修改及用户照片修改，不等于纯 GitHub HEAD。

## 2. 修改文件
- src/app/App.tsx：普通页面通知铃铛、底栏消息路径；精选线路顺序；订单筛选、真实卡片链接及详情错误恢复；资料区合并。
- src/app/discover.css：28×50 边缘胶囊、统一上滑胶囊、底栏收紧及精选线路局部样式。
- src/app/PassengerMessages.tsx、src/app/passengerFrame.css：真实本车群入口、锁定/开放/关闭/空/错误状态，以及作用域限定的游客界面样式。
- src/app/auth.tsx、src/router/Router.tsx：新增受保护的 /app/messages，不改认证实现。
- src/shared/integrations/supabaseProduction.ts：本人订单读取附带班次时间、状态及路线 slug，沿用 RLS。
- src/app/operations/DiscoverManager.tsx、discoverManager.css、src/shared/integrations/supabaseOperations.ts：此前删除小批，保留并回归。
- supabase/migrations/20260920070417_delete_discover_hero.sql、supabase/migration-lock.json、scripts/restore-preflight.mjs：删除 RPC 及迁移登记。
- tests/passengerFrameBehavior.test.tsx、tests/discoverBehavior.test.tsx、tests/passengerNavigation.test.tsx、tests/productionCopy.test.tsx。
- scripts/passenger-frame-browser-check.js、scripts/verify-discover-delete-rollback.mjs。
- docs/DISCOVER_DELETE_LOCAL_REPORT_20260920.md、本报告。

## 3. Migration
唯一新增：20260920070417_delete_discover_hero.sql，第153项。
未部署。数据库验证在事务内安装函数并执行后 ROLLBACK，随后确认函数与临时 Hero 均不存在，不写迁移历史，不删除 Storage。

## 4–6. 自动验证
- 6 个 targeted test 文件，59 项通过：passengerFrameBehavior、discoverBehavior、passengerNavigation、productionCopy、restoreManifest、restorePreflight。
- npm run typecheck：通过（包含前后端类型检查）。
- npm run build：通过；既有 >500 kB 分包警告保留。
- 本轮新增及其他受影响文件 lint 通过；App.tsx 的12项和 auth.tsx 的1项为 HEAD 已有问题，按规则与消息逐项比对无新增。未关闭规则，未扩展到支付等既有模块清理。
- 当前产物：index-CpXBdyhh.js、index-C4pxaM_-.css。

## 7. 本地入口
- http://127.0.0.1:5188/app
- http://127.0.0.1:5188/app/trips
- http://127.0.0.1:5188/app/orders
- http://127.0.0.1:5188/app/messages
- http://127.0.0.1:5188/app/profile
- http://127.0.0.1:5188/app/operations/marketing
使用真实隔离游客和运营会话，非预览身份。游客已通过退出按钮退出；再次查看受保护页面需登录。运营会话仍保留。未更改密码。

## 8. 实际截图与浏览器结果
全部路径位于正式目录 output/playwright：
- frame-discover-390.png / frame-discover-430.png
- frame-trips-390.png / frame-trips-430.png
- frame-orders-390.png / frame-orders-430.png
- frame-messages-390.png / frame-messages-430.png
- frame-profile-390.png / frame-profile-430.png
- frame-profile-full-390.png / frame-profile-full-430.png
- frame-order-detail-430.png
- frame-admin-delete-1366.png

390×844、430×844：五页无整体横向溢出，底栏唯一选中。Discover 28×50 胶囊、标题淡出、触摸恢复、CTA、上滑到线路实测通过。VIP 在线路前，团体咨询在全部线路后。订单筛选、点击真实详情、返回及刷新保留筛选通过。截图已人工查看代表性 Discover、线路、资料及后台删除按钮。

重要缺口：当前测试游客群为 open / closed，没有 frozen 场景，消息截图是实际开放状态，不能当作 locked 截图。锁定、禁用输入、错误指定团不回退其他团等已通过组件行为测试；真实锁定群浏览器截图尚未取得。

## 9. 订单点击原因、修复与待付款边界
真实订单 b87400ad-847b-4a0d-9b67-f56d8816d683 的历史账单 grossAmountJpy 为 null。详情对其直接调用 toLocaleString 导致 TypeError 与白屏，并非链接未跳转。
已加金额类型保护，缺失显示“待确认”，不伪造0元；读取失败独立提示并可重试。整卡采用真实订单ID链接。该订单修复后详情实测通过；另一真实订单 d56befaa-1962-4f47-96bd-6c7dedaf9556 完成详情/返回/刷新筛选验证。

待付款“去支付”未闭环：现有 CheckoutRequest 仅有 departureId、seats、idempotencyKey、paymentMethod、draftId、couponId、quoteId，不支持直接传已有 orderId 恢复支付；现有 Payment 依赖报名草稿和报价上下文。本轮禁止改付款底层，因此保留查看订单/核对状态，不放会重复下单的假“去支付”按钮。需另行明确已有订单续付契约。

## 10. 本车群真实字段
复用 services.tripRoom.loadAccessibleRoom：
- get_accessible_trip_room()
- get_accessible_trip_room_by_group(p_vehicle_group)
消费 room_status、opens_at、departs_at、vehicle_group_id，不在前端重算开放时间。
frozen 显示未开放及服务端 opens_at；open 进入真实 /app/my-trip/room?vehicleGroup=...；closed 查看历史；无访问资格不切换成其他群。
数据库既有函数按 is_operations / is_group_staff / is_vehicle_group_member 校验。未修改24小时任务、状态机或权限规则。

## 11. 我的功能合并
账户中心：登录状态、邮箱、订单、行程消息、折叠的 Travelers Boost。
个人资料：显示名称、称谓、联系电话、紧急联系人姓名/电话、语言、邮箱登录信息、条款/隐私、紧凑显示和退出。
统一保存按钮顺序调用现有 updateOwnAccountProfile、updateOwnDisplayName；第二步失败明确提示部分保存并保留输入，不假装跨RPC事务成功。
隔离游客实际保存虚构名称“界面验收测试”、联系人“隔离测试联系人”、占位测试电话后刷新读回通过；未改真实游客资料。测试资料保留在该隔离账号。退出后到登录页通过。

## 12. Discover 删除验证
数据库真实回滚测试：
- operations 当前版本删除成功；
- passenger / anon：42501 拒绝；
- stale version：40001 拒绝，当前行保留；
- 删除后 public RPC 无该 Hero；
- 重复删除：40001；
- RLS 保持开启，authenticated 无直接表 DELETE；
- 不调用 Storage。
组件验证删除后列表移除、清空编辑器、“已删除”、取消不调用、失败可重试通过。
后台真实登录已取得删除按钮截图；未部署新 RPC，未在浏览器删除既有 Hero，不能声称线上删除验收完成。

## 总结
本地代码与针对性测试完成大部分要求，当前不是全部验收通过。
待付款续付及真实 locked 群截图仍未闭环；删除线上实操待迁移发布授权。
等待人工验收，不自动提交、push 或部署。
