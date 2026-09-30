# 已确定架构

本文件只记录已确定或已实现的边界；未来提案须另行标注，不得写成已交付。

## 三个产品表面

- **Passenger**：公开浏览、账户、订单、支付后的行程与乘客侧服务。
- **Operations**：内容、路线、班次、车辆、履约和运营审查。
- **Staff / Guide**：司机、导游及其受角色和任务范围约束的履约操作。

UI 守卫改善导航体验；数据访问的最终边界是服务端和 RLS。

## 内容与行程

- **Attraction** 是景点实体；**Attraction Guide** 承载景点导览；**Audio** 为导览音频；**Media Pool** 管理可复用媒体。
- **Route** 由 **RouteStop** 组成；路线专属内容与全局景点内容分离。
- Global Policy 包含 Service Time Policy、Cancellation Policy 和在下单时固化的 order agreement snapshot。

## 增长与内容机制

- Referral / Ambassador：推荐归因和大使资格遵循明确的业务规则与审计边界。
- Travel Moments：包含资格 generations、月度候选和最终快照；Phase 4.1、4.2 已关闭，但每次环境行为仍须独立验证。
