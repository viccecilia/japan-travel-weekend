# Supabase 021 运营资源恢复增量演练（2026-08-28）

## 范围

- 目标仍为可丢弃的 `japan-travel-weekend-restore-test`，未连接或清空当前测试项目及已暂停旧项目。
- 本次在已通过 001–020 clean-room 恢复的基础上应用 021，验证完整 001–021 恢复链的新增边界。
- 使用既有 operations 与 passenger 虚构账户；没有真实个人资料、订单、车辆、司机、密钥或收费。

## 结果

1. `check:restore-target`：PASS，目标 ref／URL／可丢弃确认通过，21 个迁移连续且非空。
2. `202608270021_operations_fleet_dispatch.sql`：PASS，SQL Editor 返回 `Success. No rows returned`。
3. `operations_fleet_dispatch_acceptance.sql`：PASS。4 项集中车型配置存在；7 张运营表、7 项 RLS 策略和两个 security-definer 资源函数存在。
4. operations 虚构账户创建车辆、司机、两项车型资格和一个可用时段：PASS。
5. passenger 虚构账户调用车辆创建函数被拒绝，且不能读取运营车辆：PASS。
6. 行为测试在单一事务末尾 rollback，恢复项目没有保留测试车辆或司机。
7. 恢复清单现包含 21 个迁移与 7 个验收脚本；历史 2026-08-26 证据继续说明 001–020，本文件说明 021 增量。

## 结论与限制

`backup_restore_drill` 对当前 001–021 版本化 schema、关键库存／支付／登车／运营资源行为判定 PASS。该结果仍不证明 Supabase Pro PITR、真实业务数据、Storage 对象或供应商快照恢复；正式数据保留、RPO/RTO 和灾难恢复责任仍须上线前批准。
