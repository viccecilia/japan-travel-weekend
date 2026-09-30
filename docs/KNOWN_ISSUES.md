# 已知问题与跟踪边界

状态以当前仓库证据为准；历史报告的通过记录不替代下一次运行时核验。

## Active blockers

- 无已证实、由本治理轮新增的 active blocker。

## Known CI baseline debt

- Product Editor 仍存在以 mock/受控数据驱动的测试边界，不能替代真实 Test 人工流程。
- Passenger Frame 与 Route V2 有本地/专项验证记录；后续候选必须重新执行相应的真人与响应式验证。
- legacy policy mocks 不能作为订单 policy snapshot 的最终验收证据。
- restore / migration chain 需持续核对清单、锁定哈希和实际迁移版本；不得仅改期望数量掩盖差异。
- V7 financial fixture 与 `policy_template_id` 相关回归仍须在受控 Test fixture 中验证，不能视为真实支付或政策发布证明。

## Environment configuration

- Test `/ready` 依赖 `notificationReceiptSecret` 配置；配置不满足时表示环境依赖未就绪，不等同于 API 进程不可用。每次 release 前以实际 `/health` 与 `/ready` 响应核验。

## Release hardening

- Test 具有 versioned release、`current` symlink、preflight 和 health check；尚未确认失败后自动恢复 previous known-good release 的完整闭环。该项为 **Release Hardening Gap**，本轮不修改 deploy script。

## Resolved

- Phase 4.1：CLOSED。
- Phase 4.2：CLOSED。
- 过往 `/api/` 代理与版本可观测性问题已有修复和历史证据；仍须按 release 重新核验，而非列作当前 active issue。
