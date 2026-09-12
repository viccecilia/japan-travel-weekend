# V11 实施与验收状态（2026-09-12）

## 基线与边界

- 正式工作区：`C:\Users\pangv\Documents\Codex\2026-08-21\japan-travel-weekend-production-work\work\japan-travel-weekend`
- 分支：`feature/production-app-foundation`
- V11 开始时 HEAD：`d6f8480138fe1680fb90a1706c3b6e811c5bd9e4`
- Demo 仅从独立审查目录读取，未复制进正式应用。
- 用户未提交的 `GuidedTourPhoto.tsx`、`RoutePlacePhoto.tsx` 和素材未被覆盖或纳入本批提交。

## 第一批：后台独立模块基础

| 项目 | 状态 | 实现与证据 |
|---|---|---|
| 工作区、远端、修改保护核查 | 自动验证通过 | 已核对目录、分支、HEAD、origin 与工作区清单。 |
| V11 全部说明文档读取 | 自动验证通过 | 已读取 `START-HERE.md` 及 `docs/01` 至 `docs/07`。 |
| 司导档案独立页面 | 自动验证通过 | `/app/operations/staff`；读取 `loadSnapshot`，支持搜索与 `updateDriverResource` 保存。 |
| 车辆档案独立页面 | 自动验证通过 | `/app/operations/vehicles`；读取真实档案，支持搜索与 `updateFleetVehicle` 保存。 |
| 申请与请假独立页面 | 自动验证通过 | `/app/operations/staff-requests`；复用工作人员及请假审批 RPC。 |
| 后台导航改用上述独立路由 | 自动验证通过 | 路由、导航和组件测试共 7 项通过；TypeScript 检查通过。 |
| 真实管理员浏览器实操 | 阻塞 | 2026-09-12 使用安全配置中的运营测试身份登录测试站，实际停留在 `/app/login?returnTo=%2Fapp%2Foperations%2Fstaff` 并显示“登录失败”；同一配置执行远程权限 RPC 亦失败。未重置密码、未修改真实人员/车辆、未审批真实申请。 |

## 第二批：订单售后与逐车配车

| 项目 | 代码 | 自动测试 | 数据库 | 浏览器 | 部署 |
|---|---|---|---|---|---|
| 独立订单售后路由 `/app/operations/orders` | 已完成 | TypeScript 与组件约束测试通过 | 复用现有 `loadSnapshot`/退款数据 | 待有效管理员身份 | 待部署 |
| 逐辆配车（车辆→司机→人数→下一辆） | 已完成 | 覆盖45席计划40人、超计划、超单车容量、停用及重复资源 | 复用 `operations_save_dispatch_plan` 的角色、可用性、车型、冲突和幂等边界；本轮未在隔离库实际执行 | 待有效管理员身份 | 待部署 |
| 真实人员车辆保持停用 | 已保护 | 未在浏览器或数据库修改任何真实档案 | 未执行写操作 | 未执行写操作 | 不适用 |
| 受限演示数据加入/清除 | 未完成 | 未完成 | 缺少可登录的隔离游客/司导/运营测试身份，不能安全创建正常权限链订单 | 未验证 | 未部署 |

## 第三批：经营 Dashboard 与推荐关系分析

| 项目 | 代码 | 自动测试 | 数据库 | 浏览器 | 部署 |
|---|---|---|---|---|---|
| 周/月/季度/年经营 Dashboard | 已完成基础版 | 日本周一至周日、跨年季度及日期下钻测试通过 | 当前复用运营班次投影；尚未增加按支付发生日的专用历史聚合 RPC | 待有效管理员身份 | 待部署 |
| 指标下钻 | 已完成基础版 | URL 日期范围会在订单中心实际过滤班次，不只是展示参数 | 尚未在隔离库核对大数据分页口径 | 待验证 | 待部署 |
| 推荐关系树 | 已完成基础版 | 直接关系和下游数量分开测试；页面明确下游仅分析 | 复用现有推荐关系与佣金汇总，未改佣金计算函数 | 待验证 | 待部署 |
| 渠道转化与完整财务追溯 | 部分完成 | 展示直接关系、首单付款、资格和异常 | 缺少渠道维度及关系→佣金→提现凭证的专用查询 | 未验证 | 未部署 |

## 后续任务

