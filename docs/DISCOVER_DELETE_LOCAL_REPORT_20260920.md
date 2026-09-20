# Discover 删除项目：本地完成报告

日期：2026-09-20。基线：5f50eca2a86c846158051c97b340921ff1671ca6。
正式工作区 / feature/production-app-foundation；本批未提交、未 push、未部署。

## 修改文件

- src/app/operations/DiscoverManager.tsx：编辑区底部删除按钮、指定二次确认文案、请求中禁用、成功移除选中项并清空编辑区、显示“已删除”；失败保留输入；未保存的新项目不调用删除 RPC。
- src/app/operations/discoverManager.css：仅 Discover 删除按钮的低调危险操作样式。
- src/shared/integrations/supabaseOperations.ts：deleteDiscoverHero，传递 ID 和当前版本；版本冲突反馈。
- supabase/migrations/20260920070417_delete_discover_hero.sql：新增 delete_discover_hero(uuid,integer)。复用 is_operations；限制执行角色；与保存相同的 advisory lock，加行锁校验版本；仅删除 discover_heroes 记录，不调用 Storage。
- scripts/restore-preflight.mjs：登记新增迁移，旧链不变。
- supabase/migration-lock.json：登记新增迁移 SHA256，不修改历史迁移哈希。
- tests/discoverBehavior.test.tsx：删除成功、取消确认、失败保留输入及重试状态的真实组件行为测试；服务 mock 保持稳定引用，与实际服务生命周期一致。
- scripts/verify-discover-delete-rollback.mjs：实际数据库事务回滚验证。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| operations 删除当前版本 | 通过：实际 RPC 返回目标 ID |
| passenger 删除 | 拒绝，42501 |
| anon 删除 | 拒绝，42501 |
| 更新到版本 2 后用旧版本 1 删除 | 拒绝，40001；记录仍为版本 2 |
| 删除后 public RPC 查询 | 不再返回测试 Hero |
| 重复删除 | 拒绝，40001；未改变其他记录 |
| RLS / 表 DELETE 权限 | RLS 保持开启，authenticated 无直接表 DELETE 权限 |
| UI 删除成功 | 选中项移除，其余两项保留，编辑区清空，显示“已删除” |
| UI 取消 / 失败 | 取消不发请求；失败保留输入和列表，允许重试 |
| targeted tests | 3 文件、25 测试通过：Discover、restoreManifest、restorePreflight |
| typecheck | 通过 |
| build | 通过；保留既有大包体积警告 |
| 受影响 TS/JS lint、diff 检查 | 通过 |

数据库测试只使用既有隔离测试身份和随机 UUID 临时 Hero。新函数与临时行均在同一事务中回滚；回滚后再次确认新函数不存在、临时行不存在。未写入 migration history，未发布 API，也未访问或删除 Storage 文件。

用户 GuidedTourPhoto.tsx、RoutePlacePhoto.tsx 修改与素材未更改；两组件哈希与本轮开始前一致。

## 使用边界

尚未部署，因此线上与本地连接的远端数据库目前没有新删除 RPC。不能将组件测试和数据库回滚测试称为线上点击删除验收；后续获部署授权并应用迁移后才可在线使用。
未改游客 Discover 视觉/播放、产品关联、Booking、Checkout、Payment、Staff 或其他后台模块。
