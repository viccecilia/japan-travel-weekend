# 发布流程

## 正式链路

`Implement → Local validate → Commit → Push → CI → Build artifact → Test deploy → Human QA → Production approval → Promote same artifact → Production smoke`

GitHub commit 是可追溯来源；优先只构建一次。Test 与 Production 必须使用同一 commit / artifact，而不是复制一套测试业务代码。

## 迁移顺序

`new migration → Test apply → Test validation → Production approval → Production apply`

已应用 migration 永不回改；修正必须新增 migration。Test 通过不构成 Production migration 或发布授权。

## Release metadata 与回滚

每次 Release 至少记录：commit SHA、artifact / release ID、Test frontend SHA、Test API SHA、Production frontend SHA、Production API SHA、latest migration version。

发布前后分别核对预期 SHA、已部署前端 SHA、API `/health` version、migration version，并将环境判定为 `CONSISTENT` 或 `DRIFTED`。发现 DRIFTED 时先恢复一致性，再使用该环境作测试依据。

回滚只针对已知良好的版本化 artifact；先保留证据、执行 preflight 和健康检查。Production Promote、回滚和 smoke 均属于 `RELEASE`，需要用户明确授权。
