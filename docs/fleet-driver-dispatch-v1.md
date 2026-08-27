# 自动配车、司机推荐与柚子调度接口 V1

## 范围

第一版只实现可测试的领域逻辑和可替换接口，不调用真实柚子调度、不发送真实司机任务、不保存生产司机资料。日游默认不以普通行李作为配车变量；轮椅、儿童座椅或明确申报的特殊设备仍必须由运营审核。

## 两阶段规划

1. `optimizeFleet` 在配车冻结前根据乘客人数、业务可售客席、可用车辆数量和相对成本，选择满足容量且总成本最低的车辆组合；成本相同则优先车辆更少，再优先空席更少。
2. 车辆组合确定后按容量从大到小执行 Sequential Fill：Vehicle 1 装满后才进入 Vehicle 2。配车冻结后不得自动重排已满车辆或已通知乘客的 Vehicle Group。

集中演示配置为 Alphard 6席、Hiace 13席、Coaster 20席和大型巴士55席；Coaster可售客席与全部成本单位仍为运营待确认参数，不是报价。当前相对成本只用于验证 6→Alphard、12→Hiace、20→Coaster、50→大巴、70→大巴+Coaster 的业务选择。

## 司机推荐

司机资料包含内部ID、柚子司机ID、可驾驶车型、语言、可用时间、停用状态和已有任务时间窗。推荐必须同时满足车型资格、完整覆盖任务时间且没有冲突；同一批车辆不能重复使用同一司机。语言匹配用于候选排序，系统只给出推荐，运营确认后才能派单。

## 柚子调度 Adapter

`server/dispatch.ts` 定义 `DispatchProvider`：

- `createTask(input)`：创建任务，强制携带幂等键。
- `getTask(externalTaskId)`：查询状态。
- `cancelTask(externalTaskId, idempotencyKey)`：取消任务。

状态预留 `draft / sent / delivered / viewed / accepted / rejected / en_route / arrived / passengers_onboard / in_progress / completed / cancelled / failed`。`MemoryDispatchProvider` 用于本地验收；`UnavailableDispatchProvider` 在未配置时失败关闭；`YuzuDispatchHttpAdapter` 只接受 HTTPS、服务端令牌、8秒超时和幂等请求。

预留的柚子侧约定为：

```text
POST /v1/tasks
GET  /v1/tasks/{externalTaskId}
POST /v1/tasks/{externalTaskId}/cancel
```

任务只发送车辆分配ID、柚子司机ID、车型、起止时间、集合信息、人数和必要履约备注。不得发送乘客姓名、邮箱、电话、聊天、照片、位置历史或特殊需求原文。未来取得柚子API文档后，通过映射层适配真实字段，不修改配车和司机推荐领域逻辑。

## 正式接入前门禁

- 柚子测试地址、认证方式、司机ID映射和状态字典获批。
- Webhook签名、防重放、重试、失败队列和审计日志完成。
- 运营角色权限与二次确认完成；浏览器不得持有柚子服务端令牌。
- 创建、改派、取消和重复请求在隔离测试环境通过。
