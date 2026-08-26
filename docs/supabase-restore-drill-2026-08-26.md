# Supabase clean-room 恢复演练证据（2026-08-26）

## 范围与隔离

- 目标：全新可丢弃项目 `japan-travel-weekend-restore-test`，project ref `hzxoofvodpqpdomtmzlf`，东京 `ap-northeast-1`，Free。
- 当前 Japan Travel Weekend 测试项目和已暂停旧项目均受预检保护，未被连接、清空或恢复。
- 随机数据库密码及五个虚构账户密码只保存在 Git 忽略的本机环境文件；证据不记录任何密钥。
- 全程未使用真实个人资料、真实订单、生产 Stripe、付费套餐或新的付款方式。

## 恢复步骤与结果

1. `npm run check:restore-target`：PASS。目标 ref、URL、可丢弃确认和 20 个连续非空迁移均通过；两个现有项目 ref 明确拒绝。
2. `npm run manifest:restore`：PASS。20 个迁移与 6 个验收文件生成字节数和 SHA-256 基线。
3. 浏览器创建项目：PASS。Supabase 控制台显示东京、nano、Healthy，创建前为 0 migrations／空 Auth 用户。
4. SQL Editor 一次性载入并执行 001–020：PASS，返回 `Success. No rows returned`。网页 SQL Editor 不写 Supabase CLI migration ledger，本记录和哈希清单是本次人工执行证据。
5. 最终状态结构验收：PASS。私有 Realtime 接收策略存在、客户端直接发送策略不存在、durable 消息 RPC 存在；持久聊天、签到、RLS、publication 与配置满足检查。
6. Auth 浏览器流程：PASS。创建并自动确认两名 passenger、driver、guide、operations 共五个 `example.invalid` 虚构账户；列表显示 5 行。角色 SQL 返回 passenger 2、driver 1、guide 1、operations 1。
7. `reserve_inventory_regression.sql`：PASS，事务末尾 rollback。
8. `payment_and_compensation_regression.sql`：PASS，事务末尾 rollback。
9. `boarding_credential_regression.sql`：PASS，事务末尾 rollback。

## 演练中发现并修复

- 编辑器首次只执行了查找选区中的文件名，数据库返回语法错误且未执行迁移。清除查找状态、明确全选完整 98,423 字符后，才确认执行；没有盲目重复部分迁移。
- 原结构脚本仍要求 006 阶段的 Realtime 发送策略，与 019 已移除客户端直发的最终架构冲突。验收改为要求 1 个私有接收策略、0 个客户端发送策略和 1 个 durable RPC，并新增一致性自动测试；修正后 fresh project 返回 PASS。
- 登车凭证回归需要两名不同乘客做越权边界，最初四账户夹具不足。没有复用同一身份或降低测试标准；新增第二名虚构乘客后原脚本通过。

## 门禁结论与限制

`backup_restore_drill` 对“从版本化迁移 clean-room 重建 schema 并恢复关键行为”的范围判定 PASS。项目仍是测试环境且可丢弃，所有业务回归均回滚。

本演练没有证明 Supabase Pro PITR、供应商快照、Storage 对象或真实业务数据的备份恢复。正式保存生产数据前，仍需单独批准保留策略、RPO/RTO、加密、PITR／导出恢复和清理责任人。
