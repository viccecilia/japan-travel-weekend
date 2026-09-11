# V7/V8 统一整改与验收清单（2026-09-11）

状态口径：`代码完成`、`隔离测试通过`、`测试环境浏览器验证`、`生产验证`严格分开。HTTP 200、静态 SQL 文本或演示账号截图均不等于真实业务链路通过。本轮禁止真实支付、退款、发券、佣金转账和生产部署。

| 工作包 | 项目 | 当前状态 | 可核验证据 | 待完成或阻断 |
|---|---|---|---|---|
| A | 后台首页及子路径统一运营权限 | 隔离测试通过 | `b555b5f`；`tests/v8AuthBoundaries.test.tsx` 覆盖首页、products、departures、run、commissions | 测试服务器五身份浏览器验收 |
| A | 游客、司导、待审批、停用账号越权拒绝 | 隔离测试通过 | 同一权限矩阵共 12 项 V8 测试 | 真实停用测试身份登录验收 |
| A | 账号切换不复用上一账号角色 | 代码完成；隔离测试部分覆盖 | 守卫结果绑定当前 email；`AppProvider` 身份变化清空订单、预订、行程房间和奖励状态 | 多独立浏览器会话联调 |
| A | 司导资料不进入游客专属页面 | 隔离测试通过 | `/staff/profile` 内直接调用本人显示名 RPC；不再链接 `/app/profile`；`9a89f75` | 测试服务器真实工作人员账号保存验收 |
| B | 统一 OperationsLayout 与八个一级导航 | 代码完成；类型检查通过 | `c0a57b0`；桌面侧栏、顶栏账号/环境/退出、小屏抽屉 | 浏览器前后退、刷新、深链及移动截图 |
| B | 旧链接兼容 | 代码完成；待浏览器验证 | 既有 `/products`、`/departures`、`/run`、`/marketing`、`/commissions` 路由未删除 | 新模块路径和过滤参数统一 |
| C | 工作台今日概况、待办、当前异常、发车表、快捷操作 | 代码完成；隔离组件回归通过 | 默认工作台按 Asia/Tokyo 从真实 snapshot 聚合；`9bb2df8`、`756ead0`、`95b5a2e` | 新注册数缺少已验证接口；测试服务器浏览器验收 |
| C | 指标同口径下钻与处理后刷新 | 未完成 | V7 仅有锚点级下钻测试，不能作为 V8 完成证据 | URL 筛选、对象详情与操作闭环 |
| D | 产品草稿预览、逐景点素材、多语言表单 | 未完成 | V7 明确标记未完成 | 只实现 ChatGPT 素材导入和展示逻辑 |
| D | 班次改期冲突、提醒与取消退款核对 | 部分代码完成；数据库未验证 | V7 受控取消迁移与专项测试 | 隔离数据库 RPC/触发器业务执行 |
| D | 司导五 Tab | V7 隔离 UI 通过 | `output/playwright/v7/*` | 三种真实司导状态、详情高亮和资料维护 |
| D | 司导推广链接入口 | 代码完成；隔离静态边界测试通过 | `/app/register` 已统一为 `/app/create-account`；增加二维码下载和复制成功/失败反馈；`9a89f75` | 扫码、浏览、注册归因的真实多会话联调 |
| D | 推广佣金与提现闭环 | V7 部分完成；数据库未验证 | 迁移 119–121 与 V7 回归脚本 | 退款分项、recovery_due、并发/重试和未知打款查证 |
| E | 产品/班次/订单/登车/退款/推荐三端联调 | 未完成 | — | 独立会话、虚构数据、隔离数据库与 Stripe 测试模式 |
| E | PWA 旧版本升级 | V7 构建验证通过；真机未验证 | Workbox 排除 `/api` 与 `/api-test` | 已安装旧版本升级测试 |

## V8 指标映射表（实施基线）

