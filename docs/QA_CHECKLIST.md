# 人工 QA 清单

每次 Test 候选和 Production Promote 前，记录 artifact/release ID、frontend SHA、API SHA、migration version、测试时间与执行者。

## 覆盖矩阵

| 表面 | Desktop | 390px | 核心检查 |
|---|---:|---:|---|
| Passenger | ☐ | ☐ | auth、订单、支付、退款、政策快照、媒体、行程生命周期、Travel Moments、控制台与 network |
| Operations | ☐ | ☐ | auth、RLS、内容/媒体、订单与退款边界、路线与行程生命周期、控制台与 network |
| Driver / Guide | ☐ | ☐ | auth、RLS、任务范围、行程生命周期、媒体可见性、控制台与 network |

## 必填门禁

- ☐ 环境为 `CONSISTENT`：GitHub expected SHA、frontend SHA、API `/health` version、migration version 已核对。
- ☐ `/health` 存活、mode 和版本正确；`/ready` 的依赖状态已记录。
- ☐ 正反向认证与 RLS 场景通过；无越权读取或写入。
- ☐ 支付、退款和订单状态仅在批准的测试模式中验证；不把模拟数据视为真实收款证据。
- ☐ policy / agreement snapshot 与订单关联正确。
- ☐ 图片、竖图、横图、MP4 与音频显示/权限/失败回退正确。
- ☐ 浏览器 console 无本轮新增错误；network 无失败的关键请求或未处理的权限错误。
- ☐ Human QA 结论明确记录；Test PASS 不自动授权 Production。
