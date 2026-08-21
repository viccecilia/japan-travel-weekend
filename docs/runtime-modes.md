# 运行模式

`production` 是正式构建默认模式：种子数据强制关闭，repository 返回空的运营数据，页面展示正式空状态。`development` 用于本地开发，默认读取集中种子；可用 `VITE_ENABLE_SEED_DATA=false` 关闭。`demo` 是显式演示／预览模式，同样从集中种子读取。

种子只能位于 `src/shared/data/seed.ts`。任何 production 代码不得自动制造 Tomorrow Trip、Sample Departure、司机、倒计时、聊天、订单、价格、余位、距离或实时信息。