- 订单与售后独立页面及筛选下钻。
- 经营 Dashboard 与推荐关系树（只做单层佣金，树用于分析）。
- 受限服务端演示数据批次、幂等加入、影响预览与精准清除。
- 司机/车辆基础档案导入预览（28 人、53 车、默认停用，排除周政，12358 归栾冲）。
- 增量配车、整单分车、逐日价格日历、内容编辑、MD 翻译、VIP/接驳和三端独立身份验收。

未实操或未执行隔离数据库行为测试的项目不得视为通过。

## V11 代码审查 R1–R9 统一清单

审查来源：`JTW-V11-Code-Review-20260912.md`。本表与上方 V11 清单共同维护；后续登录浏览器发现的问题继续追加，不另建重复任务。

| 编号 | 问题 | 修改位置 | 当前结果 | 行为/数据库证据 | 状态 |
|---|---|---|---|---|---|
| R1 | 后台缺少真实订单列表与对象详情 | `OrdersCenter.tsx`、`supabaseOperations.ts`、迁移 129 的 `get_operations_orders` | 日期、状态、订单 ID 实际传入查询；列表可分页并进入订单详情，展示人数、金额、退款、推荐、车辆和司机 | 组件行为测试验证查询参数及指定订单渲染；隔离库尚未执行迁移 | 代码及自动测试完成；数据库/浏览器未验证 |
| R2 | 车辆没有实车可售容量 | 迁移 129 `fleet_vehicles.sellable_capacity`、`ResourceCenter.tsx` | 车辆档案独立维护实车容量，配车校验读取具体车辆容量，不再只看车型 | 自动测试覆盖45席车辆计划40人、46人拒绝；隔离库未执行 | 代码及自动测试完成；数据库/浏览器未验证 |
| R3 | 分车发布使用物理容量而非每车计划人数 | 迁移 129 `vehicle_assignments.planned_passengers`、最终版 `operations_save_dispatch_plan`、`finalize_dispatch_departure`、`try_allocate_paid_order` | 物理容量与计划人数分列；发布前计划人数总和必须等于已承诺席位；整单按每车计划剩余人数分配且不拆单 | 草稿构造行为测试验证 capacity=45、passengerCount=40；最终数据库函数已在迁移末端重定义，但隔离库执行待补 | 代码及自动测试完成；数据库未验证 |
| R4 | Dashboard 日期未传后端且默认范围截断 | `AnalyticsCenter.tsx`、`loadSnapshot(from,to)`、迁移 129 `get_operations_dashboard_departures` | 周/月/季/年东京日期范围传入 RPC，不再依赖 -30/+365 默认窗口 | 组件行为测试验证年度范围实际传给数据层 | 代码及自动测试完成；数据库/浏览器未验证 |
| R5 | 下钻参数只写 URL 未参与查询 | `OrdersCenter.tsx`、`listOrders`、`get_operations_orders` | `from`、`to`、`status`、`order` 已参与订单查询；班次快照同步使用日期范围 | 组件行为测试覆盖四个参数；`metric`、大使和推荐关系筛选尚未全部接入 | 部分完成 |
| R6 | 推荐关系树依赖姓名/邮箱拼接 | `AnalyticsCenter.tsx`、现有推荐汇总 RPC | 当前仍为展示层基础树，稳定账号 ID 与渠道层级查询尚未补齐 | 未有数据库行为证据 | 未完成 |
| R7 | 账户权限 RPC 失败时永久加载 | `auth.tsx` 待整改 | 尚未修改 | 尚未测试网络错误/服务不可用 | 未完成 |
| R8 | 后台菜单可能重复高亮 | 现有 OperationsLayout/专属订单路由 | 独立订单路由已减少旧综合页匹配冲突；尚需真实浏览器逐项点击复核 | 路由测试已有，登录后浏览器验收尚未完成 | 部分完成 |
| R9 | 行程结束时间固定加12小时 | `OperationsDeparture.endsAt`、Dashboard RPC、`buildDispatchPlanDrafts` | 优先使用数据库班次 `ends_at`；仅旧数据缺失时兼容回退 | 行为测试验证真实结束时间进入派车草稿 | 代码及自动测试完成；数据库/浏览器未验证 |

### 本批数据库函数最终生效顺序

迁移 129 在当前迁移序列末端重定义 `operations_save_dispatch_plan`、`finalize_dispatch_departure`、`try_allocate_paid_order`、`get_operations_dashboard_departures`，并新增 `get_operations_orders` 与 `operations_update_fleet_vehicle_v2`。源码层已确认这些是仓库中最后定义；只有隔离数据库实际应用迁移并执行业务 RPC 后，才可标记数据库通过。