| 指标名称 | 统计依据 | 默认时间范围 | 下钻路径 | 可执行操作 |
|---|---|---|---|---|
| 出游人数 | 已付款/已确认订单的实际占席人数 | 今天（Asia/Tokyo） | `/app/operations/orders?date=today&payment=effective` | 查看订单与旅客名单 |
| 班次数 | 当日未取消班次去重 | 今天 | `/app/operations/departures?date=today` | 编辑班次、取消影响预览 |
| 已配车辆 | 当日已确认车辆组去重 | 今天 | `/app/operations/dispatch?date=today&assigned=true` | 调整并确认配车 |
| 当班司导 | 当日有效工作人员派单按账号去重 | 今天 | `/app/operations/staff?date=today&onDuty=true` | 查看任务、请假和冲突 |
| 新注册人数 | `profiles.created_at` 按东京日期 | 今天 | `/app/operations/accounts?created=today` | 查看账户状态 |
| 付款订单数 | 已确认支付的订单数，不等于席位或旅客数 | 今天 | `/app/operations/orders?paidAt=today` | 查看账单和退款 |
| 付款金额 | 已确认付款流水总额，不扣退款/佣金 | 今天 | `/app/operations/orders?paidAt=today&view=billing` | 查看费用快照 |
| 已登车人数 | 幂等核销后唯一旅客计数 | 今天 | `/app/operations/run?date=today&status=boarded` | 查看核销记录 |
| 待配车 | 达到配车阶段且无确认车辆组的班次 | 今天及未来7天 | `/app/operations/dispatch?status=unassigned` | 自动规划、人工调整 |
| 待退款处理 | 未终结退款申请数 | 全部未结事项 | `/app/operations/orders?afterSale=refund_pending` | 审核、执行或补证 |
| 待大使审核 | `ambassador_qualifications` 待审核申请数 | 全部未结事项 | `/app/operations/commissions?queue=ambassador` | 批准、拒绝、暂停 |
| 待提现审核 | 未终结提现申请数 | 当前日本自然周及历史未结 | `/app/operations/commissions?queue=payout` | 审核、查证、记账 |

实际实现必须让卡片和目标列表复用同一查询条件；表中路径若尚未建立，保持“未完成”。

## 管理端实际检查 8 项对照

| 验收项 | 修改位置 | 实际验收结果 | 证据 |
|---|---|---|---|
| 1. 后台子页与权限隔离 | `src/app/auth.tsx`、`tests/v8AuthBoundaries.test.tsx` | 隔离路由测试通过；真实测试服务器五身份尚未验收 | `b555b5f`；12 项 V8 权限测试 |
| 2. 约 18,018px 首页拆分 | `OperationsDashboard.tsx`、`operations/SystemSettings.tsx` | 默认首页已改为仅渲染今日概况、待办、当前异常、当日发车和快捷操作；档案及长列表仍通过模块参数访问 | `6752e72`、`9bb2df8`；浏览器高度对比待补 |
| 3. 1363px 横向溢出 | `styles.css`、`OperationsLayout.tsx` | 已增加全部布局节点 `min-width:0/max-width:100%`、中文菜单不换行、表格区域滚动约束；1363px 浏览器像素验收待补 | `6752e72`；实际截图待补 |
| 4. 测试账号与环境移入设置 | `operations/SystemSettings.tsx`、`Router.tsx` | 代码完成，首页已删除两块；设置页区分加载、读取失败和真实状态 | `6752e72`；真实登录截图待补 |
| 5. 未来履约与历史告警 | `OperationsDashboard.tsx` | 已过去班次不再进入未来统计/未来履约；历史班次单列并保留 | `6752e72`、`9bb2df8`；认领、处理记录和归档尚未完成 |
| 6. 八导航、下钻与刷新 | `OperationsLayout.tsx`、`OperationsDashboard.tsx` | 八个一级导航共用布局；部分卡片带日期/队列参数；对象详情和操作返回刷新尚未全部完成 | `c0a57b0`、`9bb2df8`；未标记完整通过 |
| 7. 清理旧推荐奖励规则 | `App.tsx`、`OperationsDashboard.tsx`、`StaffPortal.tsx` | 中文、英文及等级权益已改为首单基础票价10%现金、完成且无退款争议后解锁、每日本自然周提现一次；历史推荐人券明确只作存量权益核对 | `9a89f75`；数据库结算链路仍待隔离实测，不标记业务闭环通过 |
| 8. 三独立会话六条联动 | 游客、司导、运营与隔离数据库 | 尚未执行 | 未完成，不通过 |
