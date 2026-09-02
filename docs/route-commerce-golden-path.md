# 真实路线与支付前黄金路径

## 首条标准路线

`kyoto-nara-classic` 是首条标准内容路线。Web 与乘客 App 共用 `src/shared/data/trips.ts` 中的路线结构，包含标题、摘要、景点顺序、时间轴、主图/图库、步行强度、适合人群、餐食、包含/不包含、注意事项、儿童规则、辅助服务和取消规则。具体 Departure 的时间、集合点、完整地址、到达方式、照片、坐标、预计结束时间、价格及库存来自 Supabase 发布数据；空值统一显示“待确认”，不得由前端猜测。

路线内容可通过 `trips.content`、`hero_image_url` 和 `gallery` 持续维护。Departure 履约字段位于 `departures`，商业价格仍使用服务端 `seat_price_jpy`；服务端只向消费者投影已发布且开放的班次。

## 黄金路径

路线详情 → Departure → 成人/儿童/婴儿与配车人数 → 登录 → 乘客资料 → 条件式儿童座椅 → 婴儿车/轮椅/行动辅助 → 紧急联系人 → 订单核对 → 条款与取消规则 → 支付前确认 → Supabase 订单草稿。

本阶段的终点是 `booking_drafts.status=payment_not_started`。保存草稿不会调用库存锁、Stripe、银行转账或支付状态机，也不会声称已预订成功。后续支付阶段必须重新校验权威价格、库存、辅助需求可提供性及费用。

## 数据与隐私

- `passenger_private` 与 `assistance_private` 仅本人通过 RLS 读取，客户端不能直接写表，只能调用 `save_own_booking_draft`。
- RPC 从 `auth.uid()` 推导账户，不接受客户端账户 ID。
- 运营列表只读取 `get_operations_booking_drafts` 的最小投影：路线、Departure、成人/儿童/婴儿、配车人数、辅助需求摘要和审核状态。
- 运营投影不返回姓名、电话、紧急联系人、儿童年龄、轮椅尺寸/重量或自由备注。
- 草稿不写入 localStorage，也不占用正式库存。

## 取消与退款

取消时间以系统成功受理的日本时间为准：出发日前第 3 天之前全额退款，出发前 2～3 天退款 50%，出发前 1 天起原则不退款。迟到、未出现及自行离团原则不退；我方取消退还未提供服务对应款项；天气和拥堵造成顺序或停留调整不当然全退，但依法退款、解除或补偿不受排除。Stripe 区分已发起与实际到账，银行转账由人工核对。

## 外部门槛

`202609020028_route_catalog_and_booking_drafts.sql` 已在隔离测试 Supabase 完整执行并登记迁移账本。结构验收为 PASS；回滚式 authenticated 角色行为回归已验证订单本人可读、无关乘客不可读、运营仅获得人数与辅助需求安全摘要。因本机网络沙箱不允许公开客户端直连，本轮没有重新发送账户密码，不能把该回归表述为一次新的浏览器 Auth 登录。真实支付、正式价格、正式库存、集合点照片和运营发布内容仍需后续批准。

远程回归脚本为 `supabase/verification/route_booking_draft_remote_regression.sql`。它只接受固定 `TEST` slug 的临时发班，所有草稿写入在事务末尾回滚；路线与发班 fixture 必须在验收后定向清理。
