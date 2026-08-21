# 数据模型

## Supabase 测试迁移

可执行基线位于 `supabase/migrations/202608210001_test_stack_foundation.sql`。私密乘客辅助需求与 Vehicle Group 公共数据物理分表；库存锁和支付事件分别使用唯一幂等键。该迁移尚未在远程测试项目运行。

正式业务链路为：Trip（行程）→ Departure（出发班次）→ Seat Booking（座位预订）→ Passenger（乘客）→ Order（订单）→ Vehicle Assignment（车辆分配）→ Vehicle Group（车辆群组）→ Staff Assignment（工作人员分配）→ Trip Room（行程房间）→ Boarding（登车）→ Completed（已完成）。

Trip 是可浏览产品；Departure 才包含日期、库存和价格。座位预订记录人数，乘客资料与订单分开。订单支付确认后进入运营分车。每个 Vehicle Assignment 唯一对应一个 Vehicle Group；司机与司导通过 Staff Assignment 进入该组；Trip Room 必须以 groupId 做读写隔离。登车完成并不等于行程完成，只有运营确认 Completed 才触发完成类奖励。

当前 `TravelRepository` 为内存实现。后端接入时保持接口稳定，并在服务端完成身份、车辆群组、字段级权限和审计校验。

Passenger Assistance（乘客辅助需求）附属于 Booking 和 Order，包括儿童安全座椅、婴儿车、轮椅／转移能力、无障碍车辆、升降设备、工作人员协助、大件行李和其他行动需求。它通过独立运营条件投影供未来配车读取，不进入普通 Vehicle Group 公共数据。详见 `passenger-assistance.md`。
