# GitHub 工作流

## Source of Truth

GitHub 是 JTW 唯一正式源码 Source of Truth。正式修复必须遵循：源码修改 → commit → GitHub → artifact → Test → QA → Production Promote。服务器目录不是正式源码编辑位置。

## 分支与提交

- 开发 branch 可由多个 worktree 安全并行使用，但一个已 checkout 的 branch 不得被另一 worktree 强占。
- milestone commit 是可追溯发布候选；治理文档、业务实现和发布操作应分开清晰记录。
- dirty workspace 必须保护；无关改动不得混入 commit；同文件混合内容使用 partial staging。
- CI 是最低基线，不替代人工 QA、真实环境验证或 Production 批准。

## 授权边界

commit、push、merge 和 Production authorization 均为 `RELEASE`。没有用户明确授权不得执行。每个 release commit 应能关联 artifact、环境 SHA、migration version 与验收证据。
