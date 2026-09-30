# JTW 长期执行规则

## 任务分类

- `DISCUSS`：讨论、方案或决策；不改文件。
- `INSPECT`：查看、检查、分析；默认只读，不改文件。
- `IMPLEMENT`：用户明确要求修改后才实施并验证。
- `RELEASE`：commit、push、merge、部署或任何 Production 变更；必须取得用户明确授权。

“看看 / 检查 / 分析”一律按 `INSPECT` 处理，除非用户明确要求修改。

## 工作区与 Git

- 默认继续当前 thread / worktree，保护已有 dirty workspace。
- 未获授权不得执行 `git reset --hard` 或 `git clean`；不得覆盖、丢弃或混入无关改动。
- commit 只包含本任务文件；同一文件含多类改动时使用安全的 partial staging。
- 可为隔离任务建立独立 branch / worktree；不得抢占已被其他 worktree checkout 的 branch。

## 执行方式

当前任务范围内的类型错误、测试失败、UI 缺陷、RPC/SQL 问题和构建错误，应自行修复、重试并继续。

仅在需要新的业务决策、机密配置、Production 权限、不可逆操作，或无法安全保护未提交工作时停下询问。所有用户报告使用中文。
