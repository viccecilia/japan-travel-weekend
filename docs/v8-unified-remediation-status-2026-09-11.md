# V7/V8 统一整改与验收清单（2026-09-11）

状态口径：`代码完成`、`隔离测试通过`、`测试环境浏览器验证`、`生产验证`严格分开。HTTP 200、静态 SQL 文本或演示账号截图均不等于真实业务链路通过。本轮禁止真实支付、退款、发券、佣金转账和生产部署。

| 工作包 | 项目 | 当前状态 | 可核验证据 | 待完成或阻断 |
|---|---|---|---|---|
| A | 后台首页及子路径统一运营权限 | 隔离测试通过 | `b555b5f`；`tests/v8AuthBoundaries.test.tsx` 覆盖首页、products、departures、run、commissions | 测试服务器五身份浏览器验收 |
| A | 游客、司导、待审批、停用账号越权拒绝 | 隔离测试通过 | 同一权限矩阵共 12 项 V8 测试 | 真实停用测试身份登录验收 |
| A | 账号切换不复用上一账号角色 | 代码完成；隔离测试部分覆盖 | 守卫结果绑定当前 email；`AppProvider` 身份变化清空订单、预订、行程房间和奖励状态 | 多独立浏览器会话联调 |
| A | 司导资料不进入游客专属页面 | 已确认缺陷；整改中 | `StaffPortal.tsx` 仍有旧 `/app/profile` 链接，未标记完成 | 改为司导端资料表单并真实保存 |
| B | 统一 OperationsLayout 与八个一级导航 | 代码完成；类型检查通过 | `c0a57b0`；桌面侧栏、顶栏账号/环境/退出、小屏抽屉 | 浏览器前后退、刷新、深链及移动截图 |
| B | 旧链接兼容 | 代码完成；待浏览器验证 | 既有 `/products`、`/departures`、`/run`、`/marketing`、`/commissions` 路由未删除 | 新模块路径和过滤参数统一 |
| C | 工作台今日概况、待办、当前异常、发车表、快捷操作 | 未完成 | — | 从真实 snapshot/RPC 按东京日期重整 |
| C | 指标同口径下钻与处理后刷新 | 未完成 | V7 仅有锚点级下钻测试，不能作为 V8 完成证据 | URL 筛选、对象详情与操作闭环 |
| D | 产品草稿预览、逐景点素材、多语言表单 | 未完成 | V7 明确标记未完成 | 只实现 ChatGPT 素材导入和展示逻辑 |
| D | 班次改期冲突、提醒与取消退款核对 | 部分代码完成；数据库未验证 | V7 受控取消迁移与专项测试 | 隔离数据库 RPC/触发器业务执行 |
| D | 司导五 Tab | V7 隔离 UI 通过 | `output/playwright/v7/*` | 三种真实司导状态、详情高亮和资料维护 |
| D | 司导推广链接入口 | 代码完成；待联调 | `/app/register` 已统一为 `/app/create-account`；专项测试 | 扫码、浏览、注册归因和二维码下载/复制反馈 |
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
