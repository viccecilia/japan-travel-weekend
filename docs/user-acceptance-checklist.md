# 真实用户验收清单

## 外部测试服务

- Supabase 001／002／003 迁移远程执行：PASS。
- 只读结构验收：PASS（17 个 public tables、17 个 RLS tables、15 个 public policies、2 个 Realtime policies、3 个 Storage policies、4 个 membership helpers、1 个 auth trigger、1 个 private bucket）。
- 四个虚构角色登录及订单本人／无关乘客／司机／运营 RLS 读取矩阵：PASS。
- 冻结群拒绝订单本人写入、临时开放允许本车订单本人写入、开放群仍拒绝无关乘客：PASS。
- 私有 Storage 新文件上传和读取隔离：PASS；同名对象 upsert 因无 UPDATE policy 按预期失败。
- Realtime WebSocket 收发、库存远程并发、库存锁过期支付补偿和 Stripe Webhook 远程联调：NOT RUN。

- Supabase 迁移按顺序执行一次；只读验收脚本可重复执行。
- 并发最后一席和重复 idempotency key 当前仅本地域模型 PASS，远程数据库行为 NOT RUN。
- Stripe 测试 Webhook 的伪造签名、去重和乱序当前仅本地 PASS，远程 NOT RUN；禁止 live key。
- Google Maps 浏览器 key 已限制网站来源和 API；无 key/坐标时明确显示不可用。
- 远程行为测试只使用虚构角色和测试文件；完成阶段验收后按测试数据保留策略清理。

## 当前可完整验收

- 简体中文网站与 App、单一可用语言选择器、所有正式空状态。
- development/demo 的完整选班次、成人／儿童、乘客与特殊需求、Checkout、模拟支付、订购成功、3 秒跳转、订单详情、我的行程和冻结 Trip Room。
- 儿童安全座椅数量限制与确认中状态；婴儿车、轮椅／行动协助、大件行李、服务犬等摘要和隐私隔离。
- Sequential Fill、一车一群、位置默认关闭、工作人员最小必要授权。
- production 不加载种子、不启用账户／支付／地图／通知假能力，保持 noindex。

## 需要外部凭证或正式配置后验收

- 云数据库、正式 API、账户邮件验证、密码重置、安全 Cookie 和数据删除流程。
- 正式 Departure 日期、时间、地址、价格、库存、政策和运营联系人。
- 支付商户、Webhook、对账、取消退款与争议流程。
- 地图坐标、导航供应商、GPS 授权和位置保留策略。
- 正式 Boarding Pass 签名、工作人员扫描设备、重复扫描与离线流程。
- 邮件／短信／推送供应商、模板、退订、失败重试和费用批准。
- 法律文本、保险／许可陈述、无障碍承诺、图片授权、安全与隐私评估。
- 监控、备份、恢复、容量、渗透测试和最终移除 noindex 的发布批准。
