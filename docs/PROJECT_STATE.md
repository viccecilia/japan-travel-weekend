# JTW 项目状态

> 本文件记录当前治理基线，不替代运行时探测或发布回执。

## 源码与里程碑

- 治理分支：`codex/jtw-project-governance`（从正式里程碑分叉，仅含治理文档）。
- GitHub milestone HEAD：`eaa42a0fdd1e6239bfe5181a0b958b4ade6a1f04`。
- 最近里程碑提交：`eaa42a0`（Phase 4.2）、`007adfa`（Phase 4.1）、`ccc2f51`（内容、政策和订单快照）。
- Phase 4.1：CLOSED。
- Phase 4.2：CLOSED。
- 当前阶段：Phase 5.1-A — READY FOR HUMAN UPLOAD。

Phase 5.1-A 尚未形成 GitHub milestone；不得表述为已经提交或已进入正式发布链。

## Test 基线

- Test 前端 release：`jtw-github-eaa42a0-phase51-media-20260929-r4`。
- Test API version：`eaa42a0fdd1e6239bfe5181a0b958b4ade6a1f04`；mode：`test`。
- 仓库最新迁移文件：`20260929060000_phase42_monthly_candidates.sql`。实际 Test migration version 必须由该环境的只读版本探测确认，不以文件名推定。
- Test Storage 中已有真实横图、竖图和 MP4；它们是待人工审核、可晋升的资产，禁止清理。

## Production 状态与下一步

Production 未在本治理轮访问、验证或变更。下一步为：完成人工上传与媒体审核；以同一 commit/artifact 部署 Test；完成人工 QA；在取得明确授权后才 Promote 到 Production。

重点 QA：Passenger、Operations、Driver / Guide 的桌面与 390px；认证、RLS、支付/退款、订单、政策快照、媒体、行程生命周期、Travel Moments、控制台与网络错误。
