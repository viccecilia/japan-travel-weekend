# 数据模型

正式业务链路为：Trip（行程）→ Departure（出发班次）→ Seat Booking（座位预订）→ Passenger（乘客）→ Order（订单）→ Vehicle Assignment（车辆分配）→ Vehicle Group（车辆群组）→ Staff Assignment（工作人员分配）→ Trip Room（行程房间）→ Boarding（登车）→ Completed（已完成）。

Trip 是可浏览产品；Departure 才包含日期、库存和价格。座位预订记录人数，乘客资料与订单分开。订单支付确认后进入运营分车。每个 Vehicle Assignment 唯一对应一个 Vehicle Group；司机与司导通过 Staff Assignment 进入该组；Trip Room 必须以 groupId 做读写隔离。登车完成并不等于行程完成，只有运营确认 Completed 才触发完成类奖励。

当前 `TravelRepository` 为内存实现。后端接入时保持接口稳定，并在服务端完成身份、车辆群组、字段级权限和审计校验。
